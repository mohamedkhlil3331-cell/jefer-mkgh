import { httpServerHandler } from "cloudflare:node";

type WorkerBindings = Record<string, unknown> & {
  ERP_DB?: unknown;
  ERP_DB_REPLICA?: unknown;
  ERP_OBJECTS?: unknown;
  CHAT_REALTIME?: {
    getByName(name: string): { fetch(request: Request): Promise<Response> };
  };
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type ScheduledController = {
  cron: string;
  scheduledTime: number;
};

const EXPRESS_PORT = 8787;
let serverPromise: Promise<ReturnType<typeof httpServerHandler>> | undefined;

function installWorkerEnvironment(env: WorkerBindings): void {
  (globalThis as typeof globalThis & { __ERP_WORKER_ENV?: WorkerBindings }).__ERP_WORKER_ENV = env;
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.env[key] = String(value);
    }
  }
  process.env.PORT = String(EXPRESS_PORT);
}

async function getExpressHandler(): Promise<ReturnType<typeof httpServerHandler>> {
  if (!serverPromise) {
    serverPromise = (async () => {
      if (process.env.NODE_ENV === "production" && process.env.ERP_DATABASE_BACKEND === "d1") {
        const { validateProductionD1Startup } = await import("./lib/d1-readiness.js");
        await validateProductionD1Startup();
      }
      const { default: app } = await import("./app.js");
      app.listen(EXPRESS_PORT);
      return httpServerHandler({ port: EXPRESS_PORT });
    })();
  }
  return serverPromise;
}

export default {
  async fetch(request: Request, env: WorkerBindings, context: WorkerContext): Promise<Response> {
    installWorkerEnvironment(env);
    if (new URL(request.url).pathname === "/api/chat/ws") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const { protocolTokenFromHeader } = await import("./lib/chat-realtime.js");
      const { resolveChatActor } = await import("./lib/chat-auth.js");
      const token = protocolTokenFromHeader(request.headers.get("Sec-WebSocket-Protocol"));
      const actor = await resolveChatActor(token);
      if (!actor || actor.id <= 0) return new Response("Unauthorized", { status: 401 });
      if (!env.CHAT_REALTIME) return new Response("Chat realtime is unavailable", { status: 503 });

      const headers = new Headers(request.headers);
      headers.set("X-Erp-Chat-Actor", JSON.stringify(actor));
      return env.CHAT_REALTIME.getByName("erp-chat-room")
        .fetch(new Request(request, { headers }));
    }

    const { handleWorkerR2Upload } = await import("./lib/r2-storage.js");
    const uploadResponse = await handleWorkerR2Upload(request);
    if (uploadResponse) return uploadResponse;

    const handler = await getExpressHandler();
    const response = await handler.fetch(request, env, context);
    if (process.env.NODE_ENV === "production" && process.env.ERP_DATABASE_BACKEND === "d1") {
      const { drainD1Replication } = await import("./lib/cloudflare-d1.js");
      context.waitUntil(drainD1Replication(100).catch(error => {
        console.error("[d1-replication] Request-triggered replica drain failed", error);
      }));
    }
    return response;
  },

  async scheduled(controller: ScheduledController, env: WorkerBindings): Promise<void> {
    installWorkerEnvironment(env);
    if (process.env.NODE_ENV !== "production" || process.env.ERP_DATABASE_BACKEND !== "d1") {
      console.info("[worker-cron] Ignoring scheduled event outside production D1 mode");
      return;
    }

    const time = new Date(controller.scheduledTime);
    const minute = time.getUTCMinutes();
    const hour = time.getUTCHours();
    const jobs: Promise<unknown>[] = [];

    const { drainD1Replication } = await import("./lib/cloudflare-d1.js");
    jobs.push(drainD1Replication(100));
    if (minute % 5 === 0) {
      const { runSlaMonitorOnce } = await import("./lib/sla-monitor.js");
      jobs.push(runSlaMonitorOnce());
    }
    if (minute % 10 === 0) {
      const { runVehicleStopMonitorOnce } = await import("./lib/vehicle-stop-monitor.js");
      jobs.push(runVehicleStopMonitorOnce());
    }
    if (minute % 15 === 0) {
      const [{ runChatMaintenance }, { processPendingNotifications }] = await Promise.all([
        import("./lib/chat-maintenance.js"),
        import("./lib/chat-push.js"),
      ]);
      jobs.push(runChatMaintenance(), processPendingNotifications());
    } else {
      const { processPendingNotifications } = await import("./lib/chat-push.js");
      jobs.push(processPendingNotifications());
    }
    if (minute === 0) {
      const { runMkghSchedulerOnce } = await import("./lib/mkgh-scheduler.js");
      jobs.push(runMkghSchedulerOnce());
    }
    if (minute === 0 && hour === 0) {
      const { runNightlyStopSchedulerOnce } = await import("./lib/vehicle-stop-scheduler.js");
      jobs.push(runNightlyStopSchedulerOnce());
    }

    await Promise.all(jobs.map(async job => {
      try {
        await job;
      } catch (error) {
        console.error("[worker-cron] Scheduled job failed", error);
      }
    }));
  },
};

export { ChatRealtimeRoom } from "./lib/chat-realtime-do.js";
