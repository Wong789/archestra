import { describe, expect, test } from "@/test";
import McpCatalogTeamModel from "./mcp-catalog-team";

describe("McpCatalogTeamModel", () => {
  describe("getUserAccessibleCatalogIds", () => {
    test("admin sees all items regardless of scope", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const admin = await makeUser();
      const otherUser = await makeUser();

      const orgItem = await makeInternalMcpCatalog({ scope: "org" });
      const personalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: otherUser.id,
      });
      const team = await makeTeam(org.id, admin.id);
      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(admin.id, true);

      expect(accessibleIds).toContain(orgItem.id);
      expect(accessibleIds).toContain(personalItem.id);
      expect(accessibleIds).toContain(teamItem.id);
    });

    test("non-admin sees org-scoped items", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const orgItem = await makeInternalMcpCatalog({ scope: "org" });

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(user.id, false);

      expect(accessibleIds).toContain(orgItem.id);
    });

    test("non-admin sees personal items they authored", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const personalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: user.id,
      });

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(user.id, false);

      expect(accessibleIds).toContain(personalItem.id);
    });

    test("non-admin does NOT see other users' personal items", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const otherUser = await makeUser();
      const otherPersonalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: otherUser.id,
      });

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(user.id, false);

      expect(accessibleIds).not.toContain(otherPersonalItem.id);
    });

    test("non-admin sees team-scoped items for teams they belong to", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeTeamMember,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team = await makeTeam(org.id, user.id);
      await makeTeamMember(team.id, user.id);

      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(user.id, false);

      expect(accessibleIds).toContain(teamItem.id);
    });

    test("non-admin does NOT see team-scoped items for teams they don't belong to", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const otherUser = await makeUser();
      const team = await makeTeam(org.id, otherUser.id);

      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      const accessibleIds =
        await McpCatalogTeamModel.getUserAccessibleCatalogIds(user.id, false);

      expect(accessibleIds).not.toContain(teamItem.id);
    });
  });

  describe("userHasCatalogAccess", () => {
    test("returns true for admin regardless of scope", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const admin = await makeUser();
      const otherUser = await makeUser();

      const personalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: otherUser.id,
      });
      const team = await makeTeam(org.id, otherUser.id);
      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      expect(
        await McpCatalogTeamModel.userHasCatalogAccess(
          admin.id,
          personalItem.id,
          true,
        ),
      ).toBe(true);
      expect(
        await McpCatalogTeamModel.userHasCatalogAccess(
          admin.id,
          teamItem.id,
          true,
        ),
      ).toBe(true);
    });

    test("returns true for org-scoped items", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const orgItem = await makeInternalMcpCatalog({ scope: "org" });

      const hasAccess = await McpCatalogTeamModel.userHasCatalogAccess(
        user.id,
        orgItem.id,
        false,
      );

      expect(hasAccess).toBe(true);
    });

    test("returns true for personal items authored by user", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const personalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: user.id,
      });

      const hasAccess = await McpCatalogTeamModel.userHasCatalogAccess(
        user.id,
        personalItem.id,
        false,
      );

      expect(hasAccess).toBe(true);
    });

    test("returns false for other users' personal items", async ({
      makeUser,
      makeInternalMcpCatalog,
    }) => {
      const user = await makeUser();
      const otherUser = await makeUser();
      const otherPersonalItem = await makeInternalMcpCatalog({
        scope: "personal",
        authorId: otherUser.id,
      });

      const hasAccess = await McpCatalogTeamModel.userHasCatalogAccess(
        user.id,
        otherPersonalItem.id,
        false,
      );

      expect(hasAccess).toBe(false);
    });

    test("returns true for team-scoped items where user is team member", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeTeamMember,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team = await makeTeam(org.id, user.id);
      await makeTeamMember(team.id, user.id);

      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      const hasAccess = await McpCatalogTeamModel.userHasCatalogAccess(
        user.id,
        teamItem.id,
        false,
      );

      expect(hasAccess).toBe(true);
    });

    test("returns false for team-scoped items where user is not team member", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const otherUser = await makeUser();
      const team = await makeTeam(org.id, otherUser.id);

      const teamItem = await makeInternalMcpCatalog({ scope: "team" });
      await McpCatalogTeamModel.syncCatalogTeams(teamItem.id, [team.id]);

      const hasAccess = await McpCatalogTeamModel.userHasCatalogAccess(
        user.id,
        teamItem.id,
        false,
      );

      expect(hasAccess).toBe(false);
    });
  });

  describe("syncCatalogTeams", () => {
    test("assigns teams to a catalog item", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team1 = await makeTeam(org.id, user.id);
      const team2 = await makeTeam(org.id, user.id);
      const catalog = await makeInternalMcpCatalog({ scope: "team" });

      const assignedCount = await McpCatalogTeamModel.syncCatalogTeams(
        catalog.id,
        [team1.id, team2.id],
      );

      expect(assignedCount).toBe(2);

      const teams = await McpCatalogTeamModel.getTeamDetailsForCatalog(
        catalog.id,
      );
      expect(teams).toHaveLength(2);
      expect(teams.map((t) => t.id)).toContain(team1.id);
      expect(teams.map((t) => t.id)).toContain(team2.id);
    });

    test("replaces existing teams when called again with different teams", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team1 = await makeTeam(org.id, user.id);
      const team2 = await makeTeam(org.id, user.id);
      const team3 = await makeTeam(org.id, user.id);
      const catalog = await makeInternalMcpCatalog({ scope: "team" });

      await McpCatalogTeamModel.syncCatalogTeams(catalog.id, [
        team1.id,
        team2.id,
      ]);
      await McpCatalogTeamModel.syncCatalogTeams(catalog.id, [team3.id]);

      const teams = await McpCatalogTeamModel.getTeamDetailsForCatalog(
        catalog.id,
      );
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe(team3.id);
    });

    test("can remove all teams (empty array)", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team = await makeTeam(org.id, user.id);
      const catalog = await makeInternalMcpCatalog({ scope: "team" });

      await McpCatalogTeamModel.syncCatalogTeams(catalog.id, [team.id]);
      await McpCatalogTeamModel.syncCatalogTeams(catalog.id, []);

      const teams = await McpCatalogTeamModel.getTeamDetailsForCatalog(
        catalog.id,
      );
      expect(teams).toHaveLength(0);
    });
  });

  describe("getTeamDetailsForCatalog", () => {
    test("returns team details for a catalog item", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team = await makeTeam(org.id, user.id, { name: "Engineering" });
      const catalog = await makeInternalMcpCatalog({ scope: "team" });

      await McpCatalogTeamModel.syncCatalogTeams(catalog.id, [team.id]);

      const teams = await McpCatalogTeamModel.getTeamDetailsForCatalog(
        catalog.id,
      );

      expect(teams).toHaveLength(1);
      expect(teams[0]).toEqual({ id: team.id, name: "Engineering" });
    });

    test("returns empty array when no teams assigned", async ({
      makeInternalMcpCatalog,
    }) => {
      const catalog = await makeInternalMcpCatalog({ scope: "team" });

      const teams = await McpCatalogTeamModel.getTeamDetailsForCatalog(
        catalog.id,
      );

      expect(teams).toHaveLength(0);
    });
  });

  describe("getTeamDetailsForCatalogs", () => {
    test("batch loads correctly for multiple items", async ({
      makeUser,
      makeOrganization,
      makeTeam,
      makeInternalMcpCatalog,
    }) => {
      const org = await makeOrganization();
      const user = await makeUser();
      const team1 = await makeTeam(org.id, user.id, { name: "Team Alpha" });
      const team2 = await makeTeam(org.id, user.id, { name: "Team Beta" });

      const catalog1 = await makeInternalMcpCatalog({ scope: "team" });
      const catalog2 = await makeInternalMcpCatalog({ scope: "team" });
      const catalog3 = await makeInternalMcpCatalog({ scope: "team" });

      await McpCatalogTeamModel.syncCatalogTeams(catalog1.id, [
        team1.id,
        team2.id,
      ]);
      await McpCatalogTeamModel.syncCatalogTeams(catalog2.id, [team1.id]);
      // catalog3 has no teams

      const teamsMap = await McpCatalogTeamModel.getTeamDetailsForCatalogs([
        catalog1.id,
        catalog2.id,
        catalog3.id,
      ]);

      expect(teamsMap.size).toBe(3);

      const catalog1Teams = teamsMap.get(catalog1.id);
      expect(catalog1Teams).toHaveLength(2);
      expect(catalog1Teams?.map((t) => t.id)).toContain(team1.id);
      expect(catalog1Teams?.map((t) => t.id)).toContain(team2.id);

      const catalog2Teams = teamsMap.get(catalog2.id);
      expect(catalog2Teams).toHaveLength(1);
      expect(catalog2Teams?.[0].id).toBe(team1.id);
      expect(catalog2Teams?.[0].name).toBe("Team Alpha");

      const catalog3Teams = teamsMap.get(catalog3.id);
      expect(catalog3Teams).toHaveLength(0);
    });

    test("returns empty map for empty catalog IDs array", async () => {
      const teamsMap = await McpCatalogTeamModel.getTeamDetailsForCatalogs([]);

      expect(teamsMap.size).toBe(0);
    });
  });
});
