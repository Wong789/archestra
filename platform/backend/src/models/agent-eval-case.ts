import type { PaginationQuery } from "@shared";
import { and, count, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import {
  createPaginatedResult,
  type PaginatedResult,
} from "@/database/utils/pagination";
import type {
  AgentEvalCase,
  InsertAgentEvalCase,
  UpdateAgentEvalCase,
} from "@/types";

class AgentEvalCaseModel {
  static async findByEvalId(
    evalId: string,
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<AgentEvalCase>> {
    const whereClause = and(
      eq(schema.agentEvalCasesTable.evalId, evalId),
      eq(schema.agentEvalCasesTable.organizationId, organizationId),
    );

    const [data, [{ count: total }]] = await Promise.all([
      db
        .select()
        .from(schema.agentEvalCasesTable)
        .where(whereClause)
        .orderBy(schema.agentEvalCasesTable.createdAt)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ count: count() })
        .from(schema.agentEvalCasesTable)
        .where(whereClause),
    ]);

    return createPaginatedResult(data, Number(total), pagination);
  }

  static async findAllByEvalId(
    evalId: string,
    organizationId: string,
  ): Promise<AgentEvalCase[]> {
    return db
      .select()
      .from(schema.agentEvalCasesTable)
      .where(
        and(
          eq(schema.agentEvalCasesTable.evalId, evalId),
          eq(schema.agentEvalCasesTable.organizationId, organizationId),
        ),
      )
      .orderBy(schema.agentEvalCasesTable.createdAt);
  }

  static async create(
    evalId: string,
    data: InsertAgentEvalCase,
    organizationId: string,
  ): Promise<AgentEvalCase> {
    const [result] = await db
      .insert(schema.agentEvalCasesTable)
      .values({ ...data, evalId, organizationId })
      .returning();
    return result;
  }

  static async update(
    id: string,
    data: UpdateAgentEvalCase,
    organizationId: string,
  ): Promise<AgentEvalCase | null> {
    const [result] = await db
      .update(schema.agentEvalCasesTable)
      .set(data)
      .where(
        and(
          eq(schema.agentEvalCasesTable.id, id),
          eq(schema.agentEvalCasesTable.organizationId, organizationId),
        ),
      )
      .returning();
    return result ?? null;
  }

  static async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentEvalCasesTable)
      .where(
        and(
          eq(schema.agentEvalCasesTable.id, id),
          eq(schema.agentEvalCasesTable.organizationId, organizationId),
        ),
      )
      .returning({ id: schema.agentEvalCasesTable.id });
    return result.length > 0;
  }
}

export default AgentEvalCaseModel;
