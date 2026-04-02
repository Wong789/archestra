import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { EvalCriteria } from "@/types";
import agentsTable from "./agent";

const agentEvalsTable = pgTable(
  "agent_evals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    agentId: uuid("agent_id").references(() => agentsTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    criteria: jsonb("criteria").$type<EvalCriteria>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    orgIdIdx: index("agent_evals_org_id_idx").on(table.organizationId),
    agentIdIdx: index("agent_evals_agent_id_idx").on(table.agentId),
  }),
);

export default agentEvalsTable;
