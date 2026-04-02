import type { PaginationQuery } from "@shared";
import { and, count, desc, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import {
  createPaginatedResult,
  type PaginatedResult,
} from "@/database/utils/pagination";
import type { AgentEvalRun, EvalRunStatus, EvalRunSummary } from "@/types";

class AgentEvalRunModel {
  static async findByEvalId(
    evalId: string,
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<AgentEvalRun>> {
    const whereClause = and(
      eq(schema.agentEvalRunsTable.evalId, evalId),
      eq(schema.agentEvalRunsTable.organizationId, organizationId),
    );

    const [data, [{ count: total }]] = await Promise.all([
      db
        .select()
        .from(schema.agentEvalRunsTable)
        .where(whereClause)
        .orderBy(desc(schema.agentEvalRunsTable.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ count: count() })
        .from(schema.agentEvalRunsTable)
        .where(whereClause),
    ]);

    return createPaginatedResult(data, Number(total), pagination);
  }

  static async findById(
    id: string,
    organizationId: string,
  ): Promise<AgentEvalRun | null> {
    const [result] = await db
      .select()
      .from(schema.agentEvalRunsTable)
      .where(
        and(
          eq(schema.agentEvalRunsTable.id, id),
          eq(schema.agentEvalRunsTable.organizationId, organizationId),
        ),
      );
    return result ?? null;
  }

  static async create(
    evalId: string,
    organizationId: string,
  ): Promise<AgentEvalRun> {
    const [result] = await db
      .insert(schema.agentEvalRunsTable)
      .values({ evalId, organizationId, status: "pending" })
      .returning();
    return result;
  }

  static async updateStatus(params: {
    id: string;
    organizationId: string;
    status: EvalRunStatus;
    startedAt?: Date;
    completedAt?: Date;
    summary?: EvalRunSummary;
  }): Promise<AgentEvalRun | null> {
    const { id, organizationId, ...updateData } = params;
    const [result] = await db
      .update(schema.agentEvalRunsTable)
      .set(updateData)
      .where(
        and(
          eq(schema.agentEvalRunsTable.id, id),
          eq(schema.agentEvalRunsTable.organizationId, organizationId),
        ),
      )
      .returning();
    return result ?? null;
  }
}

export default AgentEvalRunModel;
