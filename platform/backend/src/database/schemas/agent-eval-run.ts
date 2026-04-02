import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { EvalRunStatus, EvalRunSummary } from "@/types";
import agentEvalsTable from "./agent-eval";

const agentEvalRunsTable = pgTable(
  "agent_eval_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evalId: uuid("eval_id")
      .notNull()
      .references(() => agentEvalsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    status: text("status").$type<EvalRunStatus>().notNull().default("pending"),
    startedAt: timestamp("started_at", { mode: "date" }),
    completedAt: timestamp("completed_at", { mode: "date" }),
    summary: jsonb("summary").$type<EvalRunSummary>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    evalIdIdx: index("agent_eval_runs_eval_id_idx").on(table.evalId),
    orgIdIdx: index("agent_eval_runs_org_id_idx").on(table.organizationId),
  }),
);

export default agentEvalRunsTable;
