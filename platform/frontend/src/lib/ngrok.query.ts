import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getBackendBaseUrl } from "./config";

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  const res = await fetch(`${getBackendBaseUrl()}${path}`, {
    credentials: "include",
    ...(init?.body ? { headers: { "Content-Type": "application/json" } } : {}),
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.error?.message ?? `Request failed with status ${res.status}`,
    );
  }
  return res.json();
}

export function useNgrokStatus() {
  return useQuery({
    queryKey: ["ngrok", "status"],
    queryFn: () =>
      fetchJson<{
        running: boolean;
        url: string | null;
        domain: string | null;
        hasToken: boolean;
        savedDomain: string | null;
      }>("/api/ngrok/status"),
    refetchInterval: (query) => (query.state.data?.running ? 10_000 : false),
  });
}

export function useStartNgrokTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params?: { authToken?: string; domain?: string }) =>
      fetchJson<{ url: string; domain: string }>("/api/ngrok/start", {
        method: "POST",
        body: JSON.stringify({
          authToken: params?.authToken || undefined,
          domain: params?.domain || undefined,
        }),
      }),
    onSuccess: (data) => {
      if (data) {
        toast.success(`ngrok tunnel started: ${data.url}`);
      }
      queryClient.invalidateQueries({ queryKey: ["ngrok", "status"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => {
      toast.error(`Failed to start ngrok tunnel: ${error.message}`);
    },
  });
}

export function useStopNgrokTunnel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson<{ stopped: boolean }>("/api/ngrok/stop", { method: "POST" }),
    onSuccess: () => {
      toast.success("ngrok tunnel stopped");
      queryClient.invalidateQueries({ queryKey: ["ngrok", "status"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
    onError: (error) => {
      toast.error(`Failed to stop ngrok tunnel: ${error.message}`);
    },
  });
}
