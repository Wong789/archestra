import { BUILT_IN_AGENT_IDS } from "@shared";
import { generateText } from "ai";
import { createLLMModel } from "@/clients/llm-client";
import logger from "@/logging";
import { AgentModel } from "@/models";
import type { DynamicScores, EvalCriterion } from "@/types";
import { resolveSmartDefaultLlm } from "@/utils/llm-resolution";

// === Exports ===

export interface AuditorResult {
  passed: boolean;
  scores: DynamicScores | null;
  score: number;
  tokens: number;
}

export interface ObserverResult {
  passed: boolean;
  scores: DynamicScores | null;
  score: number;
  tokens: number;
}

/**
 * Eval judge service — uses LLM to score agent execution traces.
 * Follows the same pattern as PolicyConfigurationService:
 * resolves LLM from built-in agent config or org-wide smart default.
 */
class EvalJudgeService {
  /**
   * Method 2: Sub-Agent Auditor
   * LLM judges a structured summary of tool calls.
   * Criteria are configurable per-eval.
   * Score = sum / (criteria.length * 10) (normalized 0-1). Passed = all scores >= 5.
   */
  async runAuditor(params: {
    organizationId: string;
    inputText: string;
    toolCalls: { toolName: string; args: Record<string, unknown> }[];
    finalResponse: string;
    criteria: EvalCriterion[];
  }): Promise<AuditorResult> {
    try {
      const model = await this.resolveModel(params.organizationId);
      if (!model) {
        logger.warn(
          { organizationId: params.organizationId },
          "[EvalJudge] No model available for auditor",
        );
        return { passed: false, scores: null, score: 0, tokens: 0 };
      }

      const summary = [
        "## Alert Input",
        params.inputText,
        "",
        `## Tool Calls (${params.toolCalls.length})`,
        ...params.toolCalls.map(
          (tc) => `- ${tc.toolName}(${JSON.stringify(tc.args).slice(0, 200)})`,
        ),
        "",
        "## Final Response",
        params.finalResponse,
      ].join("\n");

      logger.info(
        {
          toolCallCount: params.toolCalls.length,
          summaryLength: summary.length,
        },
        "[EvalJudge] Running auditor",
      );

      const scoringPrompt = buildScoringPrompt(params.criteria);
      const jsonFormat = buildAuditorJsonFormat(params.criteria);

      const result = await generateText({
        model,
        system: await this.getSystemPrompt(params.organizationId),
        prompt: `Evaluate this agent's response to a production alert.

${summary}

---

${scoringPrompt}

Respond in JSON:
${jsonFormat}`,
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? "{}") as Record<
        string,
        unknown
      >;

      const scores: DynamicScores = {};
      for (const c of params.criteria) {
        const entry = parsed[c.name] as { score?: number } | undefined;
        scores[c.name] = entry?.score ?? 0;
      }

      const avgScore =
        Object.values(scores).reduce((a, b) => a + b, 0) /
        (params.criteria.length * 10);

      const tokens =
        (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

      const passed = Object.values(scores).every((s) => s >= 5);

      logger.info(
        {
          scores,
          avgScore: Math.round(avgScore * 100) / 100,
          passed,
          tokens,
          rawResponse: result.text.slice(0, 500),
        },
        "[EvalJudge] Auditor result",
      );

      return {
        passed,
        scores,
        score: Math.round(avgScore * 100) / 100,
        tokens,
      };
    } catch (error) {
      logger.error({ error }, "[EvalJudge] Auditor LLM call failed");
      return { passed: false, scores: null, score: 0, tokens: 0 };
    }
  }

  /**
   * Method 3: Observer Agent
   * LLM analyzes the full execution trace.
   * Criteria are configurable per-eval.
   * Score = sum / (criteria.length * 10) (normalized 0-1). Passed = average >= 5.0.
   */
  async runObserver(params: {
    organizationId: string;
    inputText: string;
    toolCalls: { toolName: string; args: Record<string, unknown> }[];
    finalResponse: string;
    criteria: EvalCriterion[];
    steps: {
      model: string | null;
      inputTokens: number | null;
      outputTokens: number | null;
      toolCalls: { toolName: string; args: Record<string, unknown> }[];
    }[];
  }): Promise<ObserverResult> {
    try {
      const model = await this.resolveModel(params.organizationId);
      if (!model) {
        logger.warn(
          { organizationId: params.organizationId },
          "[EvalJudge] No model available for observer",
        );
        return { passed: false, scores: null, score: 0, tokens: 0 };
      }

      logger.info(
        {
          stepCount: params.steps.length,
          toolCallCount: params.toolCalls.length,
        },
        "[EvalJudge] Running observer",
      );

      const fullLog = [
        "# Full Agent Trace Log",
        `Steps: ${params.steps.length}`,
        `Total tool calls: ${params.toolCalls.length}`,
        "",
        "## Alert Input",
        params.inputText,
        "",
        "## Agent Steps",
        ...params.steps.map((step, i) => {
          const lines = [
            `### Step ${i + 1} [${step.model ?? "unknown"}]`,
            `Tokens: ${step.inputTokens ?? 0}in / ${step.outputTokens ?? 0}out`,
          ];
          if (step.toolCalls.length > 0) {
            lines.push(
              `Tool calls:\n${step.toolCalls.map((tc) => `  - ${tc.toolName}(${JSON.stringify(tc.args).slice(0, 300)})`).join("\n")}`,
            );
          }
          return lines.join("\n");
        }),
        "",
        "## Final Response",
        params.finalResponse,
      ].join("\n");

      const scoringPrompt = buildScoringPrompt(params.criteria);
      const jsonFormat = buildObserverJsonFormat(params.criteria);

      const result = await generateText({
        model,
        system: await this.getSystemPrompt(params.organizationId),
        prompt: `Analyze this complete agent execution trace.

${fullLog}

---

${scoringPrompt}

Respond in JSON:
${jsonFormat}`,
      });

      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? "{}") as Record<
        string,
        unknown
      >;

      const rawScores = (parsed.scores ?? {}) as Record<string, number>;
      const scores: DynamicScores = {};
      for (const c of params.criteria) {
        scores[c.name] = rawScores[c.name] ?? 0;
      }

      const avgScore =
        Object.values(scores).reduce((a, b) => a + b, 0) /
        (params.criteria.length * 10);

      const allValues = Object.values(scores);
      const avgRaw =
        allValues.reduce((a, b) => a + b, 0) / allValues.length;

      const tokens =
        (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);

      const passed = avgRaw >= 5.0;

      logger.info(
        {
          scores,
          avgScore: Math.round(avgScore * 100) / 100,
          passed,
          tokens,
          rawResponse: result.text.slice(0, 500),
        },
        "[EvalJudge] Observer result",
      );

      return {
        passed,
        scores,
        score: Math.round(avgScore * 100) / 100,
        tokens,
      };
    } catch (error) {
      logger.error({ error }, "[EvalJudge] Observer LLM call failed");
      return { passed: false, scores: null, score: 0, tokens: 0 };
    }
  }

  // === Private ===

  private async resolveModel(organizationId: string) {
    const builtInAgent = await AgentModel.getBuiltInAgent(
      BUILT_IN_AGENT_IDS.EVAL_JUDGE,
      organizationId,
    );

    if (builtInAgent) {
      const agentLlm = await resolveAgentLlm(builtInAgent);
      if (agentLlm) {
        return createLLMModel({
          provider: agentLlm.provider,
          apiKey: agentLlm.apiKey,
          agentId: builtInAgent.id,
          modelName: agentLlm.modelName,
          baseUrl: agentLlm.baseUrl,
        });
      }
    }

    const resolved = await resolveSmartDefaultLlm({ organizationId });
    if (!resolved) {
      logger.warn(
        { organizationId },
        "[EvalJudge] No LLM available for eval judging",
      );
      return null;
    }

    return createLLMModel({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      agentId: builtInAgent?.id ?? "eval-judge",
      modelName: resolved.modelName,
      baseUrl: resolved.baseUrl,
    });
  }

  private async getSystemPrompt(organizationId: string): Promise<string> {
    const builtInAgent = await AgentModel.getBuiltInAgent(
      BUILT_IN_AGENT_IDS.EVAL_JUDGE,
      organizationId,
    );
    return (
      builtInAgent?.systemPrompt ??
      "You are an expert evaluator for AI agent performance. Respond with valid JSON only."
    );
  }
}

export const evalJudgeService = new EvalJudgeService();

// === Helpers ===

function buildScoringPrompt(criteria: EvalCriterion[]): string {
  const lines = criteria.map(
    (c, i) => `${i + 1}. **${c.name}**: ${c.description}`,
  );
  return `Score these ${criteria.length} categories (0-10 each):\n${lines.join("\n")}`;
}

function buildAuditorJsonFormat(criteria: EvalCriterion[]): string {
  const fields = criteria.map(
    (c) => `  "${c.name}": { "score": <0-10>, "reasoning": "<1 sentence>" }`,
  );
  return `{\n${fields.join(",\n")},\n  "passed": <true if all scores >= 5>\n}`;
}

function buildObserverJsonFormat(criteria: EvalCriterion[]): string {
  const fields = criteria.map((c) => `    "${c.name}": <0-10>`);
  return `{\n  "scores": {\n${fields.join(",\n")}\n  },\n  "analysis": {\n    "overallAssessment": "<2-3 sentences>",\n    "missedOpportunities": ["<item>"],\n    "unnecessaryActions": ["<item>"]\n  },\n  "passed": <true if average score >= 5.0>\n}`;
}

async function resolveAgentLlm(agent: {
  llmApiKeyId: string | null;
  llmModel: string | null;
}) {
  // Lazy import to avoid circular deps
  const { isSupportedProvider } = await import("@shared");
  const { detectProviderFromModel } = await import("@/clients/llm-client");
  const { LlmProviderApiKeyModel, LlmProviderApiKeyModelLinkModel } =
    await import("@/models");
  const { getSecretValueForLlmProviderApiKey } = await import(
    "@/secrets-manager"
  );

  if (!agent.llmApiKeyId) return null;

  const apiKeyRecord = await LlmProviderApiKeyModel.findById(agent.llmApiKeyId);
  if (!apiKeyRecord) return null;

  const provider = isSupportedProvider(apiKeyRecord.provider)
    ? apiKeyRecord.provider
    : detectProviderFromModel(agent.llmModel ?? "");

  let apiKey: string | undefined;
  if (apiKeyRecord.secretId) {
    const secret = await getSecretValueForLlmProviderApiKey(
      apiKeyRecord.secretId,
    );
    apiKey = (secret as string) ?? undefined;
  }

  const modelName =
    agent.llmModel ??
    (await LlmProviderApiKeyModelLinkModel.getBestModel(apiKeyRecord.id))
      ?.modelId;
  if (!modelName) return null;

  return { provider, apiKey, modelName, baseUrl: apiKeyRecord.baseUrl };
}
