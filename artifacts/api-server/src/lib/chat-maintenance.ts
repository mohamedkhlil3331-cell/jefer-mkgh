import { execute, queryAll } from "./erp-sql.js";
import { ObjectNotFoundError, ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";
import { startBrowserPushQueueWorker } from "./chat-push.js";
import { expireChatRealtimeData } from "./chat-realtime.js";

const objectStorage = new ObjectStorageService();

async function deletePrivateObject(path: string): Promise<void> {
  const file = await objectStorage.getObjectEntityFile(path);
  await file.delete();
}

export async function runChatMaintenance(): Promise<void> {
  const expiredMessages = await queryAll<{ id: number; media_path: string | null }>(`
    SELECT m.id, m.media_path
    FROM chat_messages m
    JOIN chat_conversations c ON c.id=m.conversation_id
    WHERE c.retention_mode='auto_delete'
      AND datetime(m.created_at, printf('+%d days', c.retention_days))<=datetime('now')
    ORDER BY m.id
    LIMIT 200
  `);

  for (const message of expiredMessages) {
    if (message.media_path) {
      try {
        await deletePrivateObject(message.media_path);
      } catch (error) {
        if (!(error instanceof ObjectNotFoundError)) {
          logger.warn({ err: error, messageId: message.id }, "Could not remove expired chat audio");
          continue;
        }
      }
    }
    await execute("DELETE FROM chat_messages WHERE id=?", message.id);
  }

  const expiredUploads = await queryAll<{ token_hash: string; object_path: string }>(`
    SELECT token_hash, object_path
    FROM chat_upload_tokens
    WHERE consumed_at IS NULL AND datetime(expires_at)<=datetime('now')
    ORDER BY created_at
    LIMIT 100
  `);

  for (const upload of expiredUploads) {
    try {
      await deletePrivateObject(upload.object_path);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        logger.warn({ err: error }, "Could not remove abandoned chat voice upload");
        continue;
      }
    }
    await execute("DELETE FROM chat_upload_tokens WHERE token_hash=?", upload.token_hash);
  }

  await execute(`
    DELETE FROM chat_push_queue
    WHERE processed_at IS NOT NULL AND datetime(created_at)<datetime('now','-7 days')
  `);
  await expireChatRealtimeData();
}

export function startChatBackgroundServices(): void {
  startBrowserPushQueueWorker();
  void runChatMaintenance().catch(error =>
    logger.error({ err: error }, "Initial chat maintenance failed"),
  );
  const timer = setInterval(() => {
    void runChatMaintenance().catch(error =>
      logger.error({ err: error }, "Chat maintenance failed"),
    );
  }, 15 * 60 * 1000);
  timer.unref();
}