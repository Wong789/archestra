import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";

// --- Enums ---

export const EvalRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>;

export const EvalResultStatusSchema = z.enum([
  "pending",
  "running",
  "passed",
  "failed",
  "error",
]);
export type EvalResultStatus = z.infer<typeof EvalResultStatusSchema>;

// --- Tool Call Assertion (stored as parsed YAML in expected_tool_calls jsonb) ---
//
// YAML format:
//   toolCalls:
//     - tool: kubectl_get          # exact match
//       args:
//         resource: pods           # exact match
//         namespace: /prod-.*/     # regex (wrapped in /.../)
//         labels: /.*/             # present with any value
//       assert: expected           # expected (default) | forbidden
//
// Matching rules:
//   - Plain string → exact match
//   - /pattern/  → regex match
//   - Args not listed are ignored (partial match)

export const ToolCallAssertionSchema = z.object({
  tool: z.string().describe("Tool name — exact string or /regex/"),
  args: z
    .record(z.string(), z.string())
    .optional()
    .describe("Arg matchers — exact strings or /regex/ patterns"),
  assert: z
    .enum(["expected", "optional", "forbidden"])
    .default("expected")
    .describe(
      "expected = must be called (70% weight), optional = bonus (30% weight), forbidden = must NOT be called",
    ),
});
export type ToolCallAssertion = z.infer<typeof ToolCallAssertionSchema>;

export const ExpectedToolCallsSchema = z.object({
  yaml: z.string().describe("Raw YAML source for display/editing"),
  toolCalls: z.array(ToolCallAssertionSchema).default([]),
});
export type ExpectedToolCalls = z.infer<typeof ExpectedToolCallsSchema>;

// --- Static Validator Details ---

export const StaticCheckResultSchema = z.object({
  type: z.enum(["expected", "forbidden"]),
  toolName: z.string(),
  passed: z.boolean(),
  details: z.string(),
});
export type StaticCheckResult = z.infer<typeof StaticCheckResultSchema>;

export const StaticValidatorDetailsSchema = z.object({
  checks: z.array(StaticCheckResultSchema),
});
export type StaticValidatorDetails = z.infer<
  typeof StaticValidatorDetailsSchema
>;

// --- Eval Criteria (configurable per-eval, used by both auditor and observer) ---
//
// YAML format:
//   criteria:
//     - name: triage
//       description: "Did the agent correctly identify the alert type and delegate appropriately?"
//     - name: investigation
//       description: "Did the agent make sufficient and correct tool calls?"

export const EvalCriterionSchema = z.object({
  name: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9]*$/,
      "Criterion name must be camelCase alphanumeric",
    ),
  description: z.string().min(1),
});
export type EvalCriterion = z.infer<typeof EvalCriterionSchema>;

export const EvalCriteriaSchema = z.object({
  yaml: z.string().describe("Raw YAML source for display/editing"),
  criteria: z
    .array(EvalCriterionSchema)
    .min(1)
    .max(20)
    .refine(
      (arr) => new Set(arr.map((c) => c.name)).size === arr.length,
      "Criterion names must be unique",
    ),
});
export type EvalCriteria = z.infer<typeof EvalCriteriaSchema>;

// --- Dynamic Scores (replaces fixed AuditorScores/ObserverScores) ---

export const DynamicScoresSchema = z.record(
  z.string(),
  z.number().min(0).max(10),
);
export type DynamicScores = z.infer<typeof DynamicScoresSchema>;

// --- Eval Run Summary (stored in agent_eval_runs.summary jsonb) ---

export const EvalRunSummarySchema = z.object({
  totalCases: z.number(),
  staticValidator: z.object({
    passCount: z.number(),
    failCount: z.number(),
    passRate: z.number(),
    avgScore: z.number(),
  }),
  auditor: z.object({
    passCount: z.number(),
    failCount: z.number(),
    passRate: z.number(),
    avgScores: DynamicScoresSchema,
    totalTokensUsed: z.number(),
  }),
  observer: z.object({
    passCount: z.number(),
    failCount: z.number(),
    passRate: z.number(),
    avgScores: DynamicScoresSchema,
    totalTokensUsed: z.number(),
  }),
  overallScore: z.number(),
});
export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>;

// --- Drizzle-Zod Schemas ---

// Agent Evals
export const SelectAgentEvalSchema = createSelectSchema(schema.agentEvalsTable);
export const InsertAgentEvalSchema = createInsertSchema(
  schema.agentEvalsTable,
).omit({
  id: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const UpdateAgentEvalSchema = createUpdateSchema(
  schema.agentEvalsTable,
).pick({
  name: true,
  description: true,
  agentId: true,
  criteria: true,
});

export type AgentEval = z.infer<typeof SelectAgentEvalSchema>;
export type InsertAgentEval = z.infer<typeof InsertAgentEvalSchema>;
export type UpdateAgentEval = z.infer<typeof UpdateAgentEvalSchema>;

// Agent Eval Cases
export const SelectAgentEvalCaseSchema = createSelectSchema(
  schema.agentEvalCasesTable,
);
export const InsertAgentEvalCaseSchema = createInsertSchema(
  schema.agentEvalCasesTable,
).omit({
  id: true,
  evalId: true,
  organizationId: true,
  createdAt: true,
  updatedAt: true,
});
export const UpdateAgentEvalCaseSchema = createUpdateSchema(
  schema.agentEvalCasesTable,
).pick({
  name: true,
  description: true,
  input: true,
  expectedToolCalls: true,
});

export type AgentEvalCase = z.infer<typeof SelectAgentEvalCaseSchema>;
export type InsertAgentEvalCase = z.infer<typeof InsertAgentEvalCaseSchema>;
export type UpdateAgentEvalCase = z.infer<typeof UpdateAgentEvalCaseSchema>;

// Agent Eval Runs
export const SelectAgentEvalRunSchema = createSelectSchema(
  schema.agentEvalRunsTable,
);
export type AgentEvalRun = z.infer<typeof SelectAgentEvalRunSchema>;

// Agent Eval Run Results
export const SelectAgentEvalRunResultSchema = createSelectSchema(
  schema.agentEvalRunResultsTable,
);
export type AgentEvalRunResult = z.infer<typeof SelectAgentEvalRunResultSchema>;
