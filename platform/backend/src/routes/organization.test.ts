import { vi } from "vitest";
import type * as originalConfigModule from "@/config";
import ToolModel from "@/models/tool";
import type { FastifyInstanceWithZod } from "@/server";
import { createFastifyInstance } from "@/server";
import { afterEach, beforeEach, describe, expect, test } from "@/test";
import type { User } from "@/types";

const VALID_PNG_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof originalConfigModule>();
  return {
    default: {
      ...actual.default,
      enterpriseFeatures: {
        ...actual.default.enterpriseFeatures,
        fullWhiteLabeling: true,
      },
    },
  };
});

describe("organization routes", () => {
  let app: FastifyInstanceWithZod;
  let user: User;
  let organizationId: string;

  beforeEach(async ({ makeOrganization, makeUser }) => {
    user = await makeUser();
    const organization = await makeOrganization();
    organizationId = organization.id;

    app = createFastifyInstance();
    app.addHook("onRequest", async (request) => {
      (request as typeof request & { user: unknown }).user = user;
      (
        request as typeof request & {
          organizationId: string;
        }
      ).organizationId = organizationId;
    });

    const { default: organizationRoutes } = await import("./organization");
    await app.register(organizationRoutes);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  describe("PATCH /api/organization/llm-settings", () => {
    test("updates compression scope", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/llm-settings",
        payload: { compressionScope: "organization" },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.compressionScope).toBe("organization");
    });

    test("updates TOON conversion flag", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/llm-settings",
        payload: { convertToolResultsToToon: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().convertToolResultsToToon).toBe(true);
    });

    test("updates limit cleanup interval", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/llm-settings",
        payload: { limitCleanupInterval: "12h" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().limitCleanupInterval).toBe("12h");
    });

    test("persists changes across reads", async () => {
      await app.inject({
        method: "PATCH",
        url: "/api/organization/llm-settings",
        payload: {
          compressionScope: "team",
          convertToolResultsToToon: true,
        },
      });

      const response = await app.inject({
        method: "GET",
        url: "/api/organization",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.compressionScope).toBe("team");
      expect(body.convertToolResultsToToon).toBe(true);
    });
  });

  describe("PATCH /api/organization/security-settings", () => {
    test("updates global tool policy to permissive", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/security-settings",
        payload: { globalToolPolicy: "permissive" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().globalToolPolicy).toBe("permissive");
    });

    test("updates global tool policy to restrictive", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/security-settings",
        payload: { globalToolPolicy: "restrictive" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().globalToolPolicy).toBe("restrictive");
    });

    test("enables and disables chat file uploads", async () => {
      const enableResponse = await app.inject({
        method: "PATCH",
        url: "/api/organization/security-settings",
        payload: { allowChatFileUploads: true },
      });
      expect(enableResponse.json().allowChatFileUploads).toBe(true);

      const disableResponse = await app.inject({
        method: "PATCH",
        url: "/api/organization/security-settings",
        payload: { allowChatFileUploads: false },
      });
      expect(disableResponse.json().allowChatFileUploads).toBe(false);
    });

    test("updates both settings at once", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/security-settings",
        payload: {
          globalToolPolicy: "restrictive",
          allowChatFileUploads: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.globalToolPolicy).toBe("restrictive");
      expect(body.allowChatFileUploads).toBe(true);
    });
  });

  describe("PATCH /api/organization/knowledge-settings", () => {
    test("updates embedding model", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { embeddingModel: "text-embedding-3-large" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().embeddingModel).toBe("text-embedding-3-large");
    });

    test("updates reranker model", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { rerankerModel: "gpt-4o-mini" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().rerankerModel).toBe("gpt-4o-mini");
    });

    test("rejects changing embedding model once locked", async ({
      makeSecret,
      makeLlmProviderApiKey,
    }) => {
      // Create an OpenAI API key for embedding
      const secret = await makeSecret();
      const apiKey = await makeLlmProviderApiKey(organizationId, secret.id, {
        provider: "openai",
      });

      // Lock: set both key and model
      await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: {
          embeddingChatApiKeyId: apiKey.id,
          embeddingModel: "text-embedding-3-small",
        },
      });

      // Try to change model — should be rejected
      const changeResponse = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { embeddingModel: "text-embedding-3-large" },
      });

      expect(changeResponse.statusCode).toBe(400);
      expect(changeResponse.json().error.message).toContain(
        "Embedding model cannot be changed once configured",
      );

      // Setting the same model value should still work
      const sameResponse = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { embeddingModel: "text-embedding-3-small" },
      });
      expect(sameResponse.statusCode).toBe(200);
    });

    test("rejects non-OpenAI API key for embedding", async ({
      makeSecret,
      makeLlmProviderApiKey,
    }) => {
      const secret = await makeSecret();
      const apiKey = await makeLlmProviderApiKey(organizationId, secret.id, {
        provider: "anthropic",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { embeddingChatApiKeyId: apiKey.id },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain(
        "Embedding API key must use a compatible provider (OpenAI or Ollama)",
      );
    });

    test("accepts OpenAI API key for embedding", async ({
      makeSecret,
      makeLlmProviderApiKey,
    }) => {
      const secret = await makeSecret();
      const apiKey = await makeLlmProviderApiKey(organizationId, secret.id, {
        provider: "openai",
      });

      const response = await app.inject({
        method: "PATCH",
        url: "/api/organization/knowledge-settings",
        payload: { embeddingChatApiKeyId: apiKey.id },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().embeddingChatApiKeyId).toBe(apiKey.id);
    });
  });

  test("syncs built-in MCP branding when appName changes under full white labeling", async () => {
    const syncSpy = vi
      .spyOn(ToolModel, "syncArchestraBuiltInCatalog")
      .mockResolvedValue();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/organization/appearance-settings",
      payload: {
        appName: "Acme Copilot",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(syncSpy).toHaveBeenCalledWith({
      organization: expect.objectContaining({
        appName: "Acme Copilot",
      }),
    });
  });

  test("does not resync built-in MCP branding when appName is unchanged", async () => {
    const syncSpy = vi
      .spyOn(ToolModel, "syncArchestraBuiltInCatalog")
      .mockResolvedValue();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/organization/appearance-settings",
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  test("does not resync built-in MCP branding when only logo assets change", async () => {
    const syncSpy = vi
      .spyOn(ToolModel, "syncArchestraBuiltInCatalog")
      .mockResolvedValue();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/organization/appearance-settings",
      payload: {
        logo: VALID_PNG_BASE64,
        logoDark: VALID_PNG_BASE64,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  test("resyncs built-in MCP branding when iconLogo changes", async () => {
    const syncSpy = vi
      .spyOn(ToolModel, "syncArchestraBuiltInCatalog")
      .mockResolvedValue();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/organization/appearance-settings",
      payload: {
        iconLogo: VALID_PNG_BASE64,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(syncSpy).toHaveBeenCalledWith({
      organization: expect.objectContaining({
        iconLogo: VALID_PNG_BASE64,
      }),
    });
  });
});
