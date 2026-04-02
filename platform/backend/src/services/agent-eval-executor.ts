import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { executeA2AMessage } from "@/agents/a2a-executor";
import { evalJudgeService } from "@/agents/subagents/eval-judge";
import db, { schema } from "@/database";
import logger from "@/logging";
import AgentEvalCaseModel from "@/models/agent-eval-case";
import AgentEvalRunModel from "@/models/agent-eval-run";
import AgentEvalRunResultModel from "@/models/agent-eval-run-result";
import AgentEvalModel from "@/models/agent-eval";
import type {
  AgentEvalCase,
  AgentEvalRunResult,
  DynamicScores,
  EvalCriterion,
  EvalRunSummary,
  ExpectedToolCalls,
  InteractionResponse,
  StaticCheckResult,
  StaticValidatorDetails,
  ToolCallAssertion,
} from "@/types";

interface ExecuteRunParams {
  runId: string;
  evalId: string;
  agentId: string;
  organizationId: string;
  userId: string;
}

interface ExtractedToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export class AgentEvalExecutor {
  static async executeRun(params: ExecuteRunParams): Promise<void> {
    const { runId, evalId, agentId, organizationId, userId } = params;

    logger.info(
      { runId, evalId, agentId },
      "[AgentEvalExecutor] Starting eval run",
    );

    try {
      await AgentEvalRunModel.updateStatus({
        id: runId,
        organizationId,
        status: "running",
        startedAt: new Date(),
      });

      const evalItem = await AgentEvalModel.findById(evalId, organizationId);
      const criteria = evalItem?.criteria?.criteria ?? null;

      const cases = await AgentEvalCaseModel.findAllByEvalId(
        evalId,
        organizationId,
      );
      const results = await AgentEvalRunResultModel.findByRunId(
        runId,
        organizationId,
      );

      logger.info(
        { runId, caseCount: cases.length, resultCount: results.length },
        "[AgentEvalExecutor] Executing cases",
      );

      for (const evalCase of cases) {
        const resultRow = results.find((r) => r.caseId === evalCase.id);
        if (!resultRow) continue;
        await AgentEvalExecutor.executeCase({
          resultRow,
          evalCase,
          agentId,
          organizationId,
          userId,
          criteria,
        });
      }

      const updatedResults = await AgentEvalRunResultModel.findByRunId(
        runId,
        organizationId,
      );
      const summary = computeRunSummary(updatedResults);

      logger.info(
        {
          runId,
          summary: {
            totalCases: summary.totalCases,
            staticValidator: {
              passRate: summary.staticValidator.passRate,
              avgScore: summary.staticValidator.avgScore,
            },
            auditor: {
              passRate: summary.auditor.passRate,
              avgScores: summary.auditor.avgScores,
            },
            observer: {
              passRate: summary.observer.passRate,
              avgScores: summary.observer.avgScores,
            },
          },
        },
        "[AgentEvalExecutor] Run completed",
      );

      await AgentEvalRunModel.updateStatus({
        id: runId,
        organizationId,
        status: "completed",
        completedAt: new Date(),
        summary,
      });
    } catch (error) {
      logger.error({ runId, error }, "[AgentEvalExecutor] Run failed");
      await AgentEvalRunModel.updateStatus({
        id: runId,
        organizationId,
        status: "failed",
        completedAt: new Date(),
      });
    }
  }

  private static async executeCase(params: {
    resultRow: AgentEvalRunResult;
    evalCase: AgentEvalCase;
    agentId: string;
    organizationId: string;
    userId: string;
    criteria: EvalCriterion[] | null;
  }): Promise<void> {
    const { resultRow, evalCase, agentId, organizationId, userId, criteria } =
      params;
    const sessionId = `eval-${crypto.randomUUID()}`;

    logger.info(
      { caseId: evalCase.id, caseName: evalCase.name, sessionId },
      "[AgentEvalExecutor] Starting case execution",
    );

    try {
      await AgentEvalRunResultModel.update(resultRow.id, organizationId, {
        status: "running",
        sessionId,
        startedAt: new Date(),
      });

      const inputText =
        typeof evalCase.input === "string"
          ? evalCase.input
          : JSON.stringify(evalCase.input);

      // 1. Invoke the agent
      logger.info(
        { caseId: evalCase.id, agentId, inputLength: inputText.length },
        "[AgentEvalExecutor] Invoking agent",
      );
      const agentResult = await executeA2AMessage({
        agentId,
        message: inputText,
        organizationId,
        userId,
        sessionId,
        source: "api",
      });
      logger.info(
        {
          caseId: evalCase.id,
          responseLength: agentResult.text.length,
          usage: agentResult.usage,
        },
        "[AgentEvalExecutor] Agent responded",
      );

      // 2. Extract tool calls from interaction logs
      const toolCalls = await getToolCallsFromSession(sessionId);
      logger.info(
        {
          caseId: evalCase.id,
          toolCallCount: toolCalls.length,
          toolNames: toolCalls.map((tc) => tc.toolName),
        },
        "[AgentEvalExecutor] Extracted tool calls from session",
      );

      // 3. Method 1: Static Validator (free, deterministic)
      const staticResult = runStaticValidator(
        toolCalls,
        evalCase.expectedToolCalls as ExpectedToolCalls | null,
      );

      // 4. Method 2: Sub-Agent Auditor (LLM, structured summary)
      const auditorResult = criteria
        ? await evalJudgeService.runAuditor({
            organizationId,
            toolCalls,
            finalResponse: agentResult.text,
            inputText,
            criteria,
          })
        : { passed: false, scores: null, score: 0, tokens: 0 };

      // 5. Method 3: Observer Agent (LLM, full trace)
      const interactions = await db
        .select({
          response: schema.interactionsTable.response,
          type: schema.interactionsTable.type,
          model: schema.interactionsTable.model,
          inputTokens: schema.interactionsTable.inputTokens,
          outputTokens: schema.interactionsTable.outputTokens,
        })
        .from(schema.interactionsTable)
        .where(eq(schema.interactionsTable.sessionId, sessionId))
        .orderBy(asc(schema.interactionsTable.createdAt));

      const observerResult = criteria
        ? await evalJudgeService.runObserver({
            organizationId,
            toolCalls,
            finalResponse: agentResult.text,
            inputText,
            criteria,
            steps: interactions.map((i) => ({
              model: i.model,
              inputTokens: i.inputTokens,
              outputTokens: i.outputTokens,
              toolCalls: extractToolCallsFromResponse(
                i.response as InteractionResponse,
                i.type,
              ),
            })),
          })
        : { passed: false, scores: null, score: 0, tokens: 0 };

      // Majority vote: passed if 2 of 3 methods pass
      const passedCount = [
        staticResult.passed,
        auditorResult.passed,
        observerResult.passed,
      ].filter(Boolean).length;
      const allPassed = passedCount >= 2;

      // Compute composite score (average of available method scores, 0–1)
      const methodScores: number[] = [staticResult.score];
      if (auditorResult.scores) {
        methodScores.push(auditorResult.score);
      }
      if (observerResult.scores) {
        methodScores.push(observerResult.score);
      }
      const overallScore =
        methodScores.reduce((a, b) => a + b, 0) / methodScores.length;

      logger.info(
        {
          caseId: evalCase.id,
          caseName: evalCase.name,
          allPassed,
          static: { passed: staticResult.passed, score: staticResult.score },
          auditor: {
            passed: auditorResult.passed,
            score: auditorResult.score,
            scores: auditorResult.scores,
            tokens: auditorResult.tokens,
          },
          observer: {
            passed: observerResult.passed,
            score: observerResult.score,
            scores: observerResult.scores,
            tokens: observerResult.tokens,
          },
        },
        "[AgentEvalExecutor] Case evaluation complete",
      );

      await AgentEvalRunResultModel.update(resultRow.id, organizationId, {
        status: allPassed ? "passed" : "failed",
        agentOutput: { text: agentResult.text, usage: agentResult.usage },
        staticPassed: staticResult.passed,
        staticScore: staticResult.score.toFixed(4),
        staticDetails: staticResult.details,
        auditorPassed: auditorResult.passed,
        auditorScores: auditorResult.scores ?? undefined,
        auditorTokens: auditorResult.tokens,
        observerPassed: observerResult.passed,
        observerScores: observerResult.scores ?? undefined,
        observerTokens: observerResult.tokens,
        overallScore: overallScore.toFixed(4),
        completedAt: new Date(),
      });
    } catch (error) {
      logger.error(
        { caseId: evalCase.id, error },
        "[AgentEvalExecutor] Case failed",
      );
      await AgentEvalRunResultModel.update(resultRow.id, organizationId, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      });
    }
  }
}

// ===== Interaction Log Parsing =====

async function getToolCallsFromSession(
  sessionId: string,
): Promise<ExtractedToolCall[]> {
  const interactions = await db
    .select({
      response: schema.interactionsTable.response,
      type: schema.interactionsTable.type,
    })
    .from(schema.interactionsTable)
    .where(eq(schema.interactionsTable.sessionId, sessionId))
    .orderBy(asc(schema.interactionsTable.createdAt));

  const toolCalls: ExtractedToolCall[] = [];
  for (const interaction of interactions) {
    toolCalls.push(
      ...extractToolCallsFromResponse(
        interaction.response as InteractionResponse,
        interaction.type,
      ),
    );
  }
  return toolCalls;
}

function extractToolCallsFromResponse(
  response: InteractionResponse,
  type: string,
): ExtractedToolCall[] {
  const toolCalls: ExtractedToolCall[] = [];

  if (type.startsWith("anthropic")) {
    const content = (response as { content?: unknown[] }).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        const b = block as { type?: string; name?: string; input?: unknown };
        if (b.type === "tool_use" && b.name) {
          toolCalls.push({
            toolName: b.name,
            args: (b.input as Record<string, unknown>) ?? {},
          });
        }
      }
    }
  } else {
    const choices = (response as { choices?: unknown[] }).choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const msg = (choice as { message?: { tool_calls?: unknown[] } })
          .message;
        if (msg?.tool_calls && Array.isArray(msg.tool_calls)) {
          for (const tc of msg.tool_calls) {
            const fn = (
              tc as { function?: { name?: string; arguments?: string } }
            ).function;
            if (fn?.name) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(fn.arguments ?? "{}");
              } catch {
                // ignore
              }
              toolCalls.push({ toolName: fn.name, args });
            }
          }
        }
      }
    }
  }

  return toolCalls;
}

// ===== Method 1: Static Validator =====
// When both required and optional assertions exist:
//   Score = requiredScore * 0.7 + optionalScore * 0.3
// When only required assertions exist:
//   Score = requiredScore
// When only optional assertions exist:
//   Score = optionalScore
// Passed = all required pass + no forbidden violations

function runStaticValidator(
  actualToolCalls: ExtractedToolCall[],
  expectedToolCalls: ExpectedToolCalls | null,
): { passed: boolean; score: number; details: StaticValidatorDetails } {
  if (!expectedToolCalls?.toolCalls?.length) {
    return { passed: true, score: 1, details: { checks: [] } };
  }

  const assertions = expectedToolCalls.toolCalls;
  const checks: StaticCheckResult[] = [];
  let hasForbiddenViolation = false;

  for (const assertion of assertions) {
    const assertType = assertion.assert ?? "expected";
    const found = actualToolCalls.some((tc) => matchesAssertion(tc, assertion));

    if (assertType === "forbidden") {
      if (found) hasForbiddenViolation = true;
      checks.push({
        type: "forbidden",
        toolName: assertion.tool,
        passed: !found,
        details: found
          ? `Forbidden tool was called: ${assertion.tool}`
          : `Correctly avoided: ${assertion.tool}`,
      });
    } else {
      checks.push({
        type: "expected",
        toolName: assertion.tool,
        passed: found,
        details: found
          ? `Found ${assertType} tool call: ${assertion.tool}`
          : `Missing ${assertType} tool call: ${assertion.tool}`,
      });
    }
  }

  const required = assertions.filter(
    (a) => (a.assert ?? "expected") === "expected",
  );
  const optional = assertions.filter((a) => a.assert === "optional");

  const requiredPassed = required.filter((a) =>
    checks.find(
      (c) => c.toolName === a.tool && c.type === "expected" && c.passed,
    ),
  ).length;
  const optionalPassed = optional.filter((a) =>
    checks.find(
      (c) => c.toolName === a.tool && c.type === "expected" && c.passed,
    ),
  ).length;

  const requiredScore =
    required.length > 0 ? requiredPassed / required.length : 1;
  const optionalScore =
    optional.length > 0 ? optionalPassed / optional.length : 0;

  let score: number;
  if (hasForbiddenViolation) {
    score = 0;
  } else if (required.length > 0 && optional.length > 0) {
    score = requiredScore * 0.7 + optionalScore * 0.3;
  } else if (optional.length > 0) {
    score = optionalScore;
  } else {
    score = requiredScore;
  }

  const passed = !hasForbiddenViolation && requiredPassed === required.length;

  logger.info(
    {
      requiredCount: required.length,
      requiredPassed,
      optionalCount: optional.length,
      optionalPassed,
      hasForbiddenViolation,
      score,
      passed,
      checks,
    },
    "[AgentEvalExecutor] Static validator result",
  );

  return { passed, score, details: { checks } };
}

function matchesAssertion(
  actual: ExtractedToolCall,
  assertion: ToolCallAssertion,
): boolean {
  if (!matchesPattern(actual.toolName, assertion.tool)) return false;
  if (!assertion.args) return true;
  return Object.entries(assertion.args).every(([key, pattern]) => {
    if (!(key in actual.args)) return false;
    return matchesPattern(String(actual.args[key]), pattern);
  });
}

function matchesPattern(value: string, pattern: string): boolean {
  const regexMatch = /^\/(.+)\/$/.exec(pattern);
  if (regexMatch) {
    return new RegExp(regexMatch[1]).test(value);
  }
  return value === pattern;
}

// ===== Run Summary =====

function computeRunSummary(results: AgentEvalRunResult[]): EvalRunSummary {
  const total = results.length;
  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

  const staticPassed = results.filter((r) => r.staticPassed).length;
  const staticScores = results
    .filter((r) => r.staticScore !== null)
    .map((r) => Number(r.staticScore));

  const auditorPassed = results.filter((r) => r.auditorPassed).length;
  const auditorScoresList = results
    .filter((r) => r.auditorScores !== null)
    .map((r) => r.auditorScores as DynamicScores);

  const observerPassed = results.filter((r) => r.observerPassed).length;
  const observerScoresList = results
    .filter((r) => r.observerScores !== null)
    .map((r) => r.observerScores as DynamicScores);

  const overallScores = results
    .filter((r) => r.overallScore !== null)
    .map((r) => Number(r.overallScore));

  const avgOf = (arr: number[]) =>
    safeDiv(
      arr.reduce((a, b) => a + b, 0),
      arr.length,
    );

  return {
    totalCases: total,
    staticValidator: {
      passCount: staticPassed,
      failCount: total - staticPassed,
      passRate: safeDiv(staticPassed, total),
      avgScore: avgOf(staticScores),
    },
    auditor: {
      passCount: auditorPassed,
      failCount: total - auditorPassed,
      passRate: safeDiv(auditorPassed, total),
      avgScores: computeAvgScores(auditorScoresList),
      totalTokensUsed: results.reduce((a, r) => a + (r.auditorTokens ?? 0), 0),
    },
    observer: {
      passCount: observerPassed,
      failCount: total - observerPassed,
      passRate: safeDiv(observerPassed, total),
      avgScores: computeAvgScores(observerScoresList),
      totalTokensUsed: results.reduce((a, r) => a + (r.observerTokens ?? 0), 0),
    },
    overallScore: avgOf(overallScores),
  };
}

function computeAvgScores(scoresList: DynamicScores[]): DynamicScores {
  if (scoresList.length === 0) return {};
  const allKeys = new Set(scoresList.flatMap((s) => Object.keys(s)));
  const result: DynamicScores = {};
  for (const key of allKeys) {
    const values = scoresList.map((s) => s[key] ?? 0);
    result[key] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return result;
}
