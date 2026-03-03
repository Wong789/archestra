import type { Action } from "@shared";
import { UserModel } from "@/models";
import { ApiError, type McpCatalogScope } from "@/types";

export interface McpCatalogPermissionChecker {
  /** Throws ApiError(403) if the user lacks the action on internalMcpCatalog. */
  require(action: Action): void;
  /** Returns true if the user has admin on internalMcpCatalog. */
  isAdmin(): boolean;
  /** Returns true if the user has team-admin on internalMcpCatalog. */
  isTeamAdmin(): boolean;
}

/**
 * Fetches permissions once and returns check functions for MCP catalog operations.
 * Use this to avoid N+1 DB queries when multiple permission checks are needed
 * in a single request handler.
 */
export async function getMcpCatalogPermissionChecker(params: {
  userId: string;
  organizationId: string;
}): Promise<McpCatalogPermissionChecker> {
  const permissions = await UserModel.getUserPermissions(
    params.userId,
    params.organizationId,
  );
  const catalogPerms = permissions.internalMcpCatalog ?? [];

  return {
    require(action: Action): void {
      if (!catalogPerms.includes(action)) {
        throw new ApiError(403, "Forbidden");
      }
    },
    isAdmin(): boolean {
      return catalogPerms.includes("admin");
    },
    isTeamAdmin(): boolean {
      return catalogPerms.includes("team-admin");
    },
  };
}

/**
 * Enforces 3-tier scope-based authorization for catalog item modifications (create/update/delete).
 *
 * - Admin (`internalMcpCatalog:admin`) → always allowed
 * - `scope=org` → requires `admin`
 * - `scope=team` → requires `team-admin`
 * - `scope=personal` → requires authorship (authorId === userId)
 *
 * Throws ApiError(403) if the user lacks permission.
 */
export function requireCatalogModifyPermission(params: {
  checker: McpCatalogPermissionChecker;
  catalogScope: McpCatalogScope;
  catalogAuthorId: string | null;
  userId: string;
}): void {
  const { checker, catalogScope, catalogAuthorId, userId } = params;

  // Admins bypass all checks
  if (checker.isAdmin()) {
    return;
  }

  switch (catalogScope) {
    case "org":
      // Only admins can manage org-scoped catalog items (already checked above)
      throw new ApiError(
        403,
        "Only admins can manage org-scoped MCP catalog items",
      );

    case "team":
      if (!checker.isTeamAdmin()) {
        throw new ApiError(
          403,
          "You need team-admin permission to manage team-scoped MCP catalog items",
        );
      }
      return;

    case "personal":
      if (catalogAuthorId !== userId) {
        throw new ApiError(
          403,
          "You can only manage your own personal MCP catalog items",
        );
      }
      return;
  }
}
