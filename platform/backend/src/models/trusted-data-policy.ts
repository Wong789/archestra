import {
  CONTEXT_EXTERNAL_AGENT_ID,
  CONTEXT_TEAM_IDS,
  SAFE_TOOL_CONTEXT_LABEL,
  SENSITIVE_TOOL_CONTEXT_LABEL,
} from "@shared";
import { desc, eq, inArray } from "drizzle-orm";
import { archestraMcpBranding } from "@/archestra-mcp-server/branding";
import db, { schema } from "@/database";
import logger from "@/logging";
import type { PolicyEvaluationContext } from "@/models/tool-invocation-policy";
import { evaluatePolicyTemplate } from "@/templating";
import type {
  GlobalToolPolicy,
  TrustedData,
} from "@/types";

class TrustedDataPolicyModel {
  static async create(
    policy: TrustedData.InsertTrustedDataPolicy,
  ): Promise<TrustedData.TrustedDataPolicy> {
    const [createdPolicy] = await db
      .insert(schema.trustedDataPoliciesTable)
      .values({
        ...policy,
        matchTemplate:
          policy.matchTemplate ??
          TrustedDataPolicyModel.buildTemplateFromConditions(policy.conditions),
        sortOrder: policy.sortOrder ?? 0,
        labels:
          policy.labels ??
          TrustedDataPolicyModel.getLabelsForAction(policy.action),
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

    return TrustedDataPolicyModel.normalizePolicy(createdPolicy);
  }

  static async findAll(): Promise<TrustedData.TrustedDataPolicy[]> {
    const rows = await db
      .select()
      .from(schema.trustedDataPoliciesTable)
      .orderBy(desc(schema.trustedDataPoliciesTable.createdAt));
    return rows
      .map((row) => TrustedDataPolicyModel.normalizePolicy(row))
      .sort(TrustedDataPolicyModel.comparePolicies);
  }

  static async findById(
    id: string,
  ): Promise<TrustedData.TrustedDataPolicy | null> {
    const [policy] = await db
      .select()
      .from(schema.trustedDataPoliciesTable)
      .where(eq(schema.trustedDataPoliciesTable.id, id));
    return policy ? TrustedDataPolicyModel.normalizePolicy(policy) : null;
  }

  static async update(
    id: string,
    policy: Partial<TrustedData.InsertTrustedDataPolicy>,
  ): Promise<TrustedData.TrustedDataPolicy | null> {
    const [updatedPolicy] = await db
      .update(schema.trustedDataPoliciesTable)
      .set({
        ...policy,
        ...(policy.conditions !== undefined
          ? {
              matchTemplate:
                policy.matchTemplate ??
                TrustedDataPolicyModel.buildTemplateFromConditions(
                  policy.conditions,
                ),
            }
          : {}),
        ...(policy.action !== undefined && policy.labels === undefined
          ? {
              labels: TrustedDataPolicyModel.getLabelsForAction(policy.action),
            }
          : {}),
      })
      .where(eq(schema.trustedDataPoliciesTable.id, id))
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
      ? TrustedDataPolicyModel.normalizePolicy(updatedPolicy)
      : null;
  }

  static async delete(id: string): Promise<boolean> {
    // Get the policy first to access toolId
    const policy = await TrustedDataPolicyModel.findById(id);
    if (!policy) {
      return false;
    }

    const result = await db
      .delete(schema.trustedDataPoliciesTable)
      .where(eq(schema.trustedDataPoliciesTable.id, id))
      .returning({ id: schema.trustedDataPoliciesTable.id });

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
   * Delete all trusted data policies for a specific tool.
   * Used primarily in tests.
   */
  static async deleteByToolId(toolId: string): Promise<number> {
    const result = await db
      .delete(schema.trustedDataPoliciesTable)
      .where(eq(schema.trustedDataPoliciesTable.toolId, toolId))
      .returning({ id: schema.trustedDataPoliciesTable.id });

    return result.length;
  }

  /**
   * Bulk upsert default policies (empty conditions) for multiple tools.
   * Updates existing default policies or creates new ones in a single transaction.
   */
  static async bulkUpsertDefaultPolicy(
    toolIds: string[],
    action:
      | "assign_labels"
      | "mark_as_trusted"
      | "mark_as_untrusted"
      | "block_always"
      | "sanitize_with_dual_llm",
  ): Promise<{ updated: number; created: number }> {
    if (toolIds.length === 0) {
      return { updated: 0, created: 0 };
    }

    // Find existing default policies (empty conditions) for these tools
    const existingPolicies = await db
      .select()
      .from(schema.trustedDataPoliciesTable)
      .where(inArray(schema.trustedDataPoliciesTable.toolId, toolIds));

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
        .update(schema.trustedDataPoliciesTable)
        .set({
          action,
          labels: TrustedDataPolicyModel.getLabelsForAction(action),
        })
        .where(inArray(schema.trustedDataPoliciesTable.id, policyIds));
      updated = policiesToUpdate.length;
    }

    // Create new default policies for tools that don't have one
    if (toolIdsToCreate.length > 0) {
      await db.insert(schema.trustedDataPoliciesTable).values(
        toolIdsToCreate.map((toolId) => ({
          toolId,
          conditions: [],
          matchTemplate: "{{true}}",
          sortOrder: 0,
          action,
          labels: TrustedDataPolicyModel.getLabelsForAction(action),
        })),
      );
      created = toolIdsToCreate.length;
    }

    return { updated, created };
  }

  /**
   * Evaluate trusted data policies for a chat
   *
   * KEY SECURITY PRINCIPLE: Data is UNTRUSTED by default (when globalToolPolicy is "restrictive").
   * - Only data that explicitly matches a trusted data policy is considered safe
   * - If no policy matches, the data is considered untrusted
   * - This implements an allowlist approach for maximum security
   * - Policies with action='block_always' take precedence and mark data as blocked
   * - Specific policies (with conditions) are evaluated before default policies (empty conditions)
   */
  static async evaluate(
    agentId: string,
    toolName: string,
    // biome-ignore lint/suspicious/noExplicitAny: tool outputs can be any shape
    toolOutput: any,
    globalToolPolicy: GlobalToolPolicy = "restrictive",
    context: PolicyEvaluationContext,
  ): Promise<{
    isTrusted: boolean;
    isBlocked: boolean;
    shouldSanitizeWithDualLlm: boolean;
    reason: string;
    labels: string[];
  }> {
    // Use bulk evaluation for single tool
    const results = await TrustedDataPolicyModel.evaluateBulk(
      agentId,
      [{ toolName, toolOutput }],
      globalToolPolicy,
      context,
    );
    return (
      results.get("0") || {
        isTrusted: false,
        isBlocked: false,
        shouldSanitizeWithDualLlm: false,
        reason: "Tool not found",
        labels: [],
      }
    );
  }

  /**
   * Bulk evaluate trusted data policies for multiple tool calls
   * This method fetches all policies and tool configurations in one query to avoid N+1 issues
   */
  static async evaluateBulk(
    _agentId: string,
    toolCalls: Array<{
      toolName: string;
      // biome-ignore lint/suspicious/noExplicitAny: tool outputs can be any shape
      toolOutput: any;
    }>,
    globalToolPolicy: GlobalToolPolicy = "restrictive",
    context: PolicyEvaluationContext,
  ): Promise<
    Map<
      string,
      {
        isTrusted: boolean;
        isBlocked: boolean;
        shouldSanitizeWithDualLlm: boolean;
        reason: string;
        labels: string[];
      }
    >
  > {
    const results = new Map<
      string,
      {
        isTrusted: boolean;
        isBlocked: boolean;
        shouldSanitizeWithDualLlm: boolean;
        reason: string;
        labels: string[];
      }
    >();

    // YOLO mode: trust all data immediately, skip policy evaluation
    if (globalToolPolicy === "permissive") {
      for (let i = 0; i < toolCalls.length; i++) {
        results.set(i.toString(), {
          isTrusted: true,
          isBlocked: false,
          shouldSanitizeWithDualLlm: false,
          reason: "Trusted by permissive global policy",
          labels: [SAFE_TOOL_CONTEXT_LABEL],
        });
      }
      return results;
    }

    // Handle built-in MCP server tools
    for (let i = 0; i < toolCalls.length; i++) {
      const { toolName } = toolCalls[i];
      if (archestraMcpBranding.isToolName(toolName)) {
        results.set(i.toString(), {
          isTrusted: true,
          isBlocked: false,
          shouldSanitizeWithDualLlm: false,
          reason: "Built-in MCP server tool",
          labels: [SAFE_TOOL_CONTEXT_LABEL],
        });
      }
    }

    // Get all non-built-in tool names
    const nonArchestraToolCalls = toolCalls.filter(
      ({ toolName }) => !archestraMcpBranding.isToolName(toolName),
    );

    if (nonArchestraToolCalls.length === 0) {
      return results;
    }

    const toolNames = nonArchestraToolCalls.map(({ toolName }) => toolName);

    // Fetch all policies and tool info in one query (tool-global, not agent-scoped)
    const allPoliciesAndTools = await db
      .select({
        toolId: schema.toolsTable.id,
        toolName: schema.toolsTable.name,
        policyId: schema.trustedDataPoliciesTable.id,
        policyDescription: schema.trustedDataPoliciesTable.description,
        conditions: schema.trustedDataPoliciesTable.conditions,
        matchTemplate: schema.trustedDataPoliciesTable.matchTemplate,
        sortOrder: schema.trustedDataPoliciesTable.sortOrder,
        action: schema.trustedDataPoliciesTable.action,
        labels: schema.trustedDataPoliciesTable.labels,
        createdAt: schema.trustedDataPoliciesTable.createdAt,
        updatedAt: schema.trustedDataPoliciesTable.updatedAt,
      })
      .from(schema.toolsTable)
      .leftJoin(
        schema.trustedDataPoliciesTable,
        eq(schema.toolsTable.id, schema.trustedDataPoliciesTable.toolId),
      )
      .where(inArray(schema.toolsTable.name, toolNames));

    // Group policies by tool name
    const policiesByTool = new Map<
      string,
      Array<{
        policyId: string | null;
        toolId: string;
        policyDescription: string | null;
        conditions: TrustedData.TrustedDataPolicy["conditions"];
        matchTemplate: string | null;
        sortOrder: number | null;
        action: TrustedData.TrustedDataPolicyAction | null;
        labels: string[] | null;
        createdAt: Date | null;
        updatedAt: Date | null;
      }>
    >();

    // Track tools that exist in the database
    const knownTools = new Set<string>();

    for (const row of allPoliciesAndTools) {
      knownTools.add(row.toolName);

      if (!policiesByTool.has(row.toolName)) {
        policiesByTool.set(row.toolName, []);
      }

      policiesByTool.get(row.toolName)?.push({
        policyId: row.policyId,
        toolId: row.toolId,
        policyDescription: row.policyDescription,
        conditions: row.conditions ?? [],
        matchTemplate: row.matchTemplate,
        sortOrder: row.sortOrder,
        action: row.action,
        labels: row.labels,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
    }

    // Process each tool call
    for (let i = 0; i < toolCalls.length; i++) {
      const { toolName, toolOutput } = toolCalls[i];

      // Skip Archestra tools (already handled)
      if (archestraMcpBranding.isToolName(toolName)) {
        continue;
      }

      // If tool doesn't exist in the database, treat as untrusted
      if (!knownTools.has(toolName)) {
        results.set(i.toString(), {
          isTrusted: false,
          isBlocked: false,
          shouldSanitizeWithDualLlm: false,
          reason: `Tool ${toolName} not found`,
          labels: [SENSITIVE_TOOL_CONTEXT_LABEL],
        });
        continue;
      }

      const policies = (policiesByTool.get(toolName) || [])
        .filter((policy) => policy.policyId !== null)
        .map((policy) =>
          TrustedDataPolicyModel.normalizePolicy({
            id: policy.policyId as string,
            toolId: policy.toolId,
            description: policy.policyDescription,
            conditions: policy.conditions,
            matchTemplate: policy.matchTemplate ?? "{{true}}",
            sortOrder: policy.sortOrder ?? 0,
            action: policy.action as TrustedData.TrustedDataPolicyAction,
            labels: policy.labels ?? [],
            createdAt: policy.createdAt ?? new Date(),
            updatedAt: policy.updatedAt ?? new Date(),
          }),
        )
        .sort(TrustedDataPolicyModel.comparePolicies);

      let matchedPolicy: TrustedData.TrustedDataPolicy | null = null;
      for (const policy of policies) {
        if (
          TrustedDataPolicyModel.matchesPolicy({
            policy,
            toolName,
            toolOutput,
            context,
          })
        ) {
          matchedPolicy = policy;
          break;
        }
      }

      if (matchedPolicy) {
        const labels = TrustedDataPolicyModel.getEffectiveLabels(matchedPolicy);
        if (matchedPolicy.action === "block_always") {
          results.set(i.toString(), {
            isTrusted: false,
            isBlocked: true,
            shouldSanitizeWithDualLlm: false,
            reason: `Data blocked by policy: ${matchedPolicy.description || "Unnamed policy"}`,
            labels,
          });
          continue;
        }

        if (matchedPolicy.action === "sanitize_with_dual_llm") {
          results.set(i.toString(), {
            isTrusted: false,
            isBlocked: false,
            shouldSanitizeWithDualLlm: true,
            reason: `Data requires dual LLM sanitization by policy: ${matchedPolicy.description || "Unnamed policy"}`,
            labels,
          });
          continue;
        }

        results.set(i.toString(), {
          isTrusted: !labels.includes(SENSITIVE_TOOL_CONTEXT_LABEL),
          isBlocked: false,
          shouldSanitizeWithDualLlm: false,
          reason: TrustedDataPolicyModel.getMatchReason(matchedPolicy, labels),
          labels,
        });
        continue;
      }

      results.set(i.toString(), {
        isTrusted: false,
        isBlocked: false,
        shouldSanitizeWithDualLlm: false,
        reason:
          "No matching policies - data is labeled sensitive by default (untrusted by default)",
        labels: [SENSITIVE_TOOL_CONTEXT_LABEL],
      });
    }

    return results;
  }

  private static normalizePolicy(
    policy: TrustedData.TrustedDataPolicy,
  ): TrustedData.TrustedDataPolicy {
    return {
      ...policy,
      matchTemplate:
        policy.matchTemplate === "{{true}}" && policy.conditions.length > 0
          ? TrustedDataPolicyModel.buildTemplateFromConditions(
              policy.conditions,
            )
          : policy.matchTemplate,
      labels:
        policy.labels.length > 0
          ? policy.labels
          : TrustedDataPolicyModel.getLabelsForAction(policy.action),
    };
  }

  private static comparePolicies(
    a: TrustedData.TrustedDataPolicy,
    b: TrustedData.TrustedDataPolicy,
  ): number {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    if (a.action === "block_always" && b.action !== "block_always") {
      return -1;
    }

    if (a.action !== "block_always" && b.action === "block_always") {
      return 1;
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
    conditions: TrustedData.TrustedDataPolicy["conditions"],
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

      return `(matchOutput output "${key}" "${operator}" ${JSON.stringify(value)})`;
    });

    return expressions.length === 1
      ? `{{${expressions[0].slice(1, -1)}}}`
      : `{{all ${expressions.join(" ")}}}`;
  }

  private static matchesPolicy(params: {
    policy: TrustedData.TrustedDataPolicy;
    toolName: string;
    // biome-ignore lint/suspicious/noExplicitAny: tool outputs can be any shape
    toolOutput: any;
    context: PolicyEvaluationContext;
  }): boolean {
    const { policy, toolName, toolOutput, context } = params;
    return evaluatePolicyTemplate(policy.matchTemplate, {
      tool: { name: toolName },
      output: toolOutput?.value || toolOutput,
      context: {
        externalAgentId: context.externalAgentId,
        teamIds: context.teamIds,
        labels: context.labels ?? [],
      },
      labels: context.labels ?? [],
    });
  }

  private static getLabelsForAction(
    action: TrustedData.TrustedDataPolicyAction,
  ): string[] {
    switch (action) {
      case "mark_as_trusted":
        return [SAFE_TOOL_CONTEXT_LABEL];
      case "mark_as_untrusted":
        return [SENSITIVE_TOOL_CONTEXT_LABEL];
      default:
        return [];
    }
  }

  private static getEffectiveLabels(
    policy: TrustedData.TrustedDataPolicy,
  ): string[] {
    if (policy.action === "assign_labels") {
      return policy.labels;
    }

    return TrustedDataPolicyModel.getLabelsForAction(policy.action);
  }

  private static getMatchReason(
    policy: TrustedData.TrustedDataPolicy,
    labels: string[],
  ): string {
    const isDefaultPolicy =
      policy.conditions.length === 0 && policy.matchTemplate === "{{true}}";

    if (isDefaultPolicy && labels.includes(SENSITIVE_TOOL_CONTEXT_LABEL)) {
      return "Data untrusted by default policy";
    }

    if (isDefaultPolicy && !labels.includes(SENSITIVE_TOOL_CONTEXT_LABEL)) {
      return "Data trusted by default policy";
    }

    if (!labels.includes(SENSITIVE_TOOL_CONTEXT_LABEL)) {
      return `Data trusted by policy: ${policy.description || "Unnamed policy"}`;
    }

    return `Data labeled by policy: ${policy.description || "Unnamed policy"}`;
  }
}

export default TrustedDataPolicyModel;
