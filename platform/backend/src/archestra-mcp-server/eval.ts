import {
  TOOL_EVAL_AUDIT_SHORT_NAME,
  TOOL_EVAL_OBSERVE_SHORT_NAME,
} from "@shared";
import { z } from "zod";
import logger from "@/logging";
import {
  defineArchestraTool,
  defineArchestraTools,
  structuredSuccessResult,
} from "./helpers";

// ===== Eval Audit Tool =====

const EvalAuditArgsSchema = z.object({
  alertName: z.string().describe("Name of the alert being investigated"),
  summary: z.string().describe("Brief summary of the investigation"),
  delegations: z
    .array(
      z.object({
        toAgent: z.string(),
        task: z.string().optional(),
      }),
    )
    .optional()
    .describe("Sub-agent delegations made during investigation"),
  toolCalls: z
    .array(z.string())
    .optional()
    .describe("Names of tools called during investigation"),
  finalResponse: z.string().describe("The final response/conclusion"),
});

const EvalAuditOutputSchema = z.object({
  triage: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  investigation: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  rootCause: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  remediation: z.object({
    score: z.number().min(0).max(10),
    reasoning: z.string(),
  }),
  passed: z.boolean(),
});

// ===== Eval Observe Tool =====

const EvalObserveArgsSchema = z.object({
  traceId: z.string().describe("Trace/session ID for the agent execution"),
  toolCalls: z
    .array(
      z.object({
        toolName: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
        result: z.string().optional(),
      }),
    )
    .describe("Tool calls from the agent execution"),
  finalResponse: z.string().describe("The agent's final response"),
});

const EvalObserveOutputSchema = z.object({
  scores: z.object({
    alertUnderstanding: z.number().min(0).max(10),
    investigationQuality: z.number().min(0).max(10),
    delegationEfficiency: z.number().min(0).max(10),
    rootCauseAccuracy: z.number().min(0).max(10),
    remediationQuality: z.number().min(0).max(10),
  }),
  analysis: z.object({
    overallAssessment: z.string(),
    missedOpportunities: z.array(z.string()),
    unnecessaryActions: z.array(z.string()),
  }),
  passed: z.boolean(),
});

const registry = defineArchestraTools([
  defineArchestraTool({
    shortName: TOOL_EVAL_AUDIT_SHORT_NAME,
    title: "Evaluation Audit",
    description:
      "Self-audit tool for agent evaluation. Call this tool at the end of an investigation to score your own performance across triage, investigation, root cause analysis, and remediation quality.",
    schema: EvalAuditArgsSchema,
    outputSchema: EvalAuditOutputSchema,
    async handler({ args }) {
      logger.info({ alertName: args.alertName }, "eval_audit tool called");

      // Score based on the structured summary provided by the agent
      const hasToolCalls = (args.toolCalls?.length ?? 0) > 0;
      const hasDelegations = (args.delegations?.length ?? 0) > 0;
      const hasResponse = args.finalResponse.length > 50;

      const triageScore = hasDelegations ? 8 : hasToolCalls ? 6 : 3;
      const investigationScore = hasToolCalls
        ? Math.min(10, 5 + (args.toolCalls?.length ?? 0))
        : 2;
      const rootCauseScore = hasResponse ? 7 : 3;
      const remediationScore = hasResponse ? 7 : 3;

      const allScores = [
        triageScore,
        investigationScore,
        rootCauseScore,
        remediationScore,
      ];
      const passed = allScores.every((s) => s >= 5);

      const result = {
        triage: {
          score: triageScore,
          reasoning: hasDelegations
            ? "Correctly delegated to specialist agents"
            : "Did not delegate to specialist agents",
        },
        investigation: {
          score: investigationScore,
          reasoning: `Made ${args.toolCalls?.length ?? 0} tool calls during investigation`,
        },
        rootCause: {
          score: rootCauseScore,
          reasoning: hasResponse
            ? "Provided substantive root cause analysis"
            : "Root cause analysis was insufficient",
        },
        remediation: {
          score: remediationScore,
          reasoning: hasResponse
            ? "Provided remediation steps"
            : "Remediation steps were missing",
        },
        passed,
      };

      return structuredSuccessResult(
        result,
        `Audit: triage=${triageScore}/10, investigation=${investigationScore}/10, rootCause=${rootCauseScore}/10, remediation=${remediationScore}/10. ${passed ? "PASSED" : "FAILED"}`,
      );
    },
  }),
  defineArchestraTool({
    shortName: TOOL_EVAL_OBSERVE_SHORT_NAME,
    title: "Evaluation Observer",
    description:
      "Observer tool for post-execution analysis of agent traces. Analyzes a complete execution trace and scores the agent across five quality dimensions.",
    schema: EvalObserveArgsSchema,
    outputSchema: EvalObserveOutputSchema,
    async handler({ args }) {
      logger.info(
        { traceId: args.traceId, toolCallCount: args.toolCalls.length },
        "eval_observe tool called",
      );

      // Heuristic scoring based on trace analysis
      const toolCount = args.toolCalls.length;
      const hasResponse = args.finalResponse.length > 50;

      const scores = {
        alertUnderstanding: hasResponse ? 7 : 3,
        investigationQuality: Math.min(10, 4 + toolCount),
        delegationEfficiency: toolCount > 2 ? 7 : 4,
        rootCauseAccuracy: hasResponse ? 7 : 3,
        remediationQuality: hasResponse ? 7 : 3,
      };

      const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
      const passed = avgScore >= 5.0;

      const result = {
        scores,
        analysis: {
          overallAssessment: `Agent made ${toolCount} tool calls. ${passed ? "Investigation was adequate." : "Investigation was insufficient."}`,
          missedOpportunities:
            toolCount < 3 ? ["Could have used more diagnostic tools"] : [],
          unnecessaryActions: [],
        },
        passed,
      };

      return structuredSuccessResult(
        result,
        `Observer: avg=${avgScore.toFixed(1)}/10. ${passed ? "PASSED" : "FAILED"}`,
      );
    },
  }),
] as const);

export const toolShortNames = registry.toolShortNames;
export const toolArgsSchemas = registry.toolArgsSchemas;
export const toolOutputSchemas = registry.toolOutputSchemas;
export const toolEntries = registry.toolEntries;
export const tools = registry.tools;
