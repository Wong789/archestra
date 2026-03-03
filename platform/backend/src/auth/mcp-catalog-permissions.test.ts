import { ADMIN_ROLE_NAME, EDITOR_ROLE_NAME, MEMBER_ROLE_NAME } from "@shared";
import { describe, expect, test } from "@/test";
import { ApiError } from "@/types";
import {
  getMcpCatalogPermissionChecker,
  requireCatalogModifyPermission,
} from "./mcp-catalog-permissions";

describe("getMcpCatalogPermissionChecker", () => {
  test("admin user gets isAdmin() === true and isTeamAdmin() === true", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: ADMIN_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(checker.isAdmin()).toBe(true);
    expect(checker.isTeamAdmin()).toBe(true);
  });

  test("editor user gets isAdmin() === false and isTeamAdmin() === true", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: EDITOR_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(checker.isAdmin()).toBe(false);
    expect(checker.isTeamAdmin()).toBe(true);
  });

  test("member user gets isAdmin() === false and isTeamAdmin() === false", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: MEMBER_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(checker.isAdmin()).toBe(false);
    expect(checker.isTeamAdmin()).toBe(false);
  });

  test("require('read') succeeds for all roles", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const admin = await makeUser();
    const editor = await makeUser();
    const member = await makeUser();
    const org = await makeOrganization();
    await makeMember(admin.id, org.id, { role: ADMIN_ROLE_NAME });
    await makeMember(editor.id, org.id, { role: EDITOR_ROLE_NAME });
    await makeMember(member.id, org.id, { role: MEMBER_ROLE_NAME });

    const adminChecker = await getMcpCatalogPermissionChecker({
      userId: admin.id,
      organizationId: org.id,
    });
    const editorChecker = await getMcpCatalogPermissionChecker({
      userId: editor.id,
      organizationId: org.id,
    });
    const memberChecker = await getMcpCatalogPermissionChecker({
      userId: member.id,
      organizationId: org.id,
    });

    expect(() => adminChecker.require("read")).not.toThrow();
    expect(() => editorChecker.require("read")).not.toThrow();
    expect(() => memberChecker.require("read")).not.toThrow();
  });

  test("require('admin') throws 403 for non-admin", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const editor = await makeUser();
    const member = await makeUser();
    const org = await makeOrganization();
    await makeMember(editor.id, org.id, { role: EDITOR_ROLE_NAME });
    await makeMember(member.id, org.id, { role: MEMBER_ROLE_NAME });

    const editorChecker = await getMcpCatalogPermissionChecker({
      userId: editor.id,
      organizationId: org.id,
    });
    const memberChecker = await getMcpCatalogPermissionChecker({
      userId: member.id,
      organizationId: org.id,
    });

    expect(() => editorChecker.require("admin")).toThrow(ApiError);
    try {
      editorChecker.require("admin");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
    }

    expect(() => memberChecker.require("admin")).toThrow(ApiError);
    try {
      memberChecker.require("admin");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
    }
  });

  test("require('team-admin') throws 403 for member", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const member = await makeUser();
    const org = await makeOrganization();
    await makeMember(member.id, org.id, { role: MEMBER_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: member.id,
      organizationId: org.id,
    });

    expect(() => checker.require("team-admin")).toThrow(ApiError);
    try {
      checker.require("team-admin");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
    }
  });
});

describe("requireCatalogModifyPermission", () => {
  test("admin can modify any scope (personal, team, org)", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: ADMIN_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "personal",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).not.toThrow();

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "team",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).not.toThrow();

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "org",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).not.toThrow();
  });

  test("team-admin (editor) can modify team-scoped items", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: EDITOR_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "team",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).not.toThrow();
  });

  test("team-admin (editor) cannot modify org-scoped items", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: EDITOR_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "org",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).toThrow(ApiError);

    try {
      requireCatalogModifyPermission({
        checker,
        catalogScope: "org",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
    }
  });

  test("member can modify personal items they authored", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: MEMBER_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "personal",
        catalogAuthorId: user.id,
        userId: user.id,
      }),
    ).not.toThrow();
  });

  test("member cannot modify other users' personal items", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: MEMBER_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "personal",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      }),
    ).toThrow(ApiError);

    try {
      requireCatalogModifyPermission({
        checker,
        catalogScope: "personal",
        catalogAuthorId: "other-user-id",
        userId: user.id,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).statusCode).toBe(403);
    }
  });

  test("member cannot modify team or org items", async ({
    makeUser,
    makeOrganization,
    makeMember,
  }) => {
    const user = await makeUser();
    const org = await makeOrganization();
    await makeMember(user.id, org.id, { role: MEMBER_ROLE_NAME });

    const checker = await getMcpCatalogPermissionChecker({
      userId: user.id,
      organizationId: org.id,
    });

    // Member cannot manage team-scoped items
    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "team",
        catalogAuthorId: null,
        userId: user.id,
      }),
    ).toThrow(ApiError);

    // Member cannot manage org-scoped items
    expect(() =>
      requireCatalogModifyPermission({
        checker,
        catalogScope: "org",
        catalogAuthorId: null,
        userId: user.id,
      }),
    ).toThrow(ApiError);
  });
});
