"use client";

import { ExternalLink, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import Divider from "@/components/divider";
import { MsTeamsSetupDialog } from "@/components/ms-teams-setup-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChatOpsStatus } from "@/lib/chatops.query";
import config from "@/lib/config";
import { useFeatures } from "@/lib/config.query";
import { usePublicBaseUrl } from "@/lib/features.hook";
import {
  useNgrokStatus,
  useStartNgrokTunnel,
  useStopNgrokTunnel,
} from "@/lib/ngrok.query";
import { ChannelsSection } from "../_components/channels-section";
import { CollapsibleSetupSection } from "../_components/collapsible-setup-section";
import { CredentialField } from "../_components/credential-field";
import { LlmKeySetupStep } from "../_components/llm-key-setup-step";
import { SetupStep } from "../_components/setup-step";
import type { ProviderConfig } from "../_components/types";
import { useTriggerStatuses } from "../_components/use-trigger-statuses";

const msTeamsProviderConfig: ProviderConfig = {
  provider: "ms-teams",
  providerLabel: "MS Teams",
  providerIcon: "/icons/ms-teams.png",
  webhookPath: "/api/webhooks/chatops/ms-teams",
  docsUrl: "https://archestra.ai/docs/platform-ms-teams",
  slashCommand: "/select-agent",
  buildDeepLink: (binding) => {
    const channelName = encodeURIComponent(
      binding.channelName ?? binding.channelId,
    );
    const base = `https://teams.microsoft.com/l/channel/${encodeURIComponent(binding.channelId)}/${channelName}`;
    if (binding.workspaceId) {
      return `${base}?groupId=${encodeURIComponent(binding.workspaceId)}`;
    }
    return base;
  },
  getDmDeepLink: (providerStatus) => {
    const appId = providerStatus.dmInfo?.appId;
    if (!appId) return null;
    return `https://teams.microsoft.com/l/chat/0/0?users=28:${appId}`;
  },
};

export default function MsTeamsPage() {
  const publicBaseUrl = usePublicBaseUrl();
  const [msTeamsSetupOpen, setMsTeamsSetupOpen] = useState(false);
  const [ngrokDialogOpen, setNgrokDialogOpen] = useState(false);

  const { data: features, isLoading: featuresLoading } = useFeatures();
  const { data: chatOpsProviders, isLoading: statusLoading } =
    useChatOpsStatus();

  const ngrokDomain = features?.ngrokDomain;
  const msTeams = chatOpsProviders?.find((p) => p.id === "ms-teams");

  const setupDataLoading = featuresLoading || statusLoading;
  const isLocalDev =
    features?.isQuickstart || config.environment === "development";
  const { msTeams: allStepsCompleted } = useTriggerStatuses();

  return (
    <div className="flex flex-col gap-4">
      <CollapsibleSetupSection
        allStepsCompleted={allStepsCompleted}
        isLoading={setupDataLoading}
        providerLabel="Microsoft Teams"
        docsUrl="https://archestra.ai/docs/platform-ms-teams"
      >
        {isLocalDev ? (
          <SetupStep
            title="Make Archestra reachable from the Internet"
            description="The MS Teams bot needs to connect to an Archestra webhook — your instance must be publicly accessible"
            done={!!ngrokDomain}
            ctaLabel="Configure ngrok"
            onAction={() => setNgrokDialogOpen(true)}
            doneActionLabel="Manage"
            onDoneAction={() => setNgrokDialogOpen(true)}
          >
            {ngrokDomain ? (
              <>
                Ngrok domain{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  {ngrokDomain}
                </code>{" "}
                is configured.
              </>
            ) : (
              <>
                Archestra's webhook{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  POST {`${publicBaseUrl}/api/webhooks/chatops/ms-teams`}
                </code>{" "}
                needs to be reachable from the Internet. Configure ngrok or
                deploy to a public URL.
              </>
            )}
          </SetupStep>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
            <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm">
                Archestra's webhook must be reachable from the Internet
              </span>
              <span className="text-muted-foreground text-xs">
                The webhook endpoint{" "}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">
                  POST {`${publicBaseUrl}/api/webhooks/chatops/ms-teams`}
                </code>{" "}
                must be publicly accessible so MS Teams can deliver messages to
                Archestra
              </span>
            </div>
          </div>
        )}
        <LlmKeySetupStep />
        <SetupStep
          title="Setup MS Teams"
          description="Register a Teams bot application and connect it to Archestra"
          done={!!msTeams?.configured}
          ctaLabel="Setup MS Teams"
          onAction={() => setMsTeamsSetupOpen(true)}
          doneActionLabel="Reconfigure"
          onDoneAction={() => setMsTeamsSetupOpen(true)}
        >
          <div className="flex items-center flex-wrap gap-4">
            <CredentialField
              label="App ID"
              value={msTeams?.credentials?.appId}
            />
            <CredentialField
              label="App Secret"
              value={msTeams?.credentials?.appSecret}
            />
            <CredentialField
              label="Tenant ID"
              value={msTeams?.credentials?.tenantId}
              optional
            />
          </div>
        </SetupStep>
      </CollapsibleSetupSection>

      {allStepsCompleted && (
        <>
          <Divider />
          <ChannelsSection providerConfig={msTeamsProviderConfig} />
        </>
      )}

      <MsTeamsSetupDialog
        open={msTeamsSetupOpen}
        onOpenChange={setMsTeamsSetupOpen}
      />
      <NgrokSetupDialog
        open={ngrokDialogOpen}
        onOpenChange={setNgrokDialogOpen}
      />
    </div>
  );
}

function NgrokSetupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [authToken, setAuthToken] = useState("");
  const [domain, setDomain] = useState("");

  const { data: ngrokStatus } = useNgrokStatus();
  const startTunnel = useStartNgrokTunnel();
  const stopTunnel = useStopNgrokTunnel();

  const hasToken = ngrokStatus?.hasToken ?? false;
  const savedDomain = ngrokStatus?.savedDomain;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure ngrok</DialogTitle>
          <DialogDescription>
            Start an ngrok tunnel to make Archestra reachable from the Internet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {ngrokStatus?.running ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3">
                <Info className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-sm">Tunnel is running</span>
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    {ngrokStatus.url}
                  </code>
                </div>
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={stopTunnel.isPending}
                onClick={() => stopTunnel.mutate()}
              >
                {stopTunnel.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Stopping...
                  </>
                ) : (
                  "Stop tunnel"
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Auth token</span>
                  <Link
                    href="https://dashboard.ngrok.com/get-started/your-authtoken"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                  >
                    Get token
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
                <Input
                  type="password"
                  placeholder={
                    hasToken
                      ? "Token saved — enter a new one to change"
                      : "Paste your ngrok auth token"
                  }
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Domain{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional)
                  </span>
                </span>
                <Input
                  placeholder={savedDomain ?? "e.g. my-app.ngrok-free.dev"}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={
                  (!hasToken && !authToken.trim()) || startTunnel.isPending
                }
                onClick={() =>
                  startTunnel.mutate({
                    authToken: authToken.trim() || undefined,
                    domain: domain.trim() || undefined,
                  })
                }
              >
                {startTunnel.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Starting tunnel...
                  </>
                ) : (
                  "Start tunnel"
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
