import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { ngrokTunnel } from "@/ngrok-tunnel";
import { ApiError } from "@/types";

const ngrokRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/api/ngrok/start",
    {
      schema: {
        operationId: RouteId.StartNgrokTunnel,
        description:
          "Start an ngrok tunnel to make the backend publicly accessible",
        tags: ["Ngrok"],
        body: z.strictObject({
          authToken: z.string().optional(),
          domain: z.string().optional(),
        }),
        response: {
          200: z.strictObject({
            url: z.string(),
            domain: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const saved = await ngrokTunnel.getSavedConfig();
      const token = request.body.authToken || saved?.authToken;
      if (!token) {
        throw new ApiError(400, "No auth token provided and none saved");
      }
      const domain = request.body.domain || saved?.domain;
      const url = await ngrokTunnel.start(token, domain);
      return reply.send({ url, domain: ngrokTunnel.domain ?? "" });
    },
  );

  fastify.post(
    "/api/ngrok/stop",
    {
      schema: {
        operationId: RouteId.StopNgrokTunnel,
        description: "Stop the running ngrok tunnel",
        tags: ["Ngrok"],
        response: {
          200: z.strictObject({
            stopped: z.boolean(),
          }),
        },
      },
    },
    async (_request, reply) => {
      await ngrokTunnel.stop();
      return reply.send({ stopped: true });
    },
  );

  fastify.get(
    "/api/ngrok/status",
    {
      schema: {
        operationId: RouteId.GetNgrokStatus,
        description: "Get the current ngrok tunnel status",
        tags: ["Ngrok"],
        response: {
          200: z.strictObject({
            running: z.boolean(),
            url: z.string().nullable(),
            domain: z.string().nullable(),
            hasToken: z.boolean(),
            savedDomain: z.string().nullable(),
          }),
        },
      },
    },
    async (_request, reply) => {
      return reply.send({
        running: ngrokTunnel.isRunning,
        url: ngrokTunnel.url,
        domain: ngrokTunnel.domain,
        hasToken: await ngrokTunnel.hasToken(),
        savedDomain: (await ngrokTunnel.getSavedDomain()) ?? null,
      });
    },
  );
};

export default ngrokRoutes;
