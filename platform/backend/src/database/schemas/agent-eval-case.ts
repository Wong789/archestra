import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ExpectedToolCalls } from "@/types";
import agentEvalsTable from "./agent-eval";

const agentEvalCasesTable = pgTable(
  "agent_eval_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evalId: uuid("eval_id")
      .notNull()
      .references(() => agentEvalsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    expectedToolCalls: jsonb("expected_tool_calls").$type<ExpectedToolCalls>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    evalIdIdx: index("agent_eval_cases_eval_id_idx").on(table.evalId),
    orgIdIdx: index("agent_eval_cases_org_id_idx").on(table.organizationId),
  }),
);

export default agentEvalCasesTable;
