"use client";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAgentEvalCases, useAgentEvalRun } from "@/lib/agent-eval.query";
import { EvalRunStats } from "../../../_components/eval-run-stats";

function ResultIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin" />;
    default:
      return <span className="h-4 w-4 rounded-full bg-muted" />;
  }
}

function getResultScore(result: { overallScore?: unknown }): number | null {
  if (result.overallScore == null) return null;
  return Math.round(Number(result.overallScore) * 100);
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

function PassFailBadge({ passed }: { passed: boolean | null }) {
  if (passed === null) return <span className="text-muted-foreground">—</span>;
  return passed ? (
    <Badge variant="default">Pass</Badge>
  ) : (
    <Badge variant="destructive">Fail</Badge>
  );
}

export default function RunResultsClient({
  evalId,
  runId,
}: {
  evalId: string;
  runId: string;
}) {
  const { data: run, isLoading } = useAgentEvalRun(evalId, runId);
  const { data: casesData } = useAgentEvalCases(evalId);

  if (isLoading) return <LoadingSpinner />;
  if (!run) return <div>Run not found</div>;

  const caseNames = new Map(
    ((casesData?.data ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );

  const isRunning = run.status === "running" || run.status === "pending";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/agents/evals/${evalId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            Run Results
            {isRunning && (
              <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            Status: {run.status} | Created:{" "}
            {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Stats dashboard */}
      {run.summary && (
        <EvalRunStats
          summary={
            run.summary as unknown as React.ComponentProps<
              typeof EvalRunStats
            >["summary"]
          }
        />
      )}

      {/* Results table */}
      <div className="space-y-3">
        <h3 className="font-medium">Per-Case Results</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Case</TableHead>
              <TableHead>Static</TableHead>
              <TableHead>Auditor</TableHead>
              <TableHead>Observer</TableHead>
              <TableHead>Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(run.results ?? []).map((result) => (
              <TableRow key={result.id}>
                <TableCell>
                  <ResultIcon status={result.status} />
                </TableCell>
                <TableCell className="font-medium font-mono text-sm">
                  {caseNames.get(result.caseId) ?? result.caseId}
                </TableCell>
                <TableCell>
                  <PassFailBadge passed={result.staticPassed} />
                </TableCell>
                <TableCell>
                  <PassFailBadge passed={result.auditorPassed} />
                </TableCell>
                <TableCell>
                  <PassFailBadge passed={result.observerPassed} />
                </TableCell>
                <TableCell>
                  {(() => {
                    const score = getResultScore(result);
                    return score !== null ? (
                      <ScoreBadge score={score} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    );
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
