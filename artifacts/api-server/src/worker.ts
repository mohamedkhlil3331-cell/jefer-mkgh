import { httpServerHandler } from "cloudflare:node";

type WorkerBindings = Record<string, unknown> & {
  ERP_DB?: unknown;
  ERP_DB_REPLICA?: unknown;
  ERP_OBJECTS?: unknown;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
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
    const { handleWorkerR2Upload } = await import("./lib/r2-storage.js");
    const uploadResponse = await handleWorkerR2Upload(request);
    if (uploadResponse) return uploadResponse;

    const handler = await getExpressHandler();
    const response = await handler(request, env, context);
    if (process.env.NODE_ENV === "production" && process.env.ERP_DATABASE_BACKEND === "d1") {
      const { drainD1Replication } = await import("./lib/cloudflare-d1.js");
      context.waitUntil(drainD1Replication(100).catch(error => {
        console.error("[d1-replication] Request-triggered replica drain failed", error);
      }));
    }
    return response;
  },
};
