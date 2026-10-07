import crypto from "node:crypto";
import webpush from "web-push";
import db from "./db.js";
import { logger } from "./logger.js";

export type BrowserPushKind = "message" | "order";

export interface BrowserPushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PendingNotification {
  queue_id: number;
  notification_id: number;
  user_phone: string | null;
  title: string | null;
  body: string | null;
}

let queueWorkerRunning = false;

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET must be configured to protect browser push keys");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encryptPrivateKey(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function decryptPrivateKey(value: string): string {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    throw new Error("Stored browser push key has an invalid format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivText, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getVapidKeys(): VapidKeys {
  const stored = db.prepare(
    "SELECT public_key, encrypted_private_key FROM chat_vapid_keys WHERE id=1",
  ).get() as { public_key: string; encrypted_private_key: string } | undefined;

  if (stored) {
    try {
      const keys = {
        publicKey: stored.public_key,
        privateKey: decryptPrivateKey(stored.encrypted_private_key),
      };
      webpush.setVapidDetails("mailto:notifications@example.com", keys.publicKey, keys.privateKey);
      return keys;
    } catch (error) {
      logger.warn({ err: error }, "Stored browser push key could not be decrypted; resetting browser subscriptions");
      db.transaction(() => {
        db.prepare("DELETE FROM chat_push_subscriptions").run();
        db.prepare("DELETE FROM chat_vapid_keys WHERE id=1").run();
      })();
    }
  }

  const keys = webpush.generateVAPIDKeys();
  db.prepare(`
    INSERT INTO chat_vapid_keys (id, public_key, encrypted_private_key)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      public_key=excluded.public_key,
      encrypted_private_key=excluded.encrypted_private_key,
      created_at=datetime('now')
  `).run(keys.publicKey, encryptPrivateKey(keys.privateKey));
  webpush.setVapidDetails("mailto:notifications@example.com", keys.publicKey, keys.privateKey);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

export function getBrowserPushPublicKey(): string {
  return getVapidKeys().publicKey;
}

export function notificationPreferences(userId: number): {
  messages_enabled: boolean;
  orders_enabled: boolean;
} {
  const row = db.prepare(`
    SELECT messages_enabled, orders_enabled
    FROM chat_notification_preferences WHERE user_id=?
  `).get(userId) as { messages_enabled: number; orders_enabled: number } | undefined;
  return {
    messages_enabled: row ? row.messages_enabled === 1 : true,
    orders_enabled: row ? row.orders_enabled === 1 : true,
  };
}

export async function sendBrowserPush(
  userId: number,
  kind: BrowserPushKind,
  payload: BrowserPushPayload,
): Promise<void> {
  const preferences = notificationPreferences(userId);
  if (kind === "message" && !preferences.messages_enabled) return;
  if (kind === "order" && !preferences.orders_enabled) return;

  const subscriptions = db.prepare(`
    SELECT endpoint, p256dh, auth
    FROM chat_push_subscriptions WHERE user_id=?
  `).all(userId) as StoredSubscription[];
  if (subscriptions.length === 0) return;

  const keys = getVapidKeys();
  webpush.setVapidDetails("mailto:notifications@example.com", keys.publicKey, keys.privateKey);
  const body = JSON.stringify(payload);
  let retryableFailure = false;

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, body, { TTL: 60 });
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        db.prepare("DELETE FROM chat_push_subscriptions WHERE endpoint=?").run(subscription.endpoint);
        return;
      }
      retryableFailure = true;
      logger.warn({ err: error, userId }, "Browser push delivery failed");
    }
  }));
  if (retryableFailure) {
    throw new Error("One or more browser push deliveries failed");
  }
}

export function savePushSubscription(
  userId: number,
  endpoint: string,
  p256dh: string,
  auth: string,
): void {
  db.prepare(`
    INSERT INTO chat_push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id=excluded.user_id,
      p256dh=excluded.p256dh,
      auth=excluded.auth,
      updated_at=datetime('now')
  `).run(userId, endpoint, p256dh, auth);
}

function processPendingNotifications(): void {
  if (queueWorkerRunning) return;
  queueWorkerRunning = true;

  void (async () => {
    try {
      const pending = db.prepare(`
        SELECT q.id AS queue_id, q.notification_id,
               n.user_phone, n.title, n.body
        FROM chat_push_queue q
        LEFT JOIN notifications n ON n.id=q.notification_id
        WHERE q.processed_at IS NULL AND q.attempts < 5
        ORDER BY q.id
        LIMIT 50
      `).all() as PendingNotification[];

      for (const notification of pending) {
        db.prepare("UPDATE chat_push_queue SET attempts=attempts+1 WHERE id=?")
          .run(notification.queue_id);
        if (!notification.user_phone) {
          db.prepare("UPDATE chat_push_queue SET processed_at=datetime('now') WHERE id=?")
            .run(notification.queue_id);
          continue;
        }

        const user = db.prepare(`
          SELECT id FROM users
          WHERE phone=? AND active=1 AND COALESCE(approval_status,'approved')='approved'
        `).get(notification.user_phone) as { id: number } | undefined;
        if (user) {
          await sendBrowserPush(user.id, "order", {
            title: notification.title || "تحديث على طلبك",
            body: notification.body || "",
            url: "/notifications",
            tag: `order-${notification.notification_id}`,
          });
        }
        db.prepare("UPDATE chat_push_queue SET processed_at=datetime('now') WHERE id=?")
          .run(notification.queue_id);
      }

      db.prepare(`
        UPDATE chat_push_queue SET processed_at=datetime('now')
        WHERE processed_at IS NULL AND attempts >= 5
      `).run();
    } catch (error) {
      logger.error({ err: error }, "Browser push queue processing failed");
    } finally {
      queueWorkerRunning = false;
    }
  })();
}

export function startBrowserPushQueueWorker(): void {
  processPendingNotifications();
  const timer = setInterval(processPendingNotifications, 5000);
  timer.unref();
}