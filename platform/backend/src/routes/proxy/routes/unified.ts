import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import logger from "@/logging";
import {
  constructResponseSchema,
  OpenAi,
  UuidIdSchema,
} from "@/types";
import {
  anthropicAdapterFactory,
  bedrockAdapterFactory,
  cerebrasAdapterFactory,
  cohereAdapterFactory,
  deepseekAdapterFactory,
  geminiAdapterFactory,
  groqAdapterFactory,
  minimaxAdapterFactory,
  mistralAdapterFactory,
  ollamaAdapterFactory,
  openaiAdapterFactory,
  openrouterAdapterFactory,
  perplexityAdapterFactory,
  vllmAdapterFactory,
  xaiAdapterFactory,
  zhipuaiAdapterFactory,
} from "../adapters";
import { PROXY_API_PREFIX, PROXY_BODY_LIMIT } from "../common";
import { handleLLMProxy } from "../llm-proxy-handler";

const UNIFIED_API_PREFIX = `${PROXY_API_PREFIX}/unified`;
const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";

/**
 * Route a model name to the appropriate LLM provider adapter.
 * The model name is inspected to determine which upstream provider to use.
 */
function routeModelToProvider(
  model: string,
): { adapter: ReturnType<typeof import("../adapters").openaiAdapterFactory>; providerName: string } {
  const lowerModel = model.toLowerCase();

  // Anthropic models - claude-*
  if (lowerModel.includes("claude")) {
    return { adapter: anthropicAdapterFactory, providerName: "Anthropic" };
  }

  // Google Gemini models - gemini-*
  if (lowerModel.startsWith("gemini")) {
    return { adapter: geminiAdapterFactory, providerName: "Gemini" };
  }

  // Cohere models - command-*
  if (lowerModel.includes("command")) {
    return { adapter: cohereAdapterFactory, providerName: "Cohere" };
  }

  // Cerebras models
  if (lowerModel.includes("cerebras") || lowerModel === "llama-4-scout-17b-16e-instruct") {
    return { adapter: cerebrasAdapterFactory, providerName: "Cerebras" };
  }

  // Mistral models - mistral-*, ministerial-*
  if (lowerModel.includes("mistral") || lowerModel.includes("ministral")) {
    return { adapter: mistralAdapterFactory, providerName: "Mistral" };
  }

  // Perplexity models - sonar-*
  if (lowerModel.includes("sonar")) {
    return { adapter: perplexityAdapterFactory, providerName: "Perplexity" };
  }

  // Groq models (llama-* on Groq infrastructure)
  if (
    (lowerModel.startsWith("llama-3.3") ||
      lowerModel.startsWith("llama-3.1") ||
      lowerModel.startsWith("llama-3.2")) &&
    !lowerModel.includes("ollama") &&
    !lowerModel.includes("vllm")
  ) {
    return { adapter: groqAdapterFactory, providerName: "Groq" };
  }

  // xAI Grok models - grok-*
  if (lowerModel.includes("grok")) {
    return { adapter: xaiAdapterFactory, providerName: "xAI" };
  }

  // Zhipuai GLM models - glm-*
  if (lowerModel.includes("glm-")) {
    return { adapter: zhipuaiAdapterFactory, providerName: "ZhipuAI" };
  }

  // DeepSeek models - deepseek-*
  if (lowerModel.includes("deepseek")) {
    return { adapter: deepseekAdapterFactory, providerName: "DeepSeek" };
  }

  // MiniMax models - minimax-*
  if (lowerModel.includes("minimax")) {
    return { adapter: minimaxAdapterFactory, providerName: "MiniMax" };
  }

  // Ollama models (typically have "llama3" without groq context)
  if (lowerModel.startsWith("llama3") || lowerModel.includes("ollama")) {
    return { adapter: ollamaAdapterFactory, providerName: "Ollama" };
  }

  // OpenRouter models (have "/" in model name like "openai/gpt-4o")
  if (lowerModel.includes("/")) {
    return { adapter: openrouterAdapterFactory, providerName: "OpenRouter" };
  }

  // vLLM models (typically have "/" and meta-llama pattern)
  if (lowerModel.includes("-llama-") || lowerModel.startsWith("meta-")) {
    return { adapter: vllmAdapterFactory, providerName: "vLLM" };
  }

  // Bedrock models (have "." in model name like "anthropic.claude-3-sonnet")
  if (
    lowerModel.includes(".") &&
    (lowerModel.includes("claude") || lowerModel.includes("amazon") || lowerModel.includes("nova"))
  ) {
    return { adapter: bedrockAdapterFactory, providerName: "Bedrock" };
  }

  // Default to OpenAI for gpt-* or any other model
  return { adapter: openaiAdapterFactory, providerName: "OpenAI" };
}

const unifiedProxyRoutes: FastifyPluginAsyncZod = async (fastify) => {
  logger.info("[UnifiedProxy] Registering unified OpenAI-format LLM proxy routes");

  // Unified chat completions endpoint (uses default agent)
  fastify.post(
    `${UNIFIED_API_PREFIX}${CHAT_COMPLETIONS_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.UnifiedChatCompletions,
        description:
          "Create a chat completion with any provider using OpenAI format. The model name in the request body determines which provider is used (e.g., gpt-4o → OpenAI, claude-3-5-sonnet → Anthropic, gemini-pro → Gemini).",
        tags: ["LLM Proxy"],
        body: OpenAi.API.ChatCompletionRequestSchema,
        headers: OpenAi.API.ChatCompletionsHeadersSchema,
        response: constructResponseSchema(
          OpenAi.API.ChatCompletionResponseSchema,
        ),
      },
    },
    async (request, reply) => {
      const body = request.body as { model?: string };
      const model = body?.model || "gpt-4o";

      const { adapter, providerName } = routeModelToProvider(model);

      logger.info(
        { model, providerName, url: request.url },
        "[UnifiedProxy] Routing request to provider",
      );

      return handleLLMProxy(request.body, request, reply, adapter as Parameters<typeof handleLLMProxy>[3]);
    },
  );

  // Unified chat completions endpoint with specific agent
  fastify.post(
    `${UNIFIED_API_PREFIX}/:agentId${CHAT_COMPLETIONS_SUFFIX}`,
    {
      bodyLimit: PROXY_BODY_LIMIT,
      schema: {
        operationId: RouteId.UnifiedChatCompletionsWithAgent,
        description:
          "Create a chat completion with any provider using OpenAI format for a specific agent. The model name determines the provider.",
        tags: ["LLM Proxy"],
        params: z.object({
          agentId: UuidIdSchema,
        }),
        body: OpenAi.API.ChatCompletionRequestSchema,
        headers: OpenAi.API.ChatCompletionsHeadersSchema,
        response: constructResponseSchema(
          OpenAi.API.ChatCompletionResponseSchema,
        ),
      },
    },
    async (request, reply) => {
      const body = request.body as { model?: string };
      const model = body?.model || "gpt-4o";

      const { adapter, providerName } = routeModelToProvider(model);

      logger.info(
        {
          model,
          providerName,
          agentId: (request.params as { agentId: string }).agentId,
          url: request.url,
        },
        "[UnifiedProxy] Routing request to provider (with agent)",
      );

      return handleLLMProxy(request.body, request, reply, adapter as Parameters<typeof handleLLMProxy>[3]);
    },
  );
};

export default unifiedProxyRoutes;