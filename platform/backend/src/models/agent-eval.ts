import type { PaginationQuery } from "@shared";
import { and, count, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import {
  createPaginatedResult,
  type PaginatedResult,
} from "@/database/utils/pagination";
import type { AgentEval, InsertAgentEval, UpdateAgentEval } from "@/types";

class AgentEvalModel {
  static async findByOrganizationId(
    organizationId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResult<AgentEval>> {
    const whereClause = eq(
      schema.agentEvalsTable.organizationId,
      organizationId,
    );

    const [data, [{ count: total }]] = await Promise.all([
      db
        .select()
        .from(schema.agentEvalsTable)
        .where(whereClause)
        .orderBy(schema.agentEvalsTable.createdAt)
        .limit(pagination.limit)
        .offset(pagination.offset),
      db
        .select({ count: count() })
        .from(schema.agentEvalsTable)
        .where(whereClause),
    ]);

    return createPaginatedResult(data, Number(total), pagination);
  }

  static async findById(
    id: string,
    organizationId: string,
  ): Promise<AgentEval | null> {
    const [result] = await db
      .select()
      .from(schema.agentEvalsTable)
      .where(
        and(
          eq(schema.agentEvalsTable.id, id),
          eq(schema.agentEvalsTable.organizationId, organizationId),
        ),
      );
    return result ?? null;
  }

  static async create(
    data: InsertAgentEval,
    organizationId: string,
  ): Promise<AgentEval> {
    const [result] = await db
      .insert(schema.agentEvalsTable)
      .values({ ...data, organizationId })
      .returning();
    return result;
  }

  static async update(
    id: string,
    data: UpdateAgentEval,
    organizationId: string,
  ): Promise<AgentEval | null> {
    const [result] = await db
      .update(schema.agentEvalsTable)
      .set(data)
      .where(
        and(
          eq(schema.agentEvalsTable.id, id),
          eq(schema.agentEvalsTable.organizationId, organizationId),
        ),
      )
      .returning();
    return result ?? null;
  }

  static async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .delete(schema.agentEvalsTable)
      .where(
        and(
          eq(schema.agentEvalsTable.id, id),
          eq(schema.agentEvalsTable.organizationId, organizationId),
        ),
      )
      .returning({ id: schema.agentEvalsTable.id });
    return result.length > 0;
  }
}

export default AgentEvalModel;
