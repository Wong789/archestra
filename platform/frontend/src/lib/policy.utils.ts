import {
  SAFE_TOOL_CONTEXT_LABEL,
  SENSITIVE_TOOL_CONTEXT_LABEL,
  type archestraApiTypes,
} from "@shared";

export type CallPolicyAction =
  archestraApiTypes.GetToolInvocationPoliciesResponses["200"][number]["action"];

export type ResultPolicyAction =
  archestraApiTypes.GetTrustedDataPoliciesResponses["200"][number]["action"];

export const DEFAULT_POLICY_TEMPLATE = "{{true}}";

export const CALL_POLICY_ACTION_OPTIONS: {
  value: CallPolicyAction;
  label: string;
  description: string;
}[] = [
  {
    value: "block_when_context_is_untrusted",
    label: "Allow in safe context",
    description:
      "Runs only when the context does not carry the sensitive label.",
  },
  {
    value: "allow_when_context_is_untrusted",
    label: "Allow always",
    description: "Runs even when the context is already marked sensitive.",
  },
  {
    value: "require_approval",
    label: "Require approval",
    description:
      "Pauses for user confirmation in chat and blocks autonomous sessions.",
  },
  {
    value: "block_always",
    label: "Block always",
    description: "Never let this rule invoke the tool.",
  },
] as const;

export const RESULT_POLICY_ACTION_OPTIONS: {
  value: ResultPolicyAction;
  label: string;
  description: string;
}[] = [
  {
    value: "assign_labels",
    label: "Add labels",
    description: "Attach labels to the context for later tool-access rules.",
  },
  {
    value: "sanitize_with_dual_llm",
    label: "Sanitize with Dual LLM",
    description: "Rewrite the result before it reaches the model.",
  },
  {
    value: "block_always",
    label: "Block result",
    description: "Replace the tool output with a blocked-content notice.",
  },
] as const;

type InvocationPolicy =
  archestraApiTypes.GetToolInvocationPoliciesResponses["200"][number];

type ResultPolicy =
  archestraApiTypes.GetTrustedDataPoliciesResponses["200"][number];

export type TransformedInvocationPolicy = InvocationPolicy;
export type TransformedResultPolicy = ResultPolicy & { normalizedLabels: string[] };

export function isDefaultPolicyTemplate(template: string): boolean {
  return template.trim() === DEFAULT_POLICY_TEMPLATE;
}

export function transformToolInvocationPolicies(
  all: archestraApiTypes.GetToolInvocationPoliciesResponses["200"],
) {
  const transformed = [...all].sort(compareRules);
  const byProfileToolId = transformed.reduce(
    (acc, policy) => {
      acc[policy.toolId] = [...(acc[policy.toolId] || []), policy];
      return acc;
    },
    {} as Record<string, TransformedInvocationPolicy[]>,
  );

  return { all: transformed, byProfileToolId };
}

export function transformToolResultPolicies(
  all: archestraApiTypes.GetTrustedDataPoliciesResponses["200"],
) {
  const transformed: TransformedResultPolicy[] = [...all]
    .map((policy) => ({
      ...policy,
      normalizedLabels: normalizeResultPolicyLabels(policy),
    }))
    .sort(compareRules);

  const byProfileToolId = transformed.reduce(
    (acc, policy) => {
      acc[policy.toolId] = [...(acc[policy.toolId] || []), policy];
      return acc;
    },
    {} as Record<string, TransformedResultPolicy[]>,
  );

  return { all: transformed, byProfileToolId };
}

export function getCallPolicyActionFromPolicies(
  toolId: string,
  invocationPolicies: {
    byProfileToolId: Record<string, InvocationPolicy[]>;
  },
): CallPolicyAction {
  const policies = invocationPolicies.byProfileToolId[toolId] || [];
  const defaultRule = policies.find((policy) =>
    isDefaultPolicyTemplate(policy.matchTemplate),
  );
  return defaultRule?.action ?? "block_when_context_is_untrusted";
}

export function getResultPolicySummaryFromPolicies(
  toolId: string,
  resultPolicies: {
    byProfileToolId: Record<string, TransformedResultPolicy[]>;
  },
) {
  const policies = resultPolicies.byProfileToolId[toolId] || [];
  const defaultRule = policies.find((policy) =>
    isDefaultPolicyTemplate(policy.matchTemplate),
  );

  if (!defaultRule) {
    return {
      action: "assign_labels" as ResultPolicyAction,
      labels: [SENSITIVE_TOOL_CONTEXT_LABEL],
    };
  }

  return {
    action: normalizeResultPolicyAction(defaultRule.action),
    labels: normalizeResultPolicyLabels(defaultRule),
  };
}

export function normalizeResultPolicyAction(
  action: ResultPolicyAction,
): ResultPolicyAction {
  if (action === "mark_as_trusted" || action === "mark_as_untrusted") {
    return "assign_labels";
  }
  return action;
}

export function normalizeResultPolicyLabels(policy: {
  action: ResultPolicyAction;
  labels?: string[];
}): string[] {
  if (policy.action === "mark_as_trusted") {
    return [SAFE_TOOL_CONTEXT_LABEL];
  }

  if (policy.action === "mark_as_untrusted") {
    return [SENSITIVE_TOOL_CONTEXT_LABEL];
  }

  return policy.labels ?? [];
}

function compareRules<
  T extends { sortOrder: number; matchTemplate: string; createdAt: string | Date },
>(a: T, b: T): number {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  const aDefault = isDefaultPolicyTemplate(a.matchTemplate);
  const bDefault = isDefaultPolicyTemplate(b.matchTemplate);

  if (aDefault !== bDefault) {
    return aDefault ? 1 : -1;
  }

  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
