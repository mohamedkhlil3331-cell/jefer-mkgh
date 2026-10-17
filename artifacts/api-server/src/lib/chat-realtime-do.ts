import type { ChatActor } from "./chat-auth.js";
import { CHAT_PROTOCOL } from "./chat-realtime.js";

type DurableSocket = WebSocket & {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
};

type DurableObjectStateLike = {
  acceptWebSocket(socket: DurableSocket, tags?: string[]): void;
  getWebSockets(tag?: string): DurableSocket[];
};

declare const WebSocketPair: new () => { 0: WebSocket; 1: DurableSocket };

function parseActor(value: string | null): ChatActor | null {
  if (!value) return null;
  try {
    const actor = JSON.parse(value) as Partial<ChatActor>;
    if (!Number.isSafeInteger(actor.id) || Number(actor.id) <= 0 ||
        typeof actor.name !== "string" || typeof actor.phone !== "string" ||
        typeof actor.role !== "string") {
      return null;
    }
    return actor as ChatActor;
  } catch {
    return null;
  }
}

export class ChatRealtimeRoom {
  constructor(private readonly state: DurableObjectStateLike) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/broadcast") {
      let payload: { userIds?: unknown; event?: unknown };
      try {
        payload = await request.json() as typeof payload;
      } catch {
        return new Response("Invalid broadcast", { status: 400 });
      }
      if (
        !Array.isArray(payload.userIds) ||
        !payload.userIds.every(id => Number.isSafeInteger(id) && Number(id) > 0) ||
        !payload.event || typeof payload.event !== "object" ||
        typeof (payload.event as { type?: unknown }).type !== "string"
      ) {
        return new Response("Invalid broadcast", { status: 400 });
      }
      const message = JSON.stringify(payload.event);
      for (const userId of new Set(payload.userIds as number[])) {
        for (const socket of this.state.getWebSockets(`user:${userId}`)) {
          if (socket.readyState === WebSocket.OPEN) socket.send(message);
        }
      }
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map(protocol => protocol.trim());
    if (!protocols.includes(CHAT_PROTOCOL)) {
      return new Response("Unsupported WebSocket protocol", { status: 400 });
    }
    const actor = parseActor(request.headers.get("X-Erp-Chat-Actor"));
    if (!actor) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server, [`user:${actor.id}`]);
    server.serializeAttachment(actor);
    const { sendPendingWorkerChatCalls } = await import("./chat-realtime.js");
    await sendPendingWorkerChatCalls(server, actor.id);
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": CHAT_PROTOCOL },
    } as ResponseInit & { webSocket: WebSocket });
  }

  async webSocketMessage(socket: DurableSocket, message: string | ArrayBuffer): Promise<void> {
    const actor = socket.deserializeAttachment() as ChatActor | null;
    if (!actor || !Number.isSafeInteger(actor.id) || actor.id <= 0) {
      socket.close(1008, "Authentication required");
      return;
    }
    const { handleWorkerChatMessage } = await import("./chat-realtime.js");
    await handleWorkerChatMessage(socket, actor, message);
  }

  webSocketClose(socket: DurableSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}
