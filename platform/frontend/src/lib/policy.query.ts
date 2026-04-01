import {
  SENSITIVE_TOOL_CONTEXT_LABEL,
  archestraApiSdk,
  type archestraApiTypes,
} from "@shared";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const {
  bulkUpsertDefaultCallPolicy,
  bulkUpsertDefaultResultPolicy,
  createToolInvocationPolicy,
  createTrustedDataPolicy,
  deleteToolInvocationPolicy,
  deleteTrustedDataPolicy,
  getOperators,
  getToolInvocationPolicies,
  getTrustedDataPolicies,
  updateToolInvocationPolicy,
  updateTrustedDataPolicy,
} = archestraApiSdk;

import {
  DEFAULT_POLICY_TEMPLATE,
  type CallPolicyAction,
  type ResultPolicyAction,
  isDefaultPolicyTemplate,
  transformToolInvocationPolicies,
  transformToolResultPolicies,
} from "./policy.utils";

export function useToolInvocationPolicies(
  initialData?: ReturnType<typeof transformToolInvocationPolicies>,
) {
  return useQuery({
    queryKey: ["tool-invocation-policies"],
    queryFn: async () => {
      const all = (await getToolInvocationPolicies()).data ?? [];
      return transformToolInvocationPolicies(all);
    },
    initialData,
  });
}

export function useOperators() {
  return useQuery({
    queryKey: ["operators"],
    queryFn: async () => (await getOperators()).data ?? [],
  });
}

export function useToolInvocationPolicyDeleteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      await deleteToolInvocationPolicy({ path: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-invocation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useToolInvocationPolicyCreateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      sortOrder,
      matchTemplate = DEFAULT_POLICY_TEMPLATE,
    }: {
      toolId: string;
      sortOrder: number;
      matchTemplate?: string;
    }) =>
      await createToolInvocationPolicy({
        body: {
          toolId,
          conditions: [],
          matchTemplate,
          sortOrder,
          action: "block_when_context_is_untrusted",
          reason: null,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-invocation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useToolInvocationPolicyUpdateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updatedPolicy: {
        id: string;
      } & NonNullable<archestraApiTypes.UpdateToolInvocationPolicyData["body"]>,
    ) => {
      const { id, ...body } = updatedPolicy;
      return await updateToolInvocationPolicy({
        body,
        path: { id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-invocation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useToolResultPolicies(
  initialData?: ReturnType<typeof transformToolResultPolicies>,
) {
  return useQuery({
    queryKey: ["tool-result-policies"],
    queryFn: async () => {
      const all = (await getTrustedDataPolicies()).data ?? [];
      return transformToolResultPolicies(all);
    },
    initialData,
  });
}

export function useToolResultPoliciesCreateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      sortOrder,
      matchTemplate = DEFAULT_POLICY_TEMPLATE,
    }: {
      toolId: string;
      sortOrder: number;
      matchTemplate?: string;
    }) =>
      await createTrustedDataPolicy({
        body: {
          toolId,
          conditions: [],
          matchTemplate,
          sortOrder,
          action: "assign_labels",
          labels: [SENSITIVE_TOOL_CONTEXT_LABEL],
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-result-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useToolResultPoliciesUpdateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      updatedPolicy: {
        id: string;
      } & NonNullable<archestraApiTypes.UpdateTrustedDataPolicyData["body"]>,
    ) => {
      const { id, ...body } = updatedPolicy;

      return await updateTrustedDataPolicy({
        body,
        path: { id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-result-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useToolResultPoliciesDeleteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      await deleteTrustedDataPolicy({ path: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-result-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useCallPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      action,
    }: {
      toolId: string;
      action: CallPolicyAction;
    }) => {
      const cachedPolicies = queryClient.getQueryData<
        ReturnType<typeof transformToolInvocationPolicies>
      >(["tool-invocation-policies"]);

      const existingPolicies = cachedPolicies?.byProfileToolId[toolId] || [];
      const defaultPolicy = existingPolicies.find((policy) =>
        isDefaultPolicyTemplate(policy.matchTemplate),
      );

      if (defaultPolicy) {
        return await updateToolInvocationPolicy({
          path: { id: defaultPolicy.id },
          body: { action },
        });
      }

      return await createToolInvocationPolicy({
        body: {
          toolId,
          conditions: [],
          matchTemplate: DEFAULT_POLICY_TEMPLATE,
          sortOrder: existingPolicies.length,
          action,
          reason: null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-invocation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useResultPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolId,
      action,
      labels,
    }: {
      toolId: string;
      action: ResultPolicyAction;
      labels?: string[];
    }) => {
      const cachedPolicies = queryClient.getQueryData<
        ReturnType<typeof transformToolResultPolicies>
      >(["tool-result-policies"]);

      const existingPolicies = cachedPolicies?.byProfileToolId[toolId] || [];
      const defaultPolicy = existingPolicies.find((policy) =>
        isDefaultPolicyTemplate(policy.matchTemplate),
      );

      const normalizedLabels =
        action === "assign_labels" ? labels ?? [SENSITIVE_TOOL_CONTEXT_LABEL] : [];

      if (defaultPolicy) {
        return await updateTrustedDataPolicy({
          path: { id: defaultPolicy.id },
          body: { action, labels: normalizedLabels },
        });
      }

      return await createTrustedDataPolicy({
        body: {
          toolId,
          conditions: [],
          matchTemplate: DEFAULT_POLICY_TEMPLATE,
          sortOrder: existingPolicies.length,
          action,
          labels: normalizedLabels,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-result-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useBulkCallPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      toolIds,
      action,
    }: {
      toolIds: string[];
      action: CallPolicyAction;
    }) => {
      const result = await bulkUpsertDefaultCallPolicy({
        body: { toolIds, action },
      });
      return result.data ?? { updated: 0, created: 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-invocation-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function useBulkResultPolicyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ toolIds }: { toolIds: string[] }) => {
      const result = await bulkUpsertDefaultResultPolicy({
        body: { toolIds, action: "assign_labels" },
      });
      return result.data ?? { updated: 0, created: 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tool-result-policies"] });
      queryClient.invalidateQueries({ queryKey: ["agent-tools"] });
    },
  });
}

export function prefetchOperators(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ["operators"],
    queryFn: async () => (await getOperators()).data ?? [],
  });
}

export function prefetchToolInvocationPolicies(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ["tool-invocation-policies"],
    queryFn: async () => {
      const all = (await getToolInvocationPolicies()).data ?? [];
      return transformToolInvocationPolicies(all);
    },
  });
}

export function prefetchToolResultPolicies(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ["tool-result-policies"],
    queryFn: async () => {
      const all = (await getTrustedDataPolicies()).data ?? [];
      return transformToolResultPolicies(all);
    },
  });
}
