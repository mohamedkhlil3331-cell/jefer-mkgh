import crypto from "node:crypto";
import { isIP } from "node:net";
import { Router, type Request, type Response } from "express";
import {
  CreateChatConversationBody,
  CreateChatVoiceUploadBody,
  DeleteChatMessageParams,
  EditChatMessageBody,
  GetChatMessagesParams,
  GetOlderChatMessagesParams,
  RegisterChatPushSubscriptionBody,
  RemoveChatPushSubscriptionBody,
  SendChatMessageBody,
  UpdateChatConversationSettingsBody,
  UpdateChatAdminCustomerAccessRulesBody,
  UpdateChatNotificationSettingsBody,
} from "@workspace/api-zod";
import db from "../lib/db.js";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { actorFromRequest, canManageUsers, isInternalChatUser, type ChatActor } from "../lib/chat-auth.js";
import {
  areChatUsersAllowed,
  CHAT_CUSTOMER_CATEGORIES,
  getChatCategoryRules,
  getCustomerChatPolicy,
  listChatCustomerAccounts,
  listChatStaffContacts,
} from "../lib/chat-access.js";
import {
  getBrowserPushPublicKey,
  notificationPreferences,
  savePushSubscription,
  sendBrowserPush,
} from "../lib/chat-push.js";
import { publishChatConversationEvent, publishChatRealtimeToUsers } from "../lib/chat-realtime.js";

const router = Router();
const objectStorage = new ObjectStorageService();
const AUDIO_TYPES = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"]);
const MAX_MESSAGE_LENGTH = 4000;
const MESSAGE_PAGE_SIZE = 50;
const MAX_VOICE_SIZE = 25_000_000;

function isSafePushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !isIP(hostname) &&
      hostname !== "localhost" &&
      !hostname.endsWith(".localhost") &&
      !hostname.endsWith(".local") &&
      !hostname.endsWith(".internal");
  } catch {
    return false;
  }
}

interface ChatMessageRow {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  message_type: "text" | "voice";
  text: string | null;
  media_path: string | null;
  media_type: string | null;
  media_size: number | null;
  created_at: string;
  edited_at: string | null;
}

interface ChatMember {
  user_low_id: number;
  user_high_id: number;
}

function actorForRequest(req: Request, res: Response, internal = false): ChatActor | null {
  const actor = actorFromRequest(req);
  if (!actor) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return null;
  }
  if (actor.id <= 0) {
    res.status(403).json({ error: "حساب مستخدم صالح مطلوب" });
    return null;
  }
  if (internal && !isInternalChatUser(actor)) {
    res.status(403).json({ error: "هذه الخدمة متاحة لحسابات الموظفين فقط" });
    return null;
  }
  return actor;
}

function accountActorForRequest(req: Request, res: Response): ChatActor | null {
  const actor = actorForRequest(req, res, false);
  if (!actor) return null;
  if (actor.id <= 0) {
    res.status(403).json({ error: "حساب مستخدم صالح مطلوب" });
    return null;
  }
  return actor;
}

function managerForRequest(req: Request, res: Response): ChatActor | null {
  const actor = actorForRequest(req, res, false);
  if (!actor) return null;
  if (!actor.isSystemAdmin && (!isInternalChatUser(actor) || !canManageUsers(actor))) {
    res.status(403).json({ error: "صلاحية إدارة المستخدمين مطلوبة" });
    return null;
  }
  return actor;
}

function customerAccessManagerForRequest(req: Request, res: Response): ChatActor | null {
  const actor = actorFromRequest(req);
  if (!actor) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return null;
  }
  if (
    !actor.isSystemAdmin &&
    (actor.id <= 0 || (actor.role !== "admin" && !actor.permissions?.includes("users_manage")))
  ) {
    res.status(403).json({ error: "صلاحية إدارة المستخدمين مطلوبة" });
    return null;
  }
  return actor;
}

function isConversationMember(conversationId: number, userId: number): ChatMember | null {
  const member = db.prepare(`
    SELECT user_low_id, user_high_id
    FROM chat_conversations
    WHERE id=? AND (user_low_id=? OR user_high_id=?)
  `).get(conversationId, userId, userId) as ChatMember | undefined;
  if (!member || !areChatUsersAllowed(member.user_low_id, member.user_high_id)) return null;
  return member;
}

function endCallsNoLongerAllowed(): void {
  const calls = db.prepare(`
    SELECT calls.call_id, calls.caller_id, calls.callee_id,
           conversations.user_low_id, conversations.user_high_id
    FROM chat_calls calls
    JOIN chat_conversations conversations ON conversations.id=calls.conversation_id
  `).all() as Array<{
    call_id: string;
    caller_id: number;
    callee_id: number;
    user_low_id: number;
    user_high_id: number;
  }>;
  const removeCall = db.prepare("DELETE FROM chat_calls WHERE call_id=?");
  for (const call of calls) {
    if (areChatUsersAllowed(call.user_low_id, call.user_high_id)) continue;
    const result = removeCall.run(call.call_id);
    if (result.changes) {
      publishChatRealtimeToUsers([call.caller_id, call.callee_id], {
        type: "call:ended",
        call_id: call.call_id,
      });
    }
  }
}

function messageRow(messageId: number): ChatMessageRow | undefined {
  return db.prepare(`
    SELECT m.id, m.conversation_id, m.sender_id,
           u.name AS sender_name, u.role AS sender_role,
           m.message_type, m.text, m.media_path, m.media_type,
           m.media_size, m.created_at, m.edited_at
    FROM chat_messages m JOIN users u ON u.id=m.sender_id
    WHERE m.id=?
  `).get(messageId) as ChatMessageRow | undefined;
}

function presentMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_role: row.sender_role,
    type: row.message_type,
    text: row.text,
    media_url: row.media_path ? `/api/chat/messages/${row.id}/media` : null,
    media_type: row.media_type,
    media_size: row.media_size,
    created_at: row.created_at,
    edited_at: row.edited_at,
  };
}

function listMessages(conversationId: number, beforeId?: number) {
  const rows = beforeId
    ? db.prepare(`
        SELECT m.id, m.conversation_id, m.sender_id,
               u.name AS sender_name, u.role AS sender_role,
               m.message_type, m.text, m.media_path, m.media_type,
               m.media_size, m.created_at, m.edited_at
        FROM chat_messages m JOIN users u ON u.id=m.sender_id
        WHERE m.conversation_id=? AND m.id<?
        ORDER BY m.id DESC LIMIT ?
      `).all(conversationId, beforeId, MESSAGE_PAGE_SIZE) as ChatMessageRow[]
    : db.prepare(`
        SELECT m.id, m.conversation_id, m.sender_id,
               u.name AS sender_name, u.role AS sender_role,
               m.message_type, m.text, m.media_path, m.media_type,
               m.media_size, m.created_at, m.edited_at
        FROM chat_messages m JOIN users u ON u.id=m.sender_id
        WHERE m.conversation_id=?
        ORDER BY m.id DESC LIMIT ?
      `).all(conversationId, MESSAGE_PAGE_SIZE) as ChatMessageRow[];
  return rows.reverse().map(presentMessage);
}

function presentAdminConversation(conversationId: number, preferredUserId?: number) {
  const row = db.prepare(`
    SELECT c.id, c.user_low_id, c.user_high_id,
           c.retention_mode, c.retention_days, c.allow_user_delete,
           selected.id AS user_id, selected.name AS user_name, selected.role AS user_role,
           other.id AS other_user_id, other.name AS other_user_name, other.role AS other_user_role
    FROM chat_conversations c
    JOIN users selected ON selected.id=?
      AND (selected.id=c.user_low_id OR selected.id=c.user_high_id)
    JOIN users other ON other.id=CASE WHEN selected.id=c.user_low_id THEN c.user_high_id ELSE c.user_low_id END
    WHERE c.id=?
  `).get(preferredUserId ?? -1, conversationId) as {
    id: number;
    retention_mode: "auto_delete" | "keep";
    retention_days: number;
    allow_user_delete: number;
    user_id: number;
    user_name: string;
    user_role: string;
    other_user_id: number;
    other_user_name: string;
    other_user_role: string;
  } | undefined;
  return row ? {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_role: row.user_role,
    other_user_id: row.other_user_id,
    other_user_name: row.other_user_name,
    other_user_role: row.other_user_role,
    retention_mode: row.retention_mode,
    retention_days: row.retention_days,
    allow_user_delete: row.allow_user_delete === 1,
  } : null;
}

function removeStoredObject(objectPath: string): Promise<void> {
  return objectStorage.getObjectEntityFile(objectPath).then(async file => {
    await file.delete();
  });
}

router.get("/chat/contacts", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const coworkers = db.prepare(`
    SELECT id, name, phone, role
    FROM users
    WHERE active=1 AND COALESCE(approval_status,'approved')='approved'
      AND id<>? AND role NOT IN ('customer','rental_trip_customer')
    ORDER BY name COLLATE NOCASE
  `).all(actor.id) as Array<{ id: number; name: string; phone: string; role: string }>;

  if (actor.role === "customer" || actor.role === "rental_trip_customer") {
    res.json(coworkers
      .filter(contact => contact.role === "rep" || contact.role === "supervisor")
      .filter(contact => areChatUsersAllowed(actor.id, contact.id)));
    return;
  }

  const customerContacts = actor.role === "rep" || actor.role === "supervisor"
    ? listChatCustomerAccounts().filter(contact => areChatUsersAllowed(actor.id, contact.id))
    : [];
  res.json([...coworkers, ...customerContacts].sort((a, b) => a.name.localeCompare(b.name, "ar")));
});

router.get("/chat/conversations", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const rows = db.prepare(`
    SELECT c.id, c.updated_at,
           other.id AS other_user_id, other.name AS other_user_name,
           other.phone AS other_user_phone, other.role AS other_user_role,
           last.id AS last_id, last.conversation_id AS last_conversation_id,
           last.sender_id AS last_sender_id, last.name AS last_sender_name,
           last.role AS last_sender_role, last.message_type AS last_type,
           last.text AS last_text, last.media_path AS last_media_path,
           last.media_type AS last_media_type, last.media_size AS last_media_size,
           last.created_at AS last_created_at, last.edited_at AS last_edited_at,
           (SELECT COUNT(*) FROM chat_messages unread
            WHERE unread.conversation_id=c.id AND unread.sender_id<>?
              AND NOT EXISTS (
                SELECT 1 FROM chat_message_reads r
                WHERE r.message_id=unread.id AND r.user_id=?
              )) AS unread_count
    FROM chat_conversations c
    JOIN users other ON other.id=CASE WHEN c.user_low_id=? THEN c.user_high_id ELSE c.user_low_id END
    LEFT JOIN (
      SELECT m.*, u.name, u.role
      FROM chat_messages m JOIN users u ON u.id=m.sender_id
    ) last ON last.id=(
      SELECT MAX(latest.id) FROM chat_messages latest WHERE latest.conversation_id=c.id
    )
    WHERE c.user_low_id=? OR c.user_high_id=?
    ORDER BY c.updated_at DESC, c.id DESC
  `).all(actor.id, actor.id, actor.id, actor.id, actor.id) as Array<{
    id: number;
    updated_at: string;
    other_user_id: number;
    other_user_name: string;
    other_user_phone: string;
    other_user_role: string;
    last_id: number | null;
    last_conversation_id: number | null;
    last_sender_id: number | null;
    last_sender_name: string | null;
    last_sender_role: string | null;
    last_type: "text" | "voice" | null;
    last_text: string | null;
    last_media_path: string | null;
    last_media_type: string | null;
    last_media_size: number | null;
    last_created_at: string | null;
    last_edited_at: string | null;
    unread_count: number;
  }>;

  res.json(rows.filter(row => areChatUsersAllowed(actor.id, row.other_user_id)).map(row => ({
    id: row.id,
    other_user_id: row.other_user_id,
    other_user_name: row.other_user_name,
    other_user_phone: row.other_user_phone,
    other_user_role: row.other_user_role,
    last_message: row.last_id === null ? null : {
      id: row.last_id,
      conversation_id: row.last_conversation_id,
      sender_id: row.last_sender_id,
      sender_name: row.last_sender_name,
      sender_role: row.last_sender_role,
      type: row.last_type,
      text: row.last_text,
      media_url: row.last_media_path ? `/api/chat/messages/${row.last_id}/media` : null,
      media_type: row.last_media_type,
      media_size: row.last_media_size,
      created_at: row.last_created_at,
      edited_at: row.last_edited_at,
    },
    updated_at: row.updated_at,
    unread_count: row.unread_count,
  })));
});

router.post("/chat/conversations", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const parsed = CreateChatConversationBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "بيانات المستخدم غير صالحة" });
  const recipientId = parsed.data.recipient_user_id;
  if (recipientId === actor.id) return void res.status(400).json({ error: "لا يمكن بدء محادثة مع نفسك" });
  const recipient = db.prepare(`
    SELECT id, role FROM users
    WHERE id=? AND active=1 AND COALESCE(approval_status,'approved')='approved'
  `).get(recipientId) as { id: number; role: string } | undefined;
  if (!recipient || !areChatUsersAllowed(actor.id, recipient.id)) {
    return void res.status(403).json({ error: "المستخدم غير متاح للمحادثة" });
  }

  const low = Math.min(actor.id, recipientId);
  const high = Math.max(actor.id, recipientId);
  db.prepare(`
    INSERT OR IGNORE INTO chat_conversations (user_low_id, user_high_id)
    VALUES (?, ?)
  `).run(low, high);
  const conversation = db.prepare("SELECT id FROM chat_conversations WHERE user_low_id=? AND user_high_id=?")
    .get(low, high) as { id: number };
  res.json({ id: conversation.id });
});

router.get("/chat/conversations/:conversationId/messages", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  if (!GetChatMessagesParams.safeParse({ conversationId }).success) {
    return void res.status(400).json({ error: "رقم المحادثة غير صالح" });
  }
  if (!isConversationMember(conversationId, actor.id)) {
    return void res.status(404).json({ error: "المحادثة غير موجودة" });
  }
  res.json(listMessages(conversationId));
});

router.get("/chat/conversations/:conversationId/messages/before/:beforeId", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  const beforeId = Number(req.params.beforeId);
  if (!GetOlderChatMessagesParams.safeParse({ conversationId, beforeId }).success) {
    return void res.status(400).json({ error: "بيانات المحادثة غير صالحة" });
  }
  if (!isConversationMember(conversationId, actor.id)) {
    return void res.status(404).json({ error: "المحادثة غير موجودة" });
  }
  res.json(listMessages(conversationId, beforeId));
});

router.post("/chat/conversations/:conversationId/voice-upload-url", async (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  if (!isConversationMember(conversationId, actor.id)) {
    return void res.status(404).json({ error: "المحادثة غير موجودة" });
  }
  const parsed = CreateChatVoiceUploadBody.safeParse(req.body);
  if (!parsed.success ||
      !AUDIO_TYPES.has(parsed.data.contentType) ||
      parsed.data.size > MAX_VOICE_SIZE) {
    return void res.status(400).json({ error: "ملف الصوت غير مدعوم أو يتجاوز الحد المسموح" });
  }

  try {
    const uploadUrl = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);
    if (!objectPath.startsWith("/objects/")) {
      throw new Error("Object storage did not return a private object path");
    }
    const uploadToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(uploadToken).digest("hex");
    db.prepare(`
      INSERT INTO chat_upload_tokens (
        token_hash, user_id, conversation_id, object_path, media_type, expected_size, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+15 minutes'))
    `).run(
      tokenHash,
      actor.id,
      conversationId,
      objectPath,
      parsed.data.contentType,
      parsed.data.size,
    );
    res.status(201).json({ upload_url: uploadUrl, upload_token: uploadToken });
  } catch (error) {
    req.log.error({ err: error, conversationId }, "Failed to create private chat voice upload");
    res.status(503).json({ error: "تعذر تجهيز رفع الرسالة الصوتية" });
  }
});

router.post("/chat/conversations/:conversationId/messages", async (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  const member = isConversationMember(conversationId, actor.id);
  if (!member) return void res.status(404).json({ error: "المحادثة غير موجودة" });
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "صيغة الرسالة غير صالحة" });

  let text: string | null = null;
  let objectPath: string | null = null;
  let mediaType: string | null = null;
  let mediaSize: number | null = null;
  let uploadTokenHash: string | null = null;

  if (parsed.data.type === "text") {
    text = typeof parsed.data.text === "string" ? parsed.data.text.trim() : "";
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
      return void res.status(400).json({ error: "اكتب رسالة لا تتجاوز 4000 حرف" });
    }
  } else {
    if (typeof parsed.data.upload_token !== "string") {
      return void res.status(400).json({ error: "رمز رفع الصوت مطلوب" });
    }
    uploadTokenHash = crypto.createHash("sha256").update(parsed.data.upload_token).digest("hex");
    const upload = db.prepare(`
      SELECT object_path, media_type, expected_size
      FROM chat_upload_tokens
      WHERE token_hash=? AND user_id=? AND conversation_id=?
        AND consumed_at IS NULL AND datetime(expires_at)>datetime('now')
    `).get(uploadTokenHash, actor.id, conversationId) as {
      object_path: string;
      media_type: string;
      expected_size: number;
    } | undefined;
    if (!upload) return void res.status(400).json({ error: "انتهت صلاحية رفع الصوت؛ أعد المحاولة" });
    try {
      const file = await objectStorage.getObjectEntityFile(upload.object_path);
      const [metadata] = await file.getMetadata();
      const actualSize = Number(metadata.size);
      const actualType = (metadata.contentType || "").split(";")[0].trim().toLowerCase();
      if (actualSize !== upload.expected_size || actualSize > MAX_VOICE_SIZE ||
          actualType !== upload.media_type) {
        return void res.status(400).json({ error: "بيانات ملف الصوت لا تطابق الملف المرفوع" });
      }
      objectPath = upload.object_path;
      mediaType = upload.media_type;
      mediaSize = actualSize;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return void res.status(400).json({ error: "لم يكتمل رفع ملف الصوت" });
      }
      req.log.error({ err: error, conversationId }, "Could not verify uploaded chat audio");
      return void res.status(503).json({ error: "تعذر التحقق من ملف الصوت" });
    }
  }

  const currentMember = isConversationMember(conversationId, actor.id);
  if (!currentMember) return void res.status(404).json({ error: "المحادثة غير موجودة" });
  const result = db.prepare(`
    INSERT INTO chat_messages (
      conversation_id, sender_id, message_type, text, media_path, media_type, media_size
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    conversationId,
    actor.id,
    parsed.data.type,
    text,
    objectPath,
    mediaType,
    mediaSize,
  );
  const messageId = Number(result.lastInsertRowid);
  db.prepare("UPDATE chat_conversations SET updated_at=datetime('now') WHERE id=?")
    .run(conversationId);
  if (uploadTokenHash) {
    db.prepare("DELETE FROM chat_upload_tokens WHERE token_hash=?").run(uploadTokenHash);
  }

  const row = messageRow(messageId);
  if (!row) return void res.status(500).json({ error: "تعذر حفظ الرسالة" });
  const message = presentMessage(row);
  publishChatConversationEvent(conversationId, { type: "chat:message", message });
  const peerId = currentMember.user_low_id === actor.id ? currentMember.user_high_id : currentMember.user_low_id;
  void sendBrowserPush(peerId, "message", {
    title: "رسالة جديدة",
    body: parsed.data.type === "voice" ? `${actor.name} أرسل رسالة صوتية` : `${actor.name} أرسل رسالة`,
    url: `/chat?conversation=${conversationId}`,
    tag: `chat-${conversationId}`,
  }).catch(error => req.log.warn({ err: error, peerId }, "Chat message push delivery failed"));
  res.status(201).json(message);
});

router.put("/chat/messages/:messageId", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const messageId = Number(req.params.messageId);
  const parsed = EditChatMessageBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "نص الرسالة غير صالح" });
  const row = messageRow(messageId);
  if (!row) return void res.status(404).json({ error: "الرسالة غير موجودة" });
  if (!isConversationMember(row.conversation_id, actor.id)) {
    return void res.status(404).json({ error: "الرسالة غير موجودة" });
  }
  if (row.sender_id !== actor.id || row.message_type !== "text") {
    return void res.status(403).json({ error: "يمكن تعديل الرسائل النصية التي أرسلتها فقط" });
  }
  const text = parsed.data.text.trim();
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    return void res.status(400).json({ error: "اكتب رسالة لا تتجاوز 4000 حرف" });
  }
  db.prepare("UPDATE chat_messages SET text=?, edited_at=datetime('now') WHERE id=?")
    .run(text, messageId);
  db.prepare("UPDATE chat_conversations SET updated_at=datetime('now') WHERE id=?")
    .run(row.conversation_id);
  const updated = messageRow(messageId);
  if (!updated) return void res.status(404).json({ error: "الرسالة غير موجودة" });
  const message = presentMessage(updated);
  publishChatConversationEvent(row.conversation_id, {
    type: "chat:message-edited",
    message,
  });
  res.json(message);
});

router.delete("/chat/messages/:messageId", async (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const messageId = Number(req.params.messageId);
  if (!DeleteChatMessageParams.safeParse({ messageId }).success) {
    return void res.status(400).json({ error: "رقم الرسالة غير صالح" });
  }
  const row = messageRow(messageId);
  if (!row) return void res.status(404).json({ error: "الرسالة غير موجودة" });
  if (!isConversationMember(row.conversation_id, actor.id)) {
    return void res.status(403).json({ error: "لا تملك صلاحية حذف هذه الرسالة" });
  }
  const policy = db.prepare(`
    SELECT allow_user_delete FROM chat_conversations WHERE id=?
  `).get(row.conversation_id) as { allow_user_delete: number } | undefined;
  if (!policy?.allow_user_delete) {
    return void res.status(403).json({ error: "حذف الرسائل غير مسموح في هذه المحادثة" });
  }
  if (row.media_path) {
    try {
      await removeStoredObject(row.media_path);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        req.log.error({ err: error, messageId }, "Could not delete private chat audio");
        return void res.status(503).json({ error: "تعذر حذف ملف الرسالة" });
      }
    }
  }
  db.prepare("DELETE FROM chat_messages WHERE id=?").run(messageId);
  db.prepare("UPDATE chat_conversations SET updated_at=datetime('now') WHERE id=?")
    .run(row.conversation_id);
  publishChatConversationEvent(row.conversation_id, {
    type: "chat:message-deleted",
    conversation_id: row.conversation_id,
    message_id: messageId,
  });
  res.json({ ok: true });
});

router.get("/chat/messages/:messageId/media", async (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const messageId = Number(req.params.messageId);
  const row = messageRow(messageId);
  if (!row?.media_path || !row.media_type) {
    return void res.status(404).json({ error: "الرسالة الصوتية غير موجودة" });
  }
  if (!isConversationMember(row.conversation_id, actor.id)) {
    return void res.status(403).json({ error: "لا تملك صلاحية الاستماع لهذه الرسالة" });
  }
  try {
    const file = await objectStorage.getObjectEntityFile(row.media_path);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", row.media_type);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    file.createReadStream().on("error", error => {
      if (res.headersSent) res.destroy(error);
      else {
        req.log.error({ err: error, messageId }, "Failed to stream private chat audio");
        res.status(500).end();
      }
    }).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return void res.status(404).json({ error: "الملف الصوتي غير موجود" });
    }
    req.log.error({ err: error, messageId }, "Failed to read private chat audio");
    res.status(503).json({ error: "تعذر تشغيل الملف الصوتي" });
  }
});

router.post("/chat/conversations/:conversationId/read", (req, res) => {
  const actor = actorForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  if (!isConversationMember(conversationId, actor.id)) {
    return void res.status(404).json({ error: "المحادثة غير موجودة" });
  }
  db.prepare(`
    INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages
    WHERE conversation_id=? AND sender_id<>?
  `).run(actor.id, conversationId, actor.id);
  publishChatConversationEvent(conversationId, {
    type: "chat:read",
    conversation_id: conversationId,
    reader_id: actor.id,
  });
  res.json({ ok: true });
});

router.get("/chat/notification-settings", (req, res) => {
  const actor = accountActorForRequest(req, res);
  if (!actor) return;
  res.json(notificationPreferences(actor.id));
});

router.put("/chat/notification-settings", (req, res) => {
  const actor = accountActorForRequest(req, res);
  if (!actor) return;
  const parsed = UpdateChatNotificationSettingsBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "إعدادات الإشعارات غير صالحة" });
  db.prepare(`
    INSERT INTO chat_notification_preferences (user_id, messages_enabled, orders_enabled)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      messages_enabled=excluded.messages_enabled,
      orders_enabled=excluded.orders_enabled,
      updated_at=datetime('now')
  `).run(
    actor.id,
    parsed.data.messages_enabled ? 1 : 0,
    parsed.data.orders_enabled ? 1 : 0,
  );
  res.json(parsed.data);
});

router.get("/chat/push/vapid-public-key", (req, res) => {
  const actor = actorForRequest(req, res, false);
  if (!actor) return;
  try {
    res.json({ public_key: getBrowserPushPublicKey() });
  } catch (error) {
    req.log.error({ err: error }, "Could not load browser push key");
    res.status(503).json({ error: "إشعارات المتصفح غير مهيأة على الخادم" });
  }
});

router.post("/chat/push/subscriptions", (req, res) => {
  const actor = accountActorForRequest(req, res);
  if (!actor) return;
  const parsed = RegisterChatPushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "اشتراك الإشعارات غير صالح" });
  if (!isSafePushEndpoint(parsed.data.endpoint)) {
    return void res.status(400).json({ error: "عنوان اشتراك الإشعارات غير صالح" });
  }
  savePushSubscription(
    actor.id,
    parsed.data.endpoint,
    parsed.data.keys.p256dh,
    parsed.data.keys.auth,
  );
  res.status(201).json({ ok: true });
});

router.delete("/chat/push/subscriptions", (req, res) => {
  const actor = accountActorForRequest(req, res);
  if (!actor) return;
  const parsed = RemoveChatPushSubscriptionBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "عنوان الاشتراك غير صالح" });
  db.prepare("DELETE FROM chat_push_subscriptions WHERE user_id=? AND endpoint=?")
    .run(actor.id, parsed.data.endpoint);
  res.json({ ok: true });
});

router.get("/chat/admin/customer-access", (req, res) => {
  const actor = customerAccessManagerForRequest(req, res);
  if (!actor) return;

  const customers = listChatCustomerAccounts().map(customer => {
    const policy = getCustomerChatPolicy(customer.id);
    return {
      ...customer,
      category: policy?.category ?? null,
      default_contact_ids: policy?.default_contact_ids ?? [],
      rules: policy?.customer_rules ?? [],
    };
  });
  res.json({
    staff: listChatStaffContacts(),
    customers,
    categories: CHAT_CUSTOMER_CATEGORIES.map(category => ({
      ...category,
      rules: getChatCategoryRules(category.key),
    })),
  });
});

router.put("/chat/admin/customer-access/rules", (req, res) => {
  const actor = customerAccessManagerForRequest(req, res);
  if (!actor) return;
  const parsed = UpdateChatAdminCustomerAccessRulesBody.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: "بيانات صلاحيات المحادثة غير صالحة" });
  }

  const { scope, category, customer_user_id: customerUserId, rules } = parsed.data;
  if (
    (scope === "category" && (!category || customerUserId !== null)) ||
    (scope === "customer" && (category !== null || !customerUserId))
  ) {
    return void res.status(400).json({ error: "حدد فئة أو عميلاً واحداً لحفظ الصلاحيات" });
  }

  if (scope === "customer") {
    const customer = db.prepare(`
      SELECT id FROM users
      WHERE id=? AND role IN ('customer','rental_trip_customer')
        AND active=1 AND COALESCE(approval_status,'approved')='approved'
    `).get(customerUserId) as { id: number } | undefined;
    if (!customer) return void res.status(404).json({ error: "حساب العميل غير موجود" });
  }

  const contactIds = rules.map(rule => rule.contact_user_id);
  if (new Set(contactIds).size !== contactIds.length) {
    return void res.status(400).json({ error: "لا يمكن تكرار جهة الاتصال في القواعد" });
  }
  const eligibleContactIds = contactIds.length
    ? new Set((db.prepare(`
        SELECT id FROM users
        WHERE id IN (${contactIds.map(() => "?").join(",")})
          AND role IN ('rep','supervisor')
      `).all(...contactIds) as Array<{ id: number }>).map(contact => contact.id))
    : new Set<number>();
  if (contactIds.some(id => !eligibleContactIds.has(id))) {
    return void res.status(400).json({ error: "يمكن تحديد المشرفين والمناديب النشطين فقط" });
  }

  const updatedBy = actor.id > 0 ? actor.id : null;
  const saveRules = db.transaction(() => {
    if (scope === "category") {
      db.prepare("DELETE FROM chat_customer_category_rules WHERE category=?").run(category);
      const insert = db.prepare(`
        INSERT INTO chat_customer_category_rules (category, contact_user_id, effect, updated_by)
        VALUES (?, ?, ?, ?)
      `);
      for (const rule of rules) {
        insert.run(category, rule.contact_user_id, rule.effect, updatedBy);
      }
    } else {
      db.prepare("DELETE FROM chat_customer_direct_rules WHERE customer_user_id=?").run(customerUserId);
      const insert = db.prepare(`
        INSERT INTO chat_customer_direct_rules (customer_user_id, contact_user_id, effect, updated_by)
        VALUES (?, ?, ?, ?)
      `);
      for (const rule of rules) {
        insert.run(customerUserId, rule.contact_user_id, rule.effect, updatedBy);
      }
    }
  });
  saveRules();
  endCallsNoLongerAllowed();

  res.json({
    ok: true,
    scope,
    category: scope === "category" ? category : null,
    customer_user_id: scope === "customer" ? customerUserId : null,
    rules,
  });
});

router.get("/chat/admin/users/:userId/conversations", (req, res) => {
  const actor = managerForRequest(req, res);
  if (!actor) return;
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return void res.status(400).json({ error: "رقم المستخدم غير صالح" });
  }
  const user = db.prepare(`
    SELECT id FROM users
    WHERE id=? AND active=1 AND COALESCE(approval_status,'approved')='approved'
      AND role NOT IN ('customer','rental_trip_customer')
  `).get(userId);
  if (!user) return void res.status(404).json({ error: "المستخدم غير موجود" });
  const conversations = db.prepare(`
    SELECT id FROM chat_conversations
    WHERE user_low_id=? OR user_high_id=?
    ORDER BY updated_at DESC, id DESC
  `).all(userId, userId) as Array<{ id: number }>;
  res.json(conversations.map(conversation => presentAdminConversation(conversation.id, userId)));
});

router.put("/chat/admin/conversations/:conversationId/settings", (req, res) => {
  const actor = managerForRequest(req, res);
  if (!actor) return;
  const conversationId = Number(req.params.conversationId);
  const parsed = UpdateChatConversationSettingsBody.safeParse(req.body);
  if (!Number.isInteger(conversationId) || conversationId <= 0 || !parsed.success) {
    return void res.status(400).json({ error: "إعدادات المحادثة غير صالحة" });
  }
  const members = db.prepare(`
    SELECT user_low_id, user_high_id FROM chat_conversations WHERE id=?
  `).get(conversationId) as ChatMember | undefined;
  if (!members) return void res.status(404).json({ error: "المحادثة غير موجودة" });
  db.prepare(`
    UPDATE chat_conversations
    SET retention_mode=?, retention_days=?, allow_user_delete=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    parsed.data.retention_mode,
    parsed.data.retention_days,
    parsed.data.allow_user_delete ? 1 : 0,
    conversationId,
  );
  res.json(presentAdminConversation(conversationId, members.user_low_id));
});

export default router;