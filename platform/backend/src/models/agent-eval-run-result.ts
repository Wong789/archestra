import { and, eq } from "drizzle-orm";
import db, { schema } from "@/database";
import type {
  AgentEvalRunResult,
  DynamicScores,
  EvalResultStatus,
  StaticValidatorDetails,
} from "@/types";

class AgentEvalRunResultModel {
  static async findByRunId(
    runId: string,
    organizationId: string,
  ): Promise<AgentEvalRunResult[]> {
    return db
      .select()
      .from(schema.agentEvalRunResultsTable)
      .where(
        and(
          eq(schema.agentEvalRunResultsTable.runId, runId),
          eq(schema.agentEvalRunResultsTable.organizationId, organizationId),
        ),
      )
      .orderBy(schema.agentEvalRunResultsTable.createdAt);
  }

  static async createBatch(
    results: {
      runId: string;
      caseId: string;
      organizationId: string;
    }[],
  ): Promise<AgentEvalRunResult[]> {
    if (results.length === 0) return [];
    return db
      .insert(schema.agentEvalRunResultsTable)
      .values(results.map((r) => ({ ...r, status: "pending" as const })))
      .returning();
  }

  static async update(
    id: string,
    organizationId: string,
    data: {
      status?: EvalResultStatus;
      sessionId?: string;
      agentOutput?: Record<string, unknown>;
      staticPassed?: boolean;
      staticScore?: string;
      staticDetails?: StaticValidatorDetails;
      auditorPassed?: boolean;
      auditorScores?: DynamicScores;
      auditorTokens?: number;
      observerPassed?: boolean;
      observerScores?: DynamicScores;
      observerTokens?: number;
      overallScore?: string;
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<AgentEvalRunResult | null> {
    const [result] = await db
      .update(schema.agentEvalRunResultsTable)
      .set(data)
      .where(
        and(
          eq(schema.agentEvalRunResultsTable.id, id),
          eq(schema.agentEvalRunResultsTable.organizationId, organizationId),
        ),
      )
      .returning();
    return result ?? null;
  }
}

export default AgentEvalRunResultModel;
