declare module "cloudflare:node" {
  export type WorkerHandler = {
    fetch(request: Request, env?: unknown, context?: unknown): Promise<Response>;
  };

  export function httpServerHandler(options: { port: number }): WorkerHandler;
}
