"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface EvalRunSummary {
  totalCases: number;
  staticValidator: {
    passCount: number;
    failCount: number;
    passRate: number;
    avgScore: number;
  };
  auditor: {
    passCount: number;
    failCount: number;
    passRate: number;
    avgScores: Record<string, number>;
    totalTokensUsed: number;
  };
  observer: {
    passCount: number;
    failCount: number;
    passRate: number;
    avgScores: Record<string, number>;
    totalTokensUsed: number;
  };
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export function EvalRunStats({ summary }: { summary: EvalRunSummary }) {
  return (
    <div className="space-y-4">
      {/* Method breakdowns */}
      <div className="grid grid-cols-3 gap-4">
        {/* Static Validator */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Static Validator
            </CardTitle>
            <CardDescription>
              Pass: {summary.staticValidator.passCount} / Fail:{" "}
              {summary.staticValidator.failCount}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Average Score</span>
                <span>
                  {(summary.staticValidator.avgScore * 100).toFixed(0)}%
                </span>
              </div>
              <ScoreBar score={summary.staticValidator.avgScore} max={1} />
            </div>
          </CardContent>
        </Card>

        {/* Sub-Agent Auditor */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Sub-Agent Auditor
            </CardTitle>
            <CardDescription>
              Pass: {summary.auditor.passCount} / Fail:{" "}
              {summary.auditor.failCount}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(summary.auditor.avgScores).map(([key, val]) => (
              <div key={key}>
                <div className="text-xs text-muted-foreground capitalize mb-1">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </div>
                <ScoreBar score={val} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Observer Agent */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Observer Agent
            </CardTitle>
            <CardDescription>
              Pass: {summary.observer.passCount} / Fail:{" "}
              {summary.observer.failCount}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(summary.observer.avgScores).map(([key, val]) => (
              <div key={key}>
                <div className="text-xs text-muted-foreground capitalize mb-1">
                  {key.replace(/([A-Z])/g, " $1").trim()}
                </div>
                <ScoreBar score={val} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
