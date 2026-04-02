import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  DynamicScores,
  EvalResultStatus,
  StaticValidatorDetails,
} from "@/types";
import agentEvalCasesTable from "./agent-eval-case";
import agentEvalRunsTable from "./agent-eval-run";

const agentEvalRunResultsTable = pgTable(
  "agent_eval_run_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentEvalRunsTable.id, { onDelete: "cascade" }),
    caseId: uuid("case_id")
      .notNull()
      .references(() => agentEvalCasesTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    status: text("status")
      .$type<EvalResultStatus>()
      .notNull()
      .default("pending"),
    sessionId: text("session_id"),
    agentOutput: jsonb("agent_output").$type<Record<string, unknown>>(),
    staticPassed: boolean("static_passed"),
    staticScore: numeric("static_score", { precision: 5, scale: 4 }),
    staticDetails: jsonb("static_details").$type<StaticValidatorDetails>(),
    auditorPassed: boolean("auditor_passed"),
    auditorScores: jsonb("auditor_scores").$type<DynamicScores>(),
    auditorTokens: integer("auditor_tokens"),
    observerPassed: boolean("observer_passed"),
    observerScores: jsonb("observer_scores").$type<DynamicScores>(),
    observerTokens: integer("observer_tokens"),
    overallScore: numeric("overall_score", { precision: 5, scale: 4 }),
    error: text("error"),
    startedAt: timestamp("started_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    runIdIdx: index("agent_eval_run_results_run_id_idx").on(table.runId),
    caseIdIdx: index("agent_eval_run_results_case_id_idx").on(table.caseId),
    orgIdIdx: index("agent_eval_run_results_org_id_idx").on(
      table.organizationId,
    ),
  }),
);

export default agentEvalRunResultsTable;
