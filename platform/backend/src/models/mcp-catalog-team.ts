import { and, eq, inArray, sql } from "drizzle-orm";
import db, { schema } from "@/database";
import logger from "@/logging";

class McpCatalogTeamModel {
  /**
   * Get all catalog IDs that a user has access to.
   * Three sources of access:
   * 1. Org-scoped catalog items (visible to all)
   * 2. Author's own personal catalog items
   * 3. Team-scoped catalog items where user is a team member
   */
  static async getUserAccessibleCatalogIds(
    userId: string,
    isAdmin: boolean,
  ): Promise<string[]> {
    logger.debug(
      { userId, isAdmin },
      "McpCatalogTeamModel.getUserAccessibleCatalogIds: starting",
    );
    // Admins have access to all catalog items
    if (isAdmin) {
      const allItems = await db
        .select({ id: schema.internalMcpCatalogTable.id })
        .from(schema.internalMcpCatalogTable);

      logger.debug(
        { userId, count: allItems.length },
        "McpCatalogTeamModel.getUserAccessibleCatalogIds: admin access to all items",
      );
      return allItems.map((item) => item.id);
    }

    // Single query: UNION of org-scoped, author's own, and team-scoped items
    const result = await db.execute<{ id: string }>(sql`
      SELECT id FROM internal_mcp_catalog WHERE scope = 'org'
      UNION
      SELECT id FROM internal_mcp_catalog WHERE author_id = ${userId} AND scope = 'personal'
      UNION
      SELECT mct.catalog_id AS id
        FROM mcp_catalog_team mct
        INNER JOIN internal_mcp_catalog c ON mct.catalog_id = c.id
        INNER JOIN team_member tm ON mct.team_id = tm.team_id
        WHERE tm.user_id = ${userId} AND c.scope = 'team'
    `);

    const accessibleIds = result.rows.map((r) => r.id);

    logger.debug(
      { userId, count: accessibleIds.length },
      "McpCatalogTeamModel.getUserAccessibleCatalogIds: completed",
    );
    return accessibleIds;
  }

  /**
   * Check if a user has access to a specific catalog item.
   * Access rules (in order):
   * 1. Admin → true
   * 2. scope = 'org' → true
   * 3. scope = 'personal' → only the author has access
   * 4. scope = 'team' AND user is in one of item's teams → true
   */
  static async userHasCatalogAccess(
    userId: string,
    catalogId: string,
    isAdmin: boolean,
  ): Promise<boolean> {
    logger.debug(
      { userId, catalogId, isAdmin },
      "McpCatalogTeamModel.userHasCatalogAccess: checking access",
    );
    // 1. Admin → true
    if (isAdmin) {
      return true;
    }

    // Fetch item's scope and authorId
    const [item] = await db
      .select({
        scope: schema.internalMcpCatalogTable.scope,
        authorId: schema.internalMcpCatalogTable.authorId,
      })
      .from(schema.internalMcpCatalogTable)
      .where(eq(schema.internalMcpCatalogTable.id, catalogId))
      .limit(1);

    if (!item) {
      return false;
    }

    // 2. scope = 'org' → true
    if (item.scope === "org") {
      return true;
    }

    // 3. scope = 'personal' → only the author has access
    if (item.scope === "personal") {
      return item.authorId === userId;
    }

    // 4. scope = 'team' AND user is in one of item's teams
    if (item.scope === "team") {
      const userTeams = await db
        .select({ teamId: schema.teamMembersTable.teamId })
        .from(schema.teamMembersTable)
        .where(eq(schema.teamMembersTable.userId, userId));

      const teamIds = userTeams.map((t) => t.teamId);

      if (teamIds.length === 0) {
        return false;
      }

      const catalogTeam = await db
        .select()
        .from(schema.mcpCatalogTeamsTable)
        .where(
          and(
            eq(schema.mcpCatalogTeamsTable.catalogId, catalogId),
            inArray(schema.mcpCatalogTeamsTable.teamId, teamIds),
          ),
        )
        .limit(1);

      return catalogTeam.length > 0;
    }

    return false;
  }

  /**
   * Get team details (id and name) for a specific catalog item
   */
  static async getTeamDetailsForCatalog(
    catalogId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const catalogTeams = await db
      .select({
        teamId: schema.mcpCatalogTeamsTable.teamId,
        teamName: schema.teamsTable.name,
      })
      .from(schema.mcpCatalogTeamsTable)
      .innerJoin(
        schema.teamsTable,
        eq(schema.mcpCatalogTeamsTable.teamId, schema.teamsTable.id),
      )
      .where(eq(schema.mcpCatalogTeamsTable.catalogId, catalogId));

    return catalogTeams.map((ct) => ({
      id: ct.teamId,
      name: ct.teamName,
    }));
  }

  /**
   * Get team details (id and name) for multiple catalog items in one query to avoid N+1
   */
  static async getTeamDetailsForCatalogs(
    catalogIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    if (catalogIds.length === 0) {
      return new Map();
    }

    const catalogTeams = await db
      .select({
        catalogId: schema.mcpCatalogTeamsTable.catalogId,
        teamId: schema.mcpCatalogTeamsTable.teamId,
        teamName: schema.teamsTable.name,
      })
      .from(schema.mcpCatalogTeamsTable)
      .innerJoin(
        schema.teamsTable,
        eq(schema.mcpCatalogTeamsTable.teamId, schema.teamsTable.id),
      )
      .where(inArray(schema.mcpCatalogTeamsTable.catalogId, catalogIds));

    const teamsMap = new Map<string, Array<{ id: string; name: string }>>();

    // Initialize all catalog IDs with empty arrays
    for (const catalogId of catalogIds) {
      teamsMap.set(catalogId, []);
    }

    // Populate the map with team details
    for (const { catalogId, teamId, teamName } of catalogTeams) {
      const teams = teamsMap.get(catalogId) || [];
      teams.push({ id: teamId, name: teamName });
      teamsMap.set(catalogId, teams);
    }

    return teamsMap;
  }

  /**
   * Sync team assignments for a catalog item (replaces all existing assignments)
   */
  static async syncCatalogTeams(
    catalogId: string,
    teamIds: string[],
  ): Promise<number> {
    logger.debug(
      { catalogId, teamCount: teamIds.length },
      "McpCatalogTeamModel.syncCatalogTeams: syncing teams",
    );
    await db.transaction(async (tx) => {
      // Delete all existing team assignments
      await tx
        .delete(schema.mcpCatalogTeamsTable)
        .where(eq(schema.mcpCatalogTeamsTable.catalogId, catalogId));

      // Insert new team assignments (if any teams provided)
      if (teamIds.length > 0) {
        await tx.insert(schema.mcpCatalogTeamsTable).values(
          teamIds.map((teamId) => ({
            catalogId,
            teamId,
          })),
        );
      }
    });

    logger.debug(
      { catalogId, assignedCount: teamIds.length },
      "McpCatalogTeamModel.syncCatalogTeams: completed",
    );
    return teamIds.length;
  }
}

export default McpCatalogTeamModel;
