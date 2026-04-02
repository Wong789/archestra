import { archestraApiSdk, type archestraApiTypes } from "@shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleApiError } from "@/lib/utils";

const {
  getAgentEvals,
  getAgentEval,
  createAgentEval,
  updateAgentEval,
  deleteAgentEval,
  getAgentEvalCases,
  createAgentEvalCase,
  updateAgentEvalCase,
  deleteAgentEvalCase,
  getAgentEvalRuns,
  getAgentEvalRun,
  createAgentEvalRun,
} = archestraApiSdk;

// ===== Evals =====

export function useAgentEvals(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["agent-evals", params],
    queryFn: async () => {
      const response = await getAgentEvals({
        query: { limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data ?? null;
    },
  });
}

export function useAgentEval(evalId: string | null) {
  return useQuery({
    queryKey: ["agent-eval", evalId],
    queryFn: async () => {
      if (!evalId) return null;
      const response = await getAgentEval({ path: { evalId } });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data ?? null;
    },
    enabled: !!evalId,
  });
}

export function useCreateAgentEval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: archestraApiTypes.CreateAgentEvalData["body"]) => {
      const response = await createAgentEval({ body });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-evals"] });
      toast.success("Evaluation created");
    },
  });
}

export function useUpdateAgentEval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      evalId: string;
      body: archestraApiTypes.UpdateAgentEvalData["body"];
    }) => {
      const response = await updateAgentEval({
        path: { evalId: params.evalId },
        body: params.body,
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-evals"] });
      queryClient.invalidateQueries({ queryKey: ["agent-eval"] });
      toast.success("Evaluation updated");
    },
  });
}

export function useDeleteAgentEval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (evalId: string) => {
      const response = await deleteAgentEval({ path: { evalId } });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-evals"] });
      toast.success("Evaluation deleted");
    },
  });
}

// ===== Cases =====

export function useAgentEvalCases(
  evalId: string | null,
  params?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["agent-eval-cases", evalId, params],
    queryFn: async () => {
      if (!evalId) return null;
      const response = await getAgentEvalCases({
        path: { evalId },
        query: { limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data ?? null;
    },
    enabled: !!evalId,
  });
}

export function useCreateAgentEvalCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      evalId: string;
      body: archestraApiTypes.CreateAgentEvalCaseData["body"];
    }) => {
      const response = await createAgentEvalCase({
        path: { evalId: params.evalId },
        body: params.body,
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-eval-cases"] });
      toast.success("Case created");
    },
  });
}

export function useUpdateAgentEvalCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      evalId: string;
      caseId: string;
      body: archestraApiTypes.UpdateAgentEvalCaseData["body"];
    }) => {
      const response = await updateAgentEvalCase({
        path: { evalId: params.evalId, caseId: params.caseId },
        body: params.body,
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-eval-cases"] });
      toast.success("Case updated");
    },
  });
}

export function useDeleteAgentEvalCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { evalId: string; caseId: string }) => {
      const response = await deleteAgentEvalCase({
        path: { evalId: params.evalId, caseId: params.caseId },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-eval-cases"] });
      toast.success("Case deleted");
    },
  });
}

// ===== Runs =====

export function useAgentEvalRuns(
  evalId: string | null,
  params?: { limit?: number; offset?: number },
) {
  return useQuery({
    queryKey: ["agent-eval-runs", evalId, params],
    queryFn: async () => {
      if (!evalId) return null;
      const response = await getAgentEvalRuns({
        path: { evalId },
        query: { limit: params?.limit ?? 50, offset: params?.offset ?? 0 },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data ?? null;
    },
    enabled: !!evalId,
  });
}

export function useAgentEvalRun(evalId: string | null, runId: string | null) {
  return useQuery({
    queryKey: ["agent-eval-run", evalId, runId],
    queryFn: async () => {
      if (!evalId || !runId) return null;
      const response = await getAgentEvalRun({
        path: { evalId, runId },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data ?? null;
    },
    enabled: !!evalId && !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "pending" ? 3000 : false;
    },
  });
}

export function useCreateAgentEvalRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (evalId: string) => {
      const response = await createAgentEvalRun({
        path: { evalId },
      });
      if (response.error) {
        handleApiError(response.error);
        return null;
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-eval-runs"] });
      toast.success("Eval run started");
    },
  });
}
