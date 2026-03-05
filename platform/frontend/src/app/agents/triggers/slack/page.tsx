"use client";

import { AlertTriangle, ExternalLink, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import Divider from "@/components/divider";
import { SlackSetupDialog } from "@/components/slack-setup-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useChatOpsStatus } from "@/lib/chatops.query";
import { useUpdateSlackChatOpsConfig } from "@/lib/chatops-config.query";
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

const slackProviderConfig: ProviderConfig = {
  provider: "slack",
  providerLabel: "Slack",
  providerIcon: "/icons/slack.png",
  webhookPath: "/api/webhooks/chatops/slack",
  docsUrl: "https://archestra.ai/docs/platform-slack",
  slashCommand: "/archestra-select-agent",
  buildDeepLink: (binding) => {
    if (binding.workspaceId) {
      return `slack://channel?team=${binding.workspaceId}&id=${binding.channelId}`;
    }
    return `slack://channel?id=${binding.channelId}`;
  },
  getDmDeepLink: (providerStatus) => {
    const { botUserId, teamId } = providerStatus.dmInfo ?? {};
    if (!botUserId || !teamId) return null;
    return `slack://user?team=${teamId}&id=${botUserId}`;
  },
};

export default function SlackPage() {
  const publicBaseUrl = usePublicBaseUrl();
  const [slackSetupOpen, setSlackSetupOpen] = useState(false);
  const [ngrokDialogOpen, setNgrokDialogOpen] = useState(false);

  const { data: features, isLoading: featuresLoading } = useFeatures();
  const { data: chatOpsProviders, isLoading: statusLoading } =
    useChatOpsStatus();

  const ngrokDomain = features?.ngrokDomain;
  const slack = chatOpsProviders?.find((p) => p.id === "slack");
  const slackCreds = slack?.credentials as Record<string, string> | undefined;

  const resetMutation = useUpdateSlackChatOpsConfig();

  // Connection mode: use saved value if configured, otherwise default to "socket"
  const savedMode = slackCreds?.connectionMode as
    | "socket"
    | "webhook"
    | undefined;
  const [selectedMode, setSelectedMode] = useState<"socket" | "webhook">(
    savedMode ?? "socket",
  );
  // Sync local state when saved config loads or changes (e.g. after reset)
  useEffect(() => {
    if (savedMode) setSelectedMode(savedMode);
  }, [savedMode]);
  const isSocket = (savedMode ?? selectedMode) === "socket";
  const hasModeChange = savedMode != null && selectedMode !== savedMode;

  const setupDataLoading = featuresLoading || statusLoading;
  const isLocalDev =
    features?.isQuickstart || config.environment === "development";
  const { slack: allStepsCompleted } = useTriggerStatuses();

  return (
    <div className="flex flex-col gap-4">
      <CollapsibleSetupSection
        allStepsCompleted={allStepsCompleted}
        isLoading={setupDataLoading}
        providerLabel="Slack"
        docsUrl="https://archestra.ai/docs/platform-slack"
      >
        <SetupStep
          title="Choose connection mode"
          description="How Slack delivers events to Archestra"
          done={
            !hasModeChange && (isSocket || (isLocalDev ? !!ngrokDomain : true))
          }
          ctaLabel={
            !isSocket && isLocalDev && !ngrokDomain && !hasModeChange
              ? "Configure ngrok"
              : undefined
          }
          onAction={() => setNgrokDialogOpen(true)}
          doneActionLabel={!isSocket && isLocalDev ? "Manage ngrok" : undefined}
          onDoneAction={
            !isSocket && isLocalDev ? () => setNgrokDialogOpen(true) : undefined
          }
        >
          <RadioGroup
            value={selectedMode}
            onValueChange={(v) => setSelectedMode(v as "socket" | "webhook")}
            className="flex gap-6"
          >
            {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders an input */}
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="socket" className="mt-1" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  WebSocket
                </span>
                <span className="text-xs text-muted-foreground">
                  Archestra exchanges WebSocket messages with Slack, no public
                  URL needed
                </span>
              </div>
            </label>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: RadioGroupItem renders an input */}
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="webhook" className="mt-1" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  Webhook
                </span>
                <span className="text-xs text-muted-foreground">
                  Slack makes HTTP requests to Archestra, requires a public URL
                </span>
              </div>
            </label>
          </RadioGroup>
          {selectedMode === "webhook" && !hasModeChange && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 mt-3">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <span className="text-muted-foreground text-xs">
                {isLocalDev && ngrokDomain ? (
                  <>
                    Ngrok domain{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      {ngrokDomain}
                    </code>{" "}
                    is configured.
                  </>
                ) : (
                  <>
                    The webhook endpoint{" "}
                    <code className="bg-muted px-1 py-0.5 rounded">
                      POST {`${publicBaseUrl}/api/webhooks/chatops/slack`}
                    </code>{" "}
                    must be publicly accessible so Slack can deliver events to
                    Archestra.
                    {isLocalDev &&
                      " Configure ngrok or deploy to a public URL."}
                  </>
                )}
              </span>
            </div>
          )}
          {hasModeChange && (
            <div className="mt-3 space-y-3">
              {slack?.configured && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground text-xs">
                    Changing the connection mode will reset your Slack
                    configuration. You will need to reconfigure Slack with a new
                    app manifest.
                  </span>
                </div>
              )}
              <Button
                size="sm"
                variant={slack?.configured ? "destructive" : "default"}
                disabled={resetMutation.isPending}
                onClick={async () => {
                  await resetMutation.mutateAsync({
                    enabled: false,
                    connectionMode: selectedMode,
                    botToken: "",
                    signingSecret: "",
                    appLevelToken: "",
                    appId: "",
                  });
                }}
              >
                {resetMutation.isPending
                  ? "Saving..."
                  : slack?.configured
                    ? "Reset & switch mode"
                    : "Save"}
              </Button>
            </div>
          )}
        </SetupStep>
        <LlmKeySetupStep />
        <SetupStep
          title="Setup Slack"
          description="Create a Slack App from manifest and connect it to Archestra"
          done={!!slack?.configured}
          ctaLabel="Setup Slack"
          onAction={() => setSlackSetupOpen(true)}
          doneActionLabel="Reconfigure"
          onDoneAction={() => setSlackSetupOpen(true)}
        >
          <div className="flex items-center flex-wrap gap-4">
            <CredentialField
              label="Mode"
              value={isSocket ? "Socket" : "Webhook"}
            />
            <CredentialField label="Bot Token" value={slackCreds?.botToken} />
            {isSocket ? (
              <CredentialField
                label="App-Level Token"
                value={slackCreds?.appLevelToken}
              />
            ) : (
              <CredentialField
                label="Signing Secret"
                value={slackCreds?.signingSecret}
              />
            )}
            <CredentialField label="App ID" value={slackCreds?.appId} />
          </div>
        </SetupStep>
      </CollapsibleSetupSection>

      {allStepsCompleted && (
        <>
          <Divider />
          <ChannelsSection providerConfig={slackProviderConfig} />
        </>
      )}

      <SlackSetupDialog
        open={slackSetupOpen}
        onOpenChange={setSlackSetupOpen}
        connectionMode={savedMode ?? selectedMode}
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
