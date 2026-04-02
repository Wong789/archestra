import {
  createPaginatedResponseSchema,
  PaginationQuerySchema,
  RouteId,
} from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import YAML from "js-yaml";
import { z } from "zod";
import AgentEvalModel from "@/models/agent-eval";
import AgentEvalCaseModel from "@/models/agent-eval-case";
import AgentEvalRunModel from "@/models/agent-eval-run";
import AgentEvalRunResultModel from "@/models/agent-eval-run-result";
import { AgentEvalExecutor } from "@/services/agent-eval-executor";
import {
  ApiError,
  constructResponseSchema,
  EvalCriterionSchema,
  type EvalCriteria,
  type ExpectedToolCalls,
  InsertAgentEvalSchema,
  SelectAgentEvalCaseSchema,
  SelectAgentEvalRunResultSchema,
  SelectAgentEvalRunSchema,
  SelectAgentEvalSchema,
  ToolCallAssertionSchema,
  UpdateAgentEvalSchema,
} from "@/types";

const CreateCaseBodySchema = z.object({
  name: z.string(),
  input: z.unknown(),
  assertionsYaml: z.string().optional(),
});

const UpdateCaseBodySchema = z.object({
  name: z.string().optional(),
  input: z.unknown().optional(),
  assertionsYaml: z.string().optional(),
});

function parseCriteriaYaml(
  yamlStr: string | undefined,
): EvalCriteria | undefined {
  if (!yamlStr?.trim()) return undefined;
  const parsed = YAML.load(yamlStr) as { criteria?: unknown[] };
  if (!parsed?.criteria || !Array.isArray(parsed.criteria)) {
    throw new ApiError(400, "YAML must contain a 'criteria' array");
  }
  const criteria = z.array(EvalCriterionSchema).min(1).max(20).parse(parsed.criteria);
  const names = criteria.map((c) => c.name);
  if (new Set(names).size !== names.length) {
    throw new ApiError(400, "Criterion names must be unique");
  }
  return { yaml: yamlStr, criteria };
}

function parseAssertionsYaml(
  yamlStr: string | undefined,
): ExpectedToolCalls | undefined {
  if (!yamlStr?.trim()) return undefined;
  const parsed = YAML.load(yamlStr) as {
    toolCalls?: unknown[];
  };
  if (!parsed?.toolCalls || !Array.isArray(parsed.toolCalls)) {
    throw new ApiError(400, "YAML must contain a 'toolCalls' array");
  }
  const toolCalls = z.array(ToolCallAssertionSchema).parse(parsed.toolCalls);
  return { yaml: yamlStr, toolCalls };
}

const AgentEvalRunWithResultsSchema = SelectAgentEvalRunSchema.extend({
  results: z.array(SelectAgentEvalRunResultSchema),
});

const agentEvalRoutes: FastifyPluginAsyncZod = async (fastify) => {
  // ===== Eval CRUD =====

  fastify.get(
    "/api/agent-evals",
    {
      schema: {
        operationId: RouteId.GetAgentEvals,
        description: "List all agent evaluations",
        tags: ["Agent Evals"],
        querystring: PaginationQuerySchema,
        response: constructResponseSchema(
          createPaginatedResponseSchema(SelectAgentEvalSchema),
        ),
      },
    },
    async ({ query: { limit, offset }, organizationId }, reply) => {
      const result = await AgentEvalModel.findByOrganizationId(organizationId, {
        limit,
        offset,
      });
      return reply.send(result);
    },
  );

  fastify.get(
    "/api/agent-evals/:evalId",
    {
      schema: {
        operationId: RouteId.GetAgentEval,
        description: "Get a single agent evaluation",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        response: constructResponseSchema(SelectAgentEvalSchema),
      },
    },
    async ({ params: { evalId }, organizationId }, reply) => {
      const evalItem = await AgentEvalModel.findById(evalId, organizationId);
      if (!evalItem) throw new ApiError(404, "Evaluation not found");
      return reply.send(evalItem);
    },
  );

  fastify.post(
    "/api/agent-evals",
    {
      schema: {
        operationId: RouteId.CreateAgentEval,
        description: "Create a new agent evaluation",
        tags: ["Agent Evals"],
        body: InsertAgentEvalSchema.extend({
          criteriaYaml: z.string().optional(),
        }),
        response: constructResponseSchema(SelectAgentEvalSchema),
      },
    },
    async ({ body, organizationId }, reply) => {
      const { criteriaYaml, ...rest } = body;
      const criteria = parseCriteriaYaml(criteriaYaml);
      const result = await AgentEvalModel.create(
        { ...rest, ...(criteria ? { criteria } : {}) },
        organizationId,
      );
      return reply.send(result);
    },
  );

  fastify.put(
    "/api/agent-evals/:evalId",
    {
      schema: {
        operationId: RouteId.UpdateAgentEval,
        description: "Update an agent evaluation",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        body: UpdateAgentEvalSchema.extend({
          criteriaYaml: z.string().optional(),
        }),
        response: constructResponseSchema(SelectAgentEvalSchema),
      },
    },
    async ({ params: { evalId }, body, organizationId }, reply) => {
      const { criteriaYaml, ...rest } = body;
      const criteria = parseCriteriaYaml(criteriaYaml);
      const result = await AgentEvalModel.update(
        evalId,
        { ...rest, ...(criteria !== undefined ? { criteria } : {}) },
        organizationId,
      );
      if (!result) throw new ApiError(404, "Evaluation not found");
      return reply.send(result);
    },
  );

  fastify.delete(
    "/api/agent-evals/:evalId",
    {
      schema: {
        operationId: RouteId.DeleteAgentEval,
        description: "Delete an agent evaluation",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        response: constructResponseSchema(z.object({ success: z.boolean() })),
      },
    },
    async ({ params: { evalId }, organizationId }, reply) => {
      const success = await AgentEvalModel.delete(evalId, organizationId);
      if (!success) throw new ApiError(404, "Evaluation not found");
      return reply.send({ success: true });
    },
  );

  // ===== Eval Cases =====

  fastify.get(
    "/api/agent-evals/:evalId/cases",
    {
      schema: {
        operationId: RouteId.GetAgentEvalCases,
        description: "List cases for an evaluation",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        querystring: PaginationQuerySchema,
        response: constructResponseSchema(
          createPaginatedResponseSchema(SelectAgentEvalCaseSchema),
        ),
      },
    },
    async (
      { params: { evalId }, query: { limit, offset }, organizationId },
      reply,
    ) => {
      const result = await AgentEvalCaseModel.findByEvalId(
        evalId,
        organizationId,
        { limit, offset },
      );
      return reply.send(result);
    },
  );

  fastify.post(
    "/api/agent-evals/:evalId/cases",
    {
      schema: {
        operationId: RouteId.CreateAgentEvalCase,
        description: "Create a new eval case",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        body: CreateCaseBodySchema,
        response: constructResponseSchema(SelectAgentEvalCaseSchema),
      },
    },
    async ({ params: { evalId }, body, organizationId }, reply) => {
      const evalItem = await AgentEvalModel.findById(evalId, organizationId);
      if (!evalItem) throw new ApiError(404, "Evaluation not found");
      const expectedToolCalls = parseAssertionsYaml(body.assertionsYaml);
      const result = await AgentEvalCaseModel.create(
        evalId,
        {
          name: body.name,
          input: body.input as Record<string, unknown>,
          expectedToolCalls,
        },
        organizationId,
      );
      return reply.send(result);
    },
  );

  fastify.put(
    "/api/agent-evals/:evalId/cases/:caseId",
    {
      schema: {
        operationId: RouteId.UpdateAgentEvalCase,
        description: "Update an eval case",
        tags: ["Agent Evals"],
        params: z.object({
          evalId: z.string().uuid(),
          caseId: z.string().uuid(),
        }),
        body: UpdateCaseBodySchema,
        response: constructResponseSchema(SelectAgentEvalCaseSchema),
      },
    },
    async ({ params: { caseId }, body, organizationId }, reply) => {
      const expectedToolCalls = parseAssertionsYaml(body.assertionsYaml);
      const result = await AgentEvalCaseModel.update(
        caseId,
        {
          name: body.name,
          input: body.input as Record<string, unknown> | undefined,
          expectedToolCalls,
        },
        organizationId,
      );
      if (!result) throw new ApiError(404, "Eval case not found");
      return reply.send(result);
    },
  );

  fastify.delete(
    "/api/agent-evals/:evalId/cases/:caseId",
    {
      schema: {
        operationId: RouteId.DeleteAgentEvalCase,
        description: "Delete an eval case",
        tags: ["Agent Evals"],
        params: z.object({
          evalId: z.string().uuid(),
          caseId: z.string().uuid(),
        }),
        response: constructResponseSchema(z.object({ success: z.boolean() })),
      },
    },
    async ({ params: { caseId }, organizationId }, reply) => {
      const success = await AgentEvalCaseModel.delete(caseId, organizationId);
      if (!success) throw new ApiError(404, "Eval case not found");
      return reply.send({ success: true });
    },
  );

  // ===== Eval Runs =====

  fastify.get(
    "/api/agent-evals/:evalId/runs",
    {
      schema: {
        operationId: RouteId.GetAgentEvalRuns,
        description: "List runs for an evaluation",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        querystring: PaginationQuerySchema,
        response: constructResponseSchema(
          createPaginatedResponseSchema(SelectAgentEvalRunSchema),
        ),
      },
    },
    async (
      { params: { evalId }, query: { limit, offset }, organizationId },
      reply,
    ) => {
      const result = await AgentEvalRunModel.findByEvalId(
        evalId,
        organizationId,
        { limit, offset },
      );
      return reply.send(result);
    },
  );

  fastify.get(
    "/api/agent-evals/:evalId/runs/:runId",
    {
      schema: {
        operationId: RouteId.GetAgentEvalRun,
        description: "Get a run with its results",
        tags: ["Agent Evals"],
        params: z.object({
          evalId: z.string().uuid(),
          runId: z.string().uuid(),
        }),
        response: constructResponseSchema(AgentEvalRunWithResultsSchema),
      },
    },
    async ({ params: { runId }, organizationId }, reply) => {
      const run = await AgentEvalRunModel.findById(runId, organizationId);
      if (!run) throw new ApiError(404, "Eval run not found");
      const results = await AgentEvalRunResultModel.findByRunId(
        runId,
        organizationId,
      );
      return reply.send({ ...run, results });
    },
  );

  fastify.post(
    "/api/agent-evals/:evalId/runs",
    {
      schema: {
        operationId: RouteId.CreateAgentEvalRun,
        description: "Trigger a new eval run",
        tags: ["Agent Evals"],
        params: z.object({ evalId: z.string().uuid() }),
        response: constructResponseSchema(SelectAgentEvalRunSchema),
      },
    },
    async ({ params: { evalId }, organizationId, user }, reply) => {
      const evalItem = await AgentEvalModel.findById(evalId, organizationId);
      if (!evalItem) throw new ApiError(404, "Evaluation not found");
      const agentId = evalItem.agentId;
      if (!agentId) {
        throw new ApiError(400, "Evaluation has no agent assigned");
      }

      if (!evalItem.criteria?.criteria?.length) {
        throw new ApiError(
          400,
          "Evaluation has no criteria configured. Set criteria YAML before running.",
        );
      }

      const cases = await AgentEvalCaseModel.findAllByEvalId(
        evalId,
        organizationId,
      );
      if (cases.length === 0) {
        throw new ApiError(400, "Evaluation has no cases");
      }

      const run = await AgentEvalRunModel.create(evalId, organizationId);

      await AgentEvalRunResultModel.createBatch(
        cases.map((c) => ({
          runId: run.id,
          caseId: c.id,
          organizationId,
        })),
      );

      // Kick off async execution
      setImmediate(() => {
        AgentEvalExecutor.executeRun({
          runId: run.id,
          evalId,
          agentId,
          organizationId,
          userId: user.id,
        }).catch(() => {
          // Errors are handled inside executeRun
        });
      });

      return reply.send(run);
    },
  );
};

export default agentEvalRoutes;
