import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  CreateCompanyBranchDocumentBody,
  CreateCompanyBranchDocumentParams,
  CreateCompanyBranchDocumentUploadUrlBody,
  CreateCompanyBranchDocumentUploadUrlParams,
  CreateCompanyBranchDocumentUploadUrlResponse,
  GetCompanyBranchDocumentsParams,
  GetCompanyBranchDocumentsResponse,
  GetCompanyBranchDocumentsResponseItem,
  GetCompanyBranchDocumentFileParams,
} from "@workspace/api-zod";
import db from "../lib/db.js";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();
const objectStorageService = new ObjectStorageService();
const ALLOWED_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const BRANCH_DOCUMENT_OBJECT_PATH = /^\/objects\/branch-documents\/[0-9a-f-]{36}$/i;
const FIXED_DOCUMENT_TITLES = {
  tax_number: "الرقم الضريبي",
  cr_number: "السجل التجاري",
  national_address: "العنوان الوطني",
} as const;

type BranchDocumentRow = {
  id: number;
  branch_id: number;
  document_type: "tax_number" | "cr_number" | "national_address" | "custom";
  title: string;
  object_path: string;
  file_name: string;
  content_type: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  file_size: number;
  created_at: string;
};

function branchDocumentAccess(req: Request): "allowed" | "unauthenticated" | "forbidden" {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token || token === "guest") return "unauthenticated";
  if (isSysAdminToken(token)) return "allowed";

  const session = db.prepare(`
    SELECT u.role
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now') AND u.active=1
      AND s.rowid=(
        SELECT MAX(current.rowid)
        FROM sessions current
        WHERE current.user_id=s.user_id
      )
  `).get(token) as { role: string } | undefined;

  if (!session) return "unauthenticated";
  return session.role === "admin" ? "allowed" : "forbidden";
}

function requireBranchAdmin(req: Request, res: Response): boolean {
  const access = branchDocumentAccess(req);
  if (access === "allowed") return true;
  res.status(access === "unauthenticated" ? 401 : 403).json({
    error: access === "unauthenticated" ? "تسجيل الدخول مطلوب" : "صلاحية مدير النظام مطلوبة",
  });
  return false;
}

function getActiveBranch(branchId: number) {
  return db.prepare("SELECT id FROM company_settings WHERE id=? AND active=1").get(branchId);
}

function formatDocument(row: BranchDocumentRow) {
  return GetCompanyBranchDocumentsResponseItem.parse({
    id: Number(row.id),
    branch_id: Number(row.branch_id),
    document_type: row.document_type,
    title: row.title,
    file_name: row.file_name,
    content_type: row.content_type,
    file_size: Number(row.file_size),
    created_at: row.created_at,
  });
}

router.post("/company-settings/:id/documents/upload-url", async (req: Request, res: Response) => {
  if (!requireBranchAdmin(req, res)) return;
  const params = CreateCompanyBranchDocumentUploadUrlParams.safeParse(req.params);
  const body = CreateCompanyBranchDocumentUploadUrlBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "بيانات الملف غير صحيحة" });
    return;
  }
  if (!getActiveBranch(params.data.id)) {
    res.status(404).json({ error: "الفرع غير موجود" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getBranchDocumentUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    const payload = CreateCompanyBranchDocumentUploadUrlResponse.parse({ uploadURL, objectPath });
    if (!BRANCH_DOCUMENT_OBJECT_PATH.test(payload.objectPath)) {
      res.status(500).json({ error: "تعذر إنشاء مسار مرفق خاص بالفرع" });
      return;
    }
    res.json(payload);
  } catch (error) {
    req.log.error({ err: error }, "Error generating company branch document upload URL");
    res.status(500).json({ error: "فشل تجهيز رفع الملف" });
  }
});

router.get("/company-settings/:id/documents", (req: Request, res: Response) => {
  if (!requireBranchAdmin(req, res)) return;
  const params = GetCompanyBranchDocumentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "رقم الفرع غير صحيح" });
    return;
  }
  if (!getActiveBranch(params.data.id)) {
    res.status(404).json({ error: "الفرع غير موجود" });
    return;
  }

  const rows = db.prepare(`
    SELECT id, branch_id, document_type, title, object_path, file_name, content_type, file_size, created_at
    FROM company_branch_documents
    WHERE branch_id=?
    ORDER BY CASE document_type
      WHEN 'tax_number' THEN 1
      WHEN 'cr_number' THEN 2
      WHEN 'national_address' THEN 3
      ELSE 4
    END, id
  `).all(params.data.id) as BranchDocumentRow[];
  res.json(GetCompanyBranchDocumentsResponse.parse(rows.map(formatDocument)));
});

router.post("/company-settings/:id/documents", async (req: Request, res: Response) => {
  if (!requireBranchAdmin(req, res)) return;
  const params = CreateCompanyBranchDocumentParams.safeParse(req.params);
  const body = CreateCompanyBranchDocumentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "بيانات المرفق غير صحيحة" });
    return;
  }
  const branchId = params.data.id;
  if (!getActiveBranch(branchId)) {
    res.status(404).json({ error: "الفرع غير موجود" });
    return;
  }

  const input = body.data;
  if (!BRANCH_DOCUMENT_OBJECT_PATH.test(input.object_path)) {
    res.status(400).json({ error: "مسار الملف غير صالح" });
    return;
  }
  const title = input.document_type === "custom"
    ? input.title.trim()
    : FIXED_DOCUMENT_TITLES[input.document_type];
  const fileName = input.file_name
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255) ?? "";
  if (!title || !fileName) {
    res.status(400).json({ error: "عنوان المستند واسم الملف مطلوبان" });
    return;
  }
  if (db.prepare("SELECT 1 FROM company_branch_documents WHERE object_path=?").get(input.object_path)) {
    res.status(409).json({ error: "هذا الملف مرتبط بمرفق آخر" });
    return;
  }

  try {
    const uploadedFile = await objectStorageService.getObjectEntityFile(input.object_path);
    const [metadata] = await uploadedFile.getMetadata();
    const actualContentType = String(metadata.contentType ?? "").split(";")[0].trim().toLowerCase();
    const actualSize = Number(metadata.size);
    if (
      !ALLOWED_CONTENT_TYPES.has(actualContentType)
      || actualContentType !== input.content_type
      || !Number.isSafeInteger(actualSize)
      || actualSize < 1
    ) {
      res.status(400).json({ error: "نوع الملف المرفوع غير مدعوم أو بياناته غير متطابقة" });
      return;
    }

    const replaceCurrent = input.document_type !== "custom";
    const saveDocument = db.transaction(() => {
      if (replaceCurrent) {
        const existing = db.prepare(`
          SELECT id, object_path FROM company_branch_documents
          WHERE branch_id=? AND document_type=?
        `).get(branchId, input.document_type) as { id: number; object_path: string } | undefined;

        if (existing) {
          db.prepare(`
            UPDATE company_branch_documents
            SET title=?, object_path=?, file_name=?, content_type=?, file_size=?, created_at=datetime('now')
            WHERE id=?
          `).run(title, input.object_path, fileName, actualContentType, actualSize, existing.id);
          // Keep the old private object: a stored SQLite backup may still reference its path.
          return { id: existing.id };
        }
      }

      const inserted = db.prepare(`
        INSERT INTO company_branch_documents
          (branch_id, document_type, title, object_path, file_name, content_type, file_size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(branchId, input.document_type, title, input.object_path, fileName, actualContentType, actualSize);
      return { id: Number(inserted.lastInsertRowid) };
    });

    const saved = saveDocument();
    const row = db.prepare(`
      SELECT id, branch_id, document_type, title, object_path, file_name, content_type, file_size, created_at
      FROM company_branch_documents WHERE id=?
    `).get(saved.id) as BranchDocumentRow;
    res.status(201).json(formatDocument(row));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "الملف المرفوع غير موجود" });
      return;
    }
    req.log.error({ err: error, branchId }, "Error saving company branch document");
    res.status(500).json({ error: "تعذر حفظ مرفق الفرع" });
  }
});

router.get("/company-settings/:id/documents/:documentId/file", async (req: Request, res: Response) => {
  if (!requireBranchAdmin(req, res)) return;
  const params = GetCompanyBranchDocumentFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "بيانات المرفق غير صحيحة" });
    return;
  }
  const row = db.prepare(`
    SELECT object_path, file_name, content_type
    FROM company_branch_documents
    WHERE id=? AND branch_id=?
  `).get(params.data.documentId, params.data.id) as {
    object_path: string;
    file_name: string;
    content_type: string;
  } | undefined;
  if (!row) {
    res.status(404).json({ error: "مرفق الفرع غير موجود" });
    return;
  }

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(row.object_path);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", row.content_type);
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "ملف المرفق غير موجود في التخزين" });
      return;
    }
    req.log.error({ err: error, branchId: params.data.id, documentId: params.data.documentId }, "Error downloading company branch document");
    res.status(500).json({ error: "تعذر تنزيل مرفق الفرع" });
  }
});

export default router;
