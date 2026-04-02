"use client";

import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { LoadingSpinner } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  useAgentEval,
  useAgentEvalCases,
  useAgentEvalRuns,
  useCreateAgentEvalRun,
  useDeleteAgentEvalCase,
  useUpdateAgentEval,
} from "@/lib/agent-eval.query";
import { CaseDialog } from "../_components/case-dialog";

// ===== Helpers =====

interface ParsedCriterion {
  name: string;
  description: string;
}

interface EvalCaseRow {
  id: string;
  name: string;
  input: unknown;
  description: string | null;
  expectedToolCalls: { yaml?: string; toolCalls?: unknown[] } | null;
}

function parseCriteriaYaml(yaml: string): ParsedCriterion[] | null {
  try {
    const items: ParsedCriterion[] = [];
    const itemRegex = /-\s+name:\s*(.+)/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(yaml)) !== null) {
      const name = match[1].trim().replace(/^["']|["']$/g, "");
      const afterName = yaml.slice(match.index + match[0].length);
      const descMatch = afterName.match(
        /^\s*\n\s+description:\s*["']?([^"'\n]+)["']?/,
      );
      const description = descMatch ? descMatch[1].trim() : "";
      items.push({ name, description });
    }
    return items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

function getRunScore(summary: unknown): number | null {
  if (!summary || typeof summary !== "object") return null;
  const s = summary as { overallScore?: number };
  if (typeof s.overallScore !== "number") return null;
  return Math.round(s.overallScore * 100);
}

function ScoreBadge({ score }: { score: number }) {
  const variant =
    score >= 70 ? "default" : score >= 40 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="tabular-nums">
      {score}%
    </Badge>
  );
}

function statusDotColor(status: string, score: number | null): string {
  if (status === "running") return "bg-blue-500 animate-pulse";
  if (status === "failed") return "bg-red-500";
  if (status !== "completed") return "bg-muted";
  if (score !== null && score < 40) return "bg-red-500";
  if (score !== null && score < 70) return "bg-yellow-500";
  return "bg-green-500";
}

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} · ${timePart}`;
}

const CRITERION_COLORS = [
  "border-l-primary",
  "border-l-blue-500",
  "border-l-orange-500",
  "border-l-green-500",
];

// ===== Stats Strip =====

const scoreChartConfig: ChartConfig = {
  score: {
    label: "Score",
    color: "var(--chart-1)",
  },
};

function StatsStrip({
  runs,
}: {
  runs: { id: string; createdAt: string; summary: unknown; status: string }[];
}) {
  const scores = useMemo(
    () =>
      runs
        .map((r) => getRunScore(r.summary))
        .filter((s): s is number => s !== null),
    [runs],
  );

  const chartData = useMemo(
    () =>
      [...runs]
        .filter((r) => getRunScore(r.summary) !== null)
        .reverse()
        .map((r) => ({
          label: new Date(r.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          score: getRunScore(r.summary)!,
        })),
    [runs],
  );

  const latestScore = scores.length > 0 ? scores[0] : null;

  return (
    <div className="grid grid-cols-[auto_1fr] gap-px overflow-hidden rounded-lg border">
      {/* Latest Score */}
      <div className="bg-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Latest Score
        </p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-3xl font-bold tabular-nums">
            {latestScore ?? "—"}
          </span>
          {latestScore !== null && (
            <span className="text-sm text-muted-foreground">/ 100</span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="flex flex-col bg-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Score Trend
        </p>
        <div className="mt-1 flex-1">
          {chartData.length >= 2 ? (
            <ChartContainer
              config={scoreChartConfig}
              className="h-32 w-full"
            >
              <LineChart
                data={chartData}
                margin={{ top: 8, left: 12, right: 12, bottom: 0 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  fontSize={11}
                />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => `${v}%`}
                  fontSize={11}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-mono font-medium tabular-nums">
                          {Number(value)}%
                        </span>
                      )}
                    />
                  }
                />
                <Line
                  dataKey="score"
                  type="monotone"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                  dot={{
                    strokeWidth: 1,
                    r: 3,
                    fill: "white",
                    stroke: "var(--color-score)",
                  }}
                  activeDot={{ strokeWidth: 0, r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="flex h-32 items-center text-xs text-muted-foreground">
              {chartData.length === 1
                ? "One more run to see trend"
                : "No data yet"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===== Main Component =====

export default function EvalDetailClient({ evalId }: { evalId: string }) {
  const { data: evalItem, isLoading: evalLoading } = useAgentEval(evalId);
  const { data: casesData, isLoading: casesLoading } =
    useAgentEvalCases(evalId);
  const { data: runsData, isLoading: runsLoading } = useAgentEvalRuns(evalId);
  const createRun = useCreateAgentEvalRun();
  const deleteCase = useDeleteAgentEvalCase();
  const updateEval = useUpdateAgentEval();
  const [caseDialogOpen, setCaseDialogOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<EvalCaseRow | null>(null);
  const [criteriaYaml, setCriteriaYaml] = useState("");
  const [criteriaInitialized, setCriteriaInitialized] = useState(false);
  const [criteriaEditorOpen, setCriteriaEditorOpen] = useState(false);
  const [casesOpen, setCasesOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);

  useEffect(() => {
    if (evalItem && !criteriaInitialized) {
      const existing = (evalItem as { criteria?: { yaml?: string } }).criteria
        ?.yaml;
      setCriteriaYaml(existing ?? "");
      setCriteriaInitialized(true);
    }
  }, [evalItem, criteriaInitialized]);

  if (evalLoading) return <LoadingSpinner />;
  if (!evalItem) return <div>Evaluation not found</div>;

  const hasCriteria = !!(evalItem as { criteria?: { criteria?: unknown[] } })
    .criteria?.criteria?.length;

  const cases = (casesData?.data ?? []) as EvalCaseRow[];
  const runs = runsData?.data ?? [];

  const parsedCriteria = parseCriteriaYaml(criteriaYaml);
  const showFallbackEditor =
    !parsedCriteria && criteriaYaml.trim().length > 0;

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/agents/evals">
            <Button variant="ghost" size="icon-sm" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {evalItem.name}
            </h1>
            {evalItem.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {evalItem.description}
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={() => createRun.mutate(evalId)}
          disabled={
            createRun.isPending || cases.length === 0 || !hasCriteria
          }
          title={
            !hasCriteria ? "Set criteria YAML before running" : undefined
          }
          className="shrink-0"
        >
          <Play className="mr-2 h-4 w-4" />
          Run Eval
        </Button>
      </div>

      {/* Stats Strip */}
      <StatsStrip runs={runs} />

      {/* Scoring Criteria */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Scoring Criteria
          </p>
          {!criteriaEditorOpen && !showFallbackEditor && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-primary"
              onClick={() => setCriteriaEditorOpen(true)}
            >
              Edit
            </Button>
          )}
        </div>

        {parsedCriteria && !criteriaEditorOpen && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {parsedCriteria.map((c, i) => (
              <div
                key={c.name}
                className={`rounded-lg border border-l-4 px-4 py-3 ${CRITERION_COLORS[i % CRITERION_COLORS.length]}`}
              >
                <p className="font-mono text-sm font-semibold">{c.name}</p>
                {c.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {!parsedCriteria &&
          !criteriaEditorOpen &&
          criteriaYaml.trim().length === 0 && (
            <p className="text-sm text-muted-foreground">
              No criteria defined. Add criteria YAML to enable evaluations.
            </p>
          )}

        {(criteriaEditorOpen || showFallbackEditor) && (
          <div className="space-y-2">
            <Textarea
              id="criteriaYaml"
              value={criteriaYaml}
              onChange={(e) => setCriteriaYaml(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              placeholder={`criteria:\n  - name: triage\n    description: "Did the agent correctly identify the alert type?"\n  - name: investigation\n    description: "Did the agent make sufficient tool calls?"`}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCriteriaEditorOpen(false)}
              >
                <X className="mr-1 h-3 w-3" />
                Close
              </Button>
              <Button
                size="sm"
                disabled={updateEval.isPending}
                onClick={() => {
                  updateEval.mutate(
                    {
                      evalId,
                      body: { criteriaYaml } as Record<string, unknown>,
                    },
                    { onSuccess: () => setCriteriaEditorOpen(false) },
                  );
                }}
              >
                <Save className="mr-1 h-3 w-3" />
                Save
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Test Cases — collapsible */}
      <Collapsible open={casesOpen} onOpenChange={setCasesOpen}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2">
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  !casesOpen ? "-rotate-90" : ""
                }`}
              />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Test Cases
              </span>
              {cases.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {cases.length}
                </Badge>
              )}
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingCase(null);
                setCaseDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>

          <CollapsibleContent>
            {casesLoading ? (
              <LoadingSpinner />
            ) : cases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No cases yet. Add a case to start evaluating.
              </p>
            ) : (
              <div className="rounded-lg border">
                {cases.map((c, idx) => {
                  const assertionCount =
                    c.expectedToolCalls?.toolCalls?.length ?? 0;
                  return (
                    <div key={c.id}>
                      {idx > 0 && <Separator />}
                      <div className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-muted/50">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="truncate font-mono text-sm">
                            {c.name}
                          </span>
                          {assertionCount > 0 ? (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-xs"
                            >
                              {assertionCount} rule
                              {assertionCount !== 1 && "s"}
                            </Badge>
                          ) : (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              No assertions
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditingCase(c);
                              setCaseDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() =>
                              deleteCase.mutate({ evalId, caseId: c.id })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Recent Runs — collapsible */}
      <Collapsible open={runsOpen} onOpenChange={setRunsOpen}>
        <div className="space-y-3">
          <CollapsibleTrigger className="flex items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                !runsOpen ? "-rotate-90" : ""
              }`}
            />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Recent Runs
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent>
            {runsLoading ? (
              <LoadingSpinner />
            ) : runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => {
                  const duration =
                    run.startedAt && run.completedAt
                      ? `${((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000).toFixed(1)}s`
                      : "—";
                  const score = getRunScore(run.summary);
                  return (
                    <div
                      key={run.id}
                      className="flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30"
                    >
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusDotColor(run.status, score)}`}
                      />
                      <span className="text-sm">
                        {formatRunDate(run.createdAt)}
                      </span>
                      <div className="ml-auto flex items-center gap-4">
                        {score !== null && <ScoreBadge score={score} />}
                        <span className="text-sm tabular-nums text-muted-foreground">
                          {duration}
                        </span>
                        <Link
                          href={`/agents/evals/${evalId}/runs/${run.id}`}
                          className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                        >
                          Results →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <CaseDialog
        evalId={evalId}
        editCase={editingCase}
        open={caseDialogOpen}
        onOpenChange={setCaseDialogOpen}
      />
    </div>
  );
}
