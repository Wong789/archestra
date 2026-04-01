import {
  CONTEXT_EXTERNAL_AGENT_ID,
  CONTEXT_TEAM_IDS,
  isAgentTool,
} from "@shared";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { archestraMcpBranding } from "@/archestra-mcp-server/branding";
import db, { schema } from "@/database";
import logger from "@/logging";
import { evaluatePolicyTemplate } from "@/templating";
import type {
  GlobalToolPolicy,
  ToolInvocation,
} from "@/types";

type EvaluationResult = {
  isAllowed: boolean;
  reason: string;
};

export type PolicyEvaluationContext = {
  teamIds: string[];
  externalAgentId?: string;
  labels?: string[];
};

const BLOCK_ALWAYS_REASON =
  "Tool invocation blocked: policy is configured to always block tool call";
const UNTRUSTED_CONTEXT_REASON =
  "Tool invocation blocked: context contains sensitive data";
const NO_POLICY_UNTRUSTED_REASON =
  "Tool invocation blocked: forbidden in sensitive context by default";

class ToolInvocationPolicyModel {
  static async create(
    policy: ToolInvocation.InsertToolInvocationPolicy,
  ): Promise<ToolInvocation.ToolInvocationPolicy> {
    // If this is a default policy (empty conditions), upsert to prevent duplicates
    if (policy.conditions.length === 0) {
      const [existingDefault] = await db
        .select()
        .from(schema.toolInvocationPoliciesTable)
        .where(eq(schema.toolInvocationPoliciesTable.toolId, policy.toolId))
        .then((rows) => rows.filter((r) => r.conditions.length === 0));

      if (existingDefault) {
        const [updatedPolicy] = await db
          .update(schema.toolInvocationPoliciesTable)
          .set({
            action: policy.action,
            reason: policy.reason ?? null,
            matchTemplate:
              policy.matchTemplate ??
              ToolInvocationPolicyModel.buildTemplateFromConditions(
                policy.conditions,
              ),
            sortOrder: policy.sortOrder ?? 0,
          })
          .where(eq(schema.toolInvocationPoliciesTable.id, existingDefault.id))
          .returning();

        return ToolInvocationPolicyModel.normalizePolicy(updatedPolicy);
      }
    }

    const [createdPolicy] = await db
      .insert(schema.toolInvocationPoliciesTable)
      .values({
        ...policy,
        matchTemplate:
          policy.matchTemplate ??
          ToolInvocationPolicyModel.buildTemplateFromConditions(
            policy.conditions,
          ),
        sortOrder: policy.sortOrder ?? 0,
      })
      .returning();

    // Clear auto-configured timestamp for this tool
    await db
      .update(schema.toolsTable)
      .set({
        policiesAutoConfiguredAt: null,
        policiesAutoConfiguredReasoning: null,
      })
      .where(eq(schema.toolsTable.id, policy.toolId));

    return ToolInvocationPolicyModel.normalizePolicy(createdPolicy);
  }

  static async findAll(): Promise<ToolInvocation.ToolInvocationPolicy[]> {
    const rows = await db
      .select()
      .from(schema.toolInvocationPoliciesTable)
      .orderBy(desc(schema.toolInvocationPoliciesTable.createdAt));
    return rows
      .map((row) => ToolInvocationPolicyModel.normalizePolicy(row))
      .sort(ToolInvocationPolicyModel.comparePolicies);
  }

  static async findById(
    id: string,
  ): Promise<ToolInvocation.ToolInvocationPolicy | null> {
    const [policy] = await db
      .select()
      .from(schema.toolInvocationPoliciesTable)
      .where(eq(schema.toolInvocationPoliciesTable.id, id));
    return policy ? ToolInvocationPolicyModel.normalizePolicy(policy) : null;
  }

  static async update(
    id: string,
    policy: Partial<ToolInvocation.InsertToolInvocationPolicy>,
  ): Promise<ToolInvocation.ToolInvocationPolicy | null> {
    const [updatedPolicy] = await db
      .update(schema.toolInvocationPoliciesTable)
      .set({
        ...policy,
        ...(policy.conditions !== undefined
          ? {
              matchTemplate:
                policy.matchTemplate ??
                ToolInvocationPolicyModel.buildTemplateFromConditions(
                  policy.conditions,
                ),
            }
          : {}),
      })
      .where(eq(schema.toolInvocationPoliciesTable.id, id))
      .returning();

    if (updatedPolicy) {
      // Clear auto-configured timestamp for this tool
      await db
        .update(schema.toolsTable)
        .set({
          policiesAutoConfiguredAt: null,
          policiesAutoConfiguredReasoning: null,
        })
        .where(eq(schema.toolsTable.id, updatedPolicy.toolId));
    }

    return updatedPolicy
      ? ToolInvocationPolicyModel.normalizePolicy(updatedPolicy)
      : null;
  }

  static async delete(id: string): Promise<boolean> {
    // Get the policy first to access toolId
    const policy = await ToolInvocationPolicyModel.findById(id);
    if (!policy) {
      return false;
    }

    const result = await db
      .delete(schema.toolInvocationPoliciesTable)
      .where(eq(schema.toolInvocationPoliciesTable.id, id))
      .returning({ id: schema.toolInvocationPoliciesTable.id });

    const deleted = result.length > 0;

    if (deleted) {
      // Clear auto-configured timestamp for this tool
      await db
        .update(schema.toolsTable)
        .set({
          policiesAutoConfiguredAt: null,
          policiesAutoConfiguredReasoning: null,
        })
        .where(eq(schema.toolsTable.id, policy.toolId));
    }

    return deleted;
  }

  /**
   * Delete all tool invocation policies for a specific tool.
   * Used primarily in tests.
   */
  static async deleteByToolId(toolId: string): Promise<number> {
    const result = await db
      .delete(schema.toolInvocationPoliciesTable)
      .where(eq(schema.toolInvocationPoliciesTable.toolId, toolId))
      .returning({ id: schema.toolInvocationPoliciesTable.id });

    return result.length;
  }

  /**
   * Bulk upsert default policies (empty conditions) for multiple tools.
   * Updates existing default policies or creates new ones in a single transaction.
   */
  static async bulkUpsertDefaultPolicy(
    toolIds: string[],
    action:
      | "allow_when_context_is_untrusted"
      | "block_when_context_is_untrusted"
      | "block_always"
      | "require_approval",
  ): Promise<{ updated: number; created: number }> {
    if (toolIds.length === 0) {
      return { updated: 0, created: 0 };
    }

    // Find existing default policies (empty conditions) for these tools
    const existingPolicies = await db
      .select()
      .from(schema.toolInvocationPoliciesTable)
      .where(inArray(schema.toolInvocationPoliciesTable.toolId, toolIds));

    // Filter to only default policies (empty conditions array)
    const defaultPolicies = existingPolicies.filter(
      (p) => p.conditions.length === 0,
    );

    const toolIdsWithDefaultPolicy = new Set(
      defaultPolicies.map((p) => p.toolId),
    );
    const toolIdsToCreate = toolIds.filter(
      (id) => !toolIdsWithDefaultPolicy.has(id),
    );
    const policiesToUpdate = defaultPolicies.filter((p) => p.action !== action);

    let updated = 0;
    let created = 0;

    // Update existing default policies that have different action
    if (policiesToUpdate.length > 0) {
      const policyIds = policiesToUpdate.map((p) => p.id);
      await db
        .update(schema.toolInvocationPoliciesTable)
        .set({ action })
        .where(inArray(schema.toolInvocationPoliciesTable.id, policyIds));
      updated = policiesToUpdate.length;
    }

    // Create new default policies for tools that don't have one
    if (toolIdsToCreate.length > 0) {
      await db.insert(schema.toolInvocationPoliciesTable).values(
        toolIdsToCreate.map((toolId) => ({
          toolId,
          conditions: [],
          matchTemplate: "{{true}}",
          sortOrder: 0,
          action,
          reason: null,
        })),
      );
      created = toolIdsToCreate.length;
    }

    return { updated, created };
  }

  /**
   * Check if a tool requires user approval before execution in chat.
   * Used by the AI SDK's `needsApproval` hook to pause tool execution.
   *
   * Returns true if any matching policy has action === "require_approval".
   */
  static async checkApprovalRequired(
    toolName: string,
    // biome-ignore lint/suspicious/noExplicitAny: tool inputs can be any shape
    toolInput: Record<string, any>,
    context: PolicyEvaluationContext,
    globalToolPolicy: GlobalToolPolicy,
  ): Promise<boolean> {
    // Permissive mode: skip all approval checks (consistent with evaluateBatch)
    if (globalToolPolicy === "permissive") {
      return false;
    }

    // Archestra tools always bypass policies (consistent with evaluateBatch)
    if (archestraMcpBranding.isToolName(toolName)) {
      return false;
    }

    // Find tool by name
    const [tool] = await db
      .select({ id: schema.toolsTable.id })
      .from(schema.toolsTable)
      .where(eq(schema.toolsTable.name, toolName));

    if (!tool) {
      logger.debug({ toolName }, "checkApprovalRequired: tool not found in DB");
      return false;
    }

    // Fetch policies for this tool
    const policies = await db
      .select()
      .from(schema.toolInvocationPoliciesTable)
      .where(eq(schema.toolInvocationPoliciesTable.toolId, tool.id));

    logger.debug(
      {
        toolName,
        toolId: tool.id,
        policyCount: policies.length,
        actions: policies.map((p) => p.action),
      },
      "checkApprovalRequired: policy lookup result",
    );

    if (policies.length === 0) {
      return false;
    }

    const sortedPolicies = policies
      .map((policy) => ToolInvocationPolicyModel.normalizePolicy(policy))
      .sort(ToolInvocationPolicyModel.comparePolicies);

    for (const policy of sortedPolicies) {
      if (
        !ToolInvocationPolicyModel.matchesPolicy({
          policy,
          toolName,
          toolInput,
          context,
        })
      ) {
        continue;
      }

      if (policy.action === "require_approval") {
        logger.info(
          { toolName },
          "checkApprovalRequired: matching policy requires approval",
        );
        return true;
      }

      logger.debug(
        { toolName, action: policy.action },
        "checkApprovalRequired: matching policy does not require approval",
      );
      return false;
    }

    logger.debug({ toolName }, "checkApprovalRequired: no approval required");
    return false;
  }

  /**
   * Batch evaluate tool invocation policies for multiple tool calls at once.
   * This avoids N+1 queries by fetching all policies upfront.
   *
   * Returns the first blocked tool call (refusal message) or null if all are allowed.
   */
  static async evaluateBatch(
    _agentId: string,
    toolCalls: Array<{
      toolCallName: string;
      // biome-ignore lint/suspicious/noExplicitAny: tool inputs can be any shape
      toolInput: Record<string, any>;
    }>,
    context: PolicyEvaluationContext,
    isContextTrusted: boolean,
    globalToolPolicy: GlobalToolPolicy,
  ): Promise<EvaluationResult & { toolCallName?: string }> {
    logger.debug(
      { globalToolPolicy },
      "ToolInvocationPolicy.evaluateBatch: global policy",
    );

    // YOLO mode: allow all tool calls immediately, skip policy evaluation
    if (globalToolPolicy === "permissive") {
      return { isAllowed: true, reason: "" };
    }

    // Filter out Archestra tools and agent delegation tools (always allowed)
    const externalToolCalls = toolCalls.filter(
      (tc) =>
        !archestraMcpBranding.isToolName(tc.toolCallName) &&
        !isAgentTool(tc.toolCallName),
    );

    if (externalToolCalls.length === 0) {
      return { isAllowed: true, reason: "" };
    }

    const toolNames = externalToolCalls.map((tc) => tc.toolCallName);

    // Fetch tool IDs for the tool names
    const tools = await db
      .select({
        id: schema.toolsTable.id,
        name: schema.toolsTable.name,
      })
      .from(schema.toolsTable)
      .where(inArray(schema.toolsTable.name, toolNames));

    const toolIdsByName = new Map(tools.map((t) => [t.name, t.id]));
    const toolIds = tools.map((t) => t.id);

    if (toolIds.length === 0) {
      // No tools found, allow all
      return { isAllowed: true, reason: "" };
    }

    // Fetch all policies for all tools
    const allPolicies = await db
      .select()
      .from(schema.toolInvocationPoliciesTable)
      .where(inArray(schema.toolInvocationPoliciesTable.toolId, toolIds));

    logger.debug(
      { allPolicies },
      "ToolInvocationPolicy.evaluateBatch: evaluating policies",
    );

    // Group policies by tool ID
    const policiesByToolId = new Map<
      string,
      Array<(typeof allPolicies)[number]>
    >();
    for (const policy of allPolicies) {
      const existing = policiesByToolId.get(policy.toolId) || [];
      existing.push(policy);
      policiesByToolId.set(policy.toolId, existing);
    }

    // Evaluate each tool call
    for (const { toolCallName, toolInput } of externalToolCalls) {
      const toolId = toolIdsByName.get(toolCallName);
      if (!toolId) continue;

      const policies = (policiesByToolId.get(toolId) || [])
        .map((policy) => ToolInvocationPolicyModel.normalizePolicy(policy))
        .sort(ToolInvocationPolicyModel.comparePolicies);

      if (policies.length > 0) {
        let matchedPolicy = false;

        for (const policy of policies) {
          if (
            !ToolInvocationPolicyModel.matchesPolicy({
              policy,
              toolName: toolCallName,
              toolInput,
              context,
            })
          ) {
            continue;
          }

          matchedPolicy = true;

          if (policy.action === "block_always") {
            return {
              isAllowed: false,
              reason: policy.reason || BLOCK_ALWAYS_REASON,
              toolCallName,
            };
          }

          if (policy.action === "block_when_context_is_untrusted") {
            if (!isContextTrusted) {
              return {
                isAllowed: false,
                reason: UNTRUSTED_CONTEXT_REASON,
                toolCallName,
              };
            }

            break;
          }

          if (!isContextTrusted) {
            return {
              isAllowed:
                policy.action === "allow_when_context_is_untrusted" ||
                policy.action === "require_approval",
              reason:
                policy.action === "allow_when_context_is_untrusted" ||
                policy.action === "require_approval"
                  ? ""
                  : UNTRUSTED_CONTEXT_REASON,
              toolCallName,
            };
          }

          break;
        }

        if (matchedPolicy) {
          continue;
        }
      }

      // No policies exist or no rule matched - block in untrusted context
      if (!isContextTrusted) {
        return {
          isAllowed: false,
          reason: NO_POLICY_UNTRUSTED_REASON,
          toolCallName,
        };
      }
    }

    return { isAllowed: true, reason: "" };
  }

  /**
   * Check if a tool has any policy that could lead to blocking during streaming.
   * Only unconditional allow / approval rules are safe to stream.
   */
  static async hasBlockingPolicy(
    toolName: string,
    contextIsTrusted: boolean,
  ): Promise<boolean> {
    const blockingActions: ToolInvocation.ToolInvocationPolicyAction[] =
      contextIsTrusted
        ? ["block_always", "require_approval"]
        : [
            "block_always",
            "require_approval",
            "block_when_context_is_untrusted",
          ];
    const result = await db
      .select({ id: schema.toolInvocationPoliciesTable.id })
      .from(schema.toolInvocationPoliciesTable)
      .innerJoin(
        schema.toolsTable,
        eq(schema.toolInvocationPoliciesTable.toolId, schema.toolsTable.id),
      )
      .where(
        and(
          eq(schema.toolsTable.name, toolName),
          or(
            inArray(schema.toolInvocationPoliciesTable.action, blockingActions),
            sql`${schema.toolInvocationPoliciesTable.matchTemplate} <> '{{true}}'`,
            sql`jsonb_typeof(${schema.toolInvocationPoliciesTable.conditions}) = 'array' AND jsonb_array_length(${schema.toolInvocationPoliciesTable.conditions}) > 0`,
          ),
        ),
      )
      .limit(1);

    return result.length > 0;
  }

  private static normalizePolicy(
    policy: ToolInvocation.ToolInvocationPolicy,
  ): ToolInvocation.ToolInvocationPolicy {
    return {
      ...policy,
      matchTemplate:
        policy.matchTemplate === "{{true}}" && policy.conditions.length > 0
          ? ToolInvocationPolicyModel.buildTemplateFromConditions(
              policy.conditions,
            )
          : policy.matchTemplate,
    };
  }

  private static comparePolicies(
    a: ToolInvocation.ToolInvocationPolicy,
    b: ToolInvocation.ToolInvocationPolicy,
  ): number {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    if (a.conditions.length === 0 && b.conditions.length > 0) {
      return 1;
    }

    if (a.conditions.length > 0 && b.conditions.length === 0) {
      return -1;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  }

  private static buildTemplateFromConditions(
    conditions: ToolInvocation.ToolInvocationPolicy["conditions"],
  ): string {
    if (conditions.length === 0) {
      return "{{true}}";
    }

    const expressions = conditions.map(({ key, operator, value }) => {
      if (key === CONTEXT_EXTERNAL_AGENT_ID) {
        return `(matchContext context "externalAgentId" "${operator}" ${JSON.stringify(value)})`;
      }

      if (key === CONTEXT_TEAM_IDS) {
        return `(matchContext context "teamIds" "${operator}" ${JSON.stringify(value)})`;
      }

      return `(matchInput input "${key}" "${operator}" ${JSON.stringify(value)})`;
    });

    return expressions.length === 1
      ? `{{${expressions[0].slice(1, -1)}}}`
      : `{{all ${expressions.join(" ")}}}`;
  }

  private static matchesPolicy(params: {
    policy: ToolInvocation.ToolInvocationPolicy;
    toolName: string;
    // biome-ignore lint/suspicious/noExplicitAny: tool inputs can be any shape
    toolInput: Record<string, any>;
    context: PolicyEvaluationContext;
  }): boolean {
    const { policy, toolInput, toolName, context } = params;
    return evaluatePolicyTemplate(policy.matchTemplate, {
      tool: { name: toolName },
      input: toolInput,
      context: {
        externalAgentId: context.externalAgentId,
        teamIds: context.teamIds,
        labels: context.labels ?? [],
      },
      labels: context.labels ?? [],
    });
  }
}

export default ToolInvocationPolicyModel;
