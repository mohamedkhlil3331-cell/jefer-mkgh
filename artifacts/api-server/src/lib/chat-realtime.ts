import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { execute, executeBatch, queryAll, queryOne } from "./erp-sql.js";
import { resolveChatActor, type ChatActor } from "./chat-auth.js";
import { areChatUsersAllowed, isChatConversationAllowed } from "./chat-access.js";
import { logger } from "./logger.js";
import { sendBrowserPush } from "./chat-push.js";

type RealtimeEvent = Record<string, unknown> & { type: string };
type RealtimeEventRow = { id: number; event_json: string };
type ChatSocket = { readyState: number; send(data: string): void };

export const CHAT_PROTOCOL = "mkgh-chat-v1";
const CALL_EVENT_TTL_SECONDS = 120;
const socketActors = new WeakMap<WebSocket, ChatActor>();

async function broadcastToWorkerSockets(userIds: number[], event: RealtimeEvent): Promise<void> {
  const env = (globalThis as typeof globalThis & {
    __ERP_WORKER_ENV?: {
      CHAT_REALTIME?: {
        getByName(name: string): { fetch(request: Request): Promise<Response> };
      };
    };
  }).__ERP_WORKER_ENV;
  if (!env?.CHAT_REALTIME) return;

  try {
    const room = env.CHAT_REALTIME.getByName("erp-chat-room");
    const response = await room.fetch(new Request("https://chat.internal/broadcast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds, event }),
    }));
    if (!response.ok) {
      throw new Error(`Durable Object returned HTTP ${response.status}`);
    }
  } catch (error) {
    logger.warn({ err: error }, "Chat event persisted but realtime broadcast failed");
  }
}

async function setRealtimeEvent(userId: number, event: RealtimeEvent, ttlSeconds = CALL_EVENT_TTL_SECONDS): Promise<void> {
  await execute(`
    INSERT INTO chat_realtime_events (recipient_user_id, event_json, expires_at)
    VALUES (?, ?, datetime('now', ?))
  `, userId, JSON.stringify(event), `+${ttlSeconds} seconds`);
  await broadcastToWorkerSockets([userId], event);
}

export async function publishChatRealtimeToUsers(userIds: number[], event: RealtimeEvent): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(id => id > 0))];
  await executeBatch(uniqueIds.map(userId => ({
    sql: `INSERT INTO chat_realtime_events (recipient_user_id, event_json, expires_at)
          VALUES (?, ?, datetime('now', ?))`,
    params: [userId, JSON.stringify(event), `+${CALL_EVENT_TTL_SECONDS} seconds`],
  })));
  await broadcastToWorkerSockets(uniqueIds, event);
}

export async function publishChatConversationEvent(
  conversationId: number,
  event: RealtimeEvent,
): Promise<void> {
  const conversation = await queryOne<{ user_low_id: number; user_high_id: number }>(`
    SELECT user_low_id, user_high_id
    FROM chat_conversations WHERE id=?
  `, conversationId);
  if (!conversation || !await areChatUsersAllowed(conversation.user_low_id, conversation.user_high_id)) return;
  await publishChatRealtimeToUsers(
    [conversation.user_low_id, conversation.user_high_id],
    event,
  );
}

async function eventStillAllowed(userId: number, eventJson: string): Promise<boolean> {
  try {
    const event = JSON.parse(eventJson) as {
      conversation_id?: unknown;
      message?: { conversation_id?: unknown };
    };
    const conversationId = Number(event.conversation_id ?? event.message?.conversation_id);
    return !Number.isInteger(conversationId) ||
      conversationId <= 0 ||
      await isChatConversationAllowed(conversationId, userId);
  } catch {
    return false;
  }
}

function sendSocketError(socket: ChatSocket, code: string, message: string): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify({ type: "error", code, message }));
  }
}

export function protocolTokenFromHeader(raw: string | null): string | null {
  const protocols = (raw ?? "")
    .split(",")
    .map(value => value.trim());
  if (!protocols.includes(CHAT_PROTOCOL)) return null;
  const bearer = protocols.find(value => value.startsWith("bearer."));
  return bearer?.slice("bearer.".length) || null;
}

function protocolToken(req: IncomingMessage): string | null {
  const raw = req.headers["sec-websocket-protocol"];
  return protocolTokenFromHeader(Array.isArray(raw) ? raw.join(",") : raw ?? null);
}

async function beginPolling(socket: WebSocket, actor: ChatActor): Promise<() => void> {
  const initial = await queryOne<{ max_id: number }>(`
    SELECT COALESCE(MAX(id), 0) AS max_id
    FROM chat_realtime_events WHERE recipient_user_id=?
  `, actor.id);
  let cursor = initial?.max_id ?? 0;
  let polling = false;

  const timer = setInterval(() => {
    if (polling || socket.readyState !== WebSocket.OPEN) return;
    polling = true;
    void (async () => {
      try {
      const events = await queryAll<RealtimeEventRow>(`
        SELECT id, event_json
        FROM chat_realtime_events
        WHERE recipient_user_id=? AND id>? AND datetime(expires_at)>datetime('now')
        ORDER BY id LIMIT 50
      `, actor.id, cursor);
      for (const row of events) {
        cursor = row.id;
        if (!await eventStillAllowed(actor.id, row.event_json)) continue;
        try {
          socket.send(row.event_json);
        } catch {
          break;
        }
      }
      } catch (error) {
      logger.warn({ err: error, userId: actor.id }, "Chat realtime event polling failed");
      } finally {
        polling = false;
      }
    })();
  }, 700);
  timer.unref();

  return () => clearInterval(timer);
}

export async function sendPendingWorkerChatCalls(socket: ChatSocket, userId: number): Promise<void> {
  const calls = await queryAll(`
    SELECT c.call_id, c.conversation_id, c.caller_id, c.media_type,
           u.name AS caller_name
    FROM chat_calls c JOIN users u ON u.id=c.caller_id
    WHERE c.callee_id=? AND c.status='ringing'
      AND datetime(c.expires_at)>datetime('now')
    ORDER BY c.created_at
  `, userId) as Array<{
    call_id: string;
    conversation_id: number;
    caller_id: number;
    media_type: "audio" | "video";
    caller_name: string;
  }>;

  for (const call of calls) {
    if (!await isChatConversationAllowed(call.conversation_id, userId)) continue;
    socket.send(JSON.stringify({ type: "call:incoming", ...call }));
  }
}

async function conversationPeer(conversationId: number, userId: number): Promise<number | null> {
  const conversation = await queryOne<{ user_low_id: number; user_high_id: number }>(`
    SELECT user_low_id, user_high_id
    FROM chat_conversations WHERE id=?
  `, conversationId);
  if (!conversation) return null;
  const peerId = conversation.user_low_id === userId
    ? conversation.user_high_id
    : conversation.user_high_id === userId
      ? conversation.user_low_id
      : null;
  return peerId && await areChatUsersAllowed(userId, peerId) ? peerId : null;
}

async function publishCallEvent(call: {
  call_id: string;
  caller_id: number;
  callee_id: number;
}, event: RealtimeEvent): Promise<void> {
  await publishChatRealtimeToUsers([call.caller_id, call.callee_id], event);
}

async function hasUnexpiredCallForUser(userId: number): Promise<boolean> {
  return Boolean(await queryOne(`
    SELECT 1 FROM chat_calls
    WHERE (caller_id=? OR callee_id=?)
      AND datetime(expires_at)>datetime('now')
    LIMIT 1
  `, userId, userId));
}

export async function handleWorkerChatMessage(
  socket: ChatSocket,
  actor: ChatActor,
  raw: RawData | string | ArrayBuffer,
): Promise<void> {
  let input: Record<string, unknown>;
  try {
    const rawText = typeof raw === "string"
      ? raw
      : Array.isArray(raw)
        ? Buffer.concat(raw).toString("utf8")
        : Buffer.from(raw as ArrayBuffer).toString("utf8");
    const parsed: unknown = JSON.parse(rawText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      sendSocketError(socket, "invalid_event", "صيغة الإشارة غير صحيحة");
      return;
    }
    input = parsed as Record<string, unknown>;
  } catch {
    sendSocketError(socket, "invalid_event", "صيغة الإشارة غير صحيحة");
    return;
  }

  if (input.type === "call:invite") {
    const conversationId = Number(input.conversation_id);
    const mediaType = input.media_type;
    if (!Number.isInteger(conversationId) || conversationId <= 0 ||
        (mediaType !== "audio" && mediaType !== "video")) {
      sendSocketError(socket, "invalid_call", "بيانات المكالمة غير مكتملة");
      return;
    }
    const calleeId = await conversationPeer(conversationId, actor.id);
    if (!calleeId) {
      sendSocketError(socket, "conversation_required", "لا تملك صلاحية الاتصال في هذه المحادثة");
      return;
    }
    await execute("DELETE FROM chat_calls WHERE datetime(expires_at)<=datetime('now')");
    const [callerBusy, calleeBusy] = await Promise.all([
      hasUnexpiredCallForUser(actor.id),
      hasUnexpiredCallForUser(calleeId),
    ]);
    if (callerBusy || calleeBusy) {
      sendSocketError(socket, "user_busy", "أحد الطرفين في مكالمة أخرى");
      return;
    }
    const callee = await queryOne<{ name: string }>("SELECT name FROM users WHERE id=? AND active=1", calleeId);
    if (!callee) {
      sendSocketError(socket, "user_unavailable", "المستخدم غير متاح للمكالمة");
      return;
    }

    const callId = randomUUID();
    await execute(`
      INSERT INTO chat_calls (call_id, conversation_id, caller_id, callee_id, media_type, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+45 seconds'))
    `, callId, conversationId, actor.id, calleeId, mediaType);

    await setRealtimeEvent(actor.id, {
      type: "call:outgoing",
      call_id: callId,
      conversation_id: conversationId,
      callee_id: calleeId,
      callee_name: callee.name,
      media_type: mediaType,
    });
    await setRealtimeEvent(calleeId, {
      type: "call:incoming",
      call_id: callId,
      conversation_id: conversationId,
      caller_id: actor.id,
      caller_name: actor.name,
      media_type: mediaType,
    }, 60);
    void sendBrowserPush(calleeId, "message", {
      title: mediaType === "video" ? "مكالمة فيديو واردة" : "مكالمة صوتية واردة",
      body: actor.name,
      url: `/chat?conversation=${conversationId}`,
      tag: `call-${callId}`,
    }).catch(error => logger.warn({ err: error, userId: calleeId }, "Incoming call push failed"));
    return;
  }

  const callId = typeof input.call_id === "string" ? input.call_id : "";
  if (!callId || callId.length > 80) {
    sendSocketError(socket, "invalid_call", "معرّف المكالمة غير صالح");
    return;
  }
  const call = await queryOne<{
    call_id: string;
    conversation_id: number;
    caller_id: number;
    callee_id: number;
    media_type: string;
    status: "ringing" | "active";
  }>(`
    SELECT call_id, conversation_id, caller_id, callee_id, media_type, status
    FROM chat_calls
    WHERE call_id=? AND datetime(expires_at)>datetime('now')
  `, callId);
  if (!call ||
      (call.caller_id !== actor.id && call.callee_id !== actor.id) ||
      !await isChatConversationAllowed(call.conversation_id, actor.id)) {
    sendSocketError(socket, "call_not_found", "المكالمة غير موجودة أو انتهت");
    return;
  }
  const peerId = call.caller_id === actor.id ? call.callee_id : call.caller_id;

  if (input.type === "call:accept") {
    if (call.callee_id !== actor.id || call.status !== "ringing") {
      sendSocketError(socket, "invalid_call_action", "لا يمكن قبول هذه المكالمة");
      return;
    }
    await execute(`
      UPDATE chat_calls SET status='active', expires_at=datetime('now', '+1 hour')
      WHERE call_id=?
    `, callId);
    await publishCallEvent(call, {
      type: "call:accepted",
      call_id: callId,
      conversation_id: call.conversation_id,
      media_type: call.media_type,
    });
    return;
  }

  if (input.type === "call:decline" || input.type === "call:end") {
    if (input.type === "call:decline" && (call.callee_id !== actor.id || call.status !== "ringing")) {
      sendSocketError(socket, "invalid_call_action", "لا يمكن رفض هذه المكالمة");
      return;
    }
    await execute("DELETE FROM chat_calls WHERE call_id=?", callId);
    await publishCallEvent(call, {
      type: input.type === "call:decline" ? "call:declined" : "call:ended",
      call_id: callId,
      conversation_id: call.conversation_id,
    });
    return;
  }

  if (input.type === "call:signal") {
    if (call.status !== "active" || !input.signal || typeof input.signal !== "object") {
      sendSocketError(socket, "invalid_signal", "إشارة المكالمة غير صالحة");
      return;
    }
    await setRealtimeEvent(peerId, {
      type: "call:signal",
      call_id: callId,
      conversation_id: call.conversation_id,
      signal: input.signal,
    });
    return;
  }

  sendSocketError(socket, "unknown_event", "نوع الإشارة غير مدعوم");
}

export function attachChatRealtime(server: Server): () => void {
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    handleProtocols(protocols) {
      return protocols.has(CHAT_PROTOCOL) ? CHAT_PROTOCOL : false;
    },
  });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    if (pathname !== "/api/chat/ws") return;

    void resolveChatActor(protocolToken(req)).then(actor => {
      if (!actor || actor.id <= 0) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(req, socket, head, client => {
        socketActors.set(client, actor);
        websocketServer.emit("connection", client, req);
      });
    }).catch(() => {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
    });
  };
  server.on("upgrade", onUpgrade);

  websocketServer.on("connection", socket => {
    const actor = socketActors.get(socket);
    if (!actor) {
      socket.close(1008, "Authentication required");
      return;
    }
    void (async () => {
      const stopPolling = await beginPolling(socket, actor);
      await sendPendingWorkerChatCalls(socket, actor.id);
      socket.on("message", raw => {
        void handleWorkerChatMessage(socket, actor, raw).catch(error => {
          logger.warn({ err: error, userId: actor.id }, "Chat websocket message failed");
          sendSocketError(socket, "server_error", "تعذر معالجة إشارة المكالمة");
        });
      });
      socket.on("close", () => stopPolling());
    })().catch(error => {
      logger.error({ err: error, userId: actor.id }, "Chat websocket initialization failed");
      socket.close(1011, "Service unavailable");
    });
    socket.on("error", error => logger.warn({ err: error, userId: actor.id }, "Chat websocket error"));
  });

  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    server.off("upgrade", onUpgrade);
    for (const client of websocketServer.clients) client.terminate();
    websocketServer.close();
  };
}

export async function expireChatRealtimeData(): Promise<void> {
  await execute("DELETE FROM chat_realtime_events WHERE datetime(expires_at)<=datetime('now')");
  const expiredCalls = await queryAll<{
    call_id: string;
    caller_id: number;
    callee_id: number;
    conversation_id: number;
  }>(`
    SELECT call_id, caller_id, callee_id, conversation_id
    FROM chat_calls WHERE datetime(expires_at)<=datetime('now')
  `);
  for (const call of expiredCalls) {
    await publishCallEvent(call, {
      type: "call:ended",
      call_id: call.call_id,
      conversation_id: call.conversation_id,
      reason: "timeout",
    });
  }
  await execute("DELETE FROM chat_calls WHERE datetime(expires_at)<=datetime('now')");
}