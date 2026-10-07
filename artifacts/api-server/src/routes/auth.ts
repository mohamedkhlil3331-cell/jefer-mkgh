import { Router } from "express";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import db, { generateToken, checkpointWAL } from "../lib/db.js";
import { uploadDbBackup, getDefaultDbPath } from "../lib/db-sync.js";
import { acquireActorLock } from "../lib/session-control.js";
import { clearSpecialSession, isSpecialSessionValid, setSpecialSession } from "../lib/special-sessions.js";
import { generateRentalOtp, hashRentalPassword, RENTAL_CUSTOMER_ROLE, verifyRentalPassword } from "../lib/rental-customer-auth.js";
import { sendRentalOtpSms } from "../lib/rental-sms.js";

const router = Router();
const rentalPasswordOtps = new Map<number, { digest: string; expiresAt: number; attempts: number }>();
const rentalOtpRequestLimits = new Map<number, number>();
const RENTAL_OTP_TTL_MS = 5 * 60 * 1000;
const RENTAL_OTP_RESEND_MS = 60 * 1000;
const RENTAL_OTP_MAX_ATTEMPTS = 5;
const recoveryOtps = new Map<number, { digest: string; expiresAt: number; attempts: number }>();
const recoveryRequestLimits = new Map<string, number>();
const recoveryIpLimits = new Map<string, { count: number; expiresAt: number }>();

function recoveryPhone(raw: unknown): { stored: string[]; sms: string } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().replace(/[\s-]/g, "");
  let digits: string;
  if (/^05\d{8}$/.test(value)) digits = value.slice(1);
  else if (/^(?:\+?966)5\d{8}$/.test(value)) digits = value.replace(/^\+?966/, "");
  else if (/^\+[1-9]\d{7,14}$/.test(value)) return { stored: [value], sms: value };
  else return null;
  return { stored: [`0${digits}`, `966${digits}`, `+966${digits}`], sms: `+966${digits}` };
}

// Hot in-memory cache; the authoritative current token is also persisted so
// restarts cannot make an older administration session current again.
export const sysAdminTokens = new Set<string>();
const SYS_ADMIN_USER = { id: 0, name: "مدير النظام", phone: "mkgh", role: "admin", active: 1, approval_status: "approved", permissions: null };

export function isSysAdminToken(token: string): boolean {
  return sysAdminTokens.has(token) || isSpecialSessionValid("system-admin", token);
}

async function createSingleSession(userId: number | bigint, ipAddress: string | null) {
  const actorKey = `user:${userId}`;
  const release = await acquireActorLock(actorKey);
  try {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.transaction(() => {
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(userId);
      db.prepare("INSERT INTO sessions (token, user_id, expires_at, ip_address) VALUES (?,?,?,?)")
        .run(token, userId, expiresAt, ipAddress);
    })();
    return token;
  } finally {
    release();
  }
}

function requireUserAdmin(req: import("express").Request, res: import("express").Response): boolean {
  const authorization = req.headers.authorization?.trim() ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i);
  const token = bearer?.[1].trim();
  if (!token) {
    res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    return false;
  }
  if (isSysAdminToken(token)) return true;
  const admin = db.prepare(
    `SELECT u.id
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token=? AND datetime(s.expires_at) > datetime('now')
       AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
       AND u.active=1 AND u.role='admin'`
  ).get(token) as { id: number } | undefined;
  if (!admin) {
    res.status(403).json({ error: "صلاحيات المدير مطلوبة" });
    return false;
  }
  return true;
}

// ── OTP store for secret admin access ─────────────────────────────────────────
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

function getDbCfg(key: string): string {
  try {
    return (db.prepare("SELECT value FROM system_config WHERE key=?").get(key) as any)?.value?.trim() ?? "";
  } catch { return ""; }
}

async function sendOtpEmail(otp: string): Promise<void> {
  const gmailUser = getDbCfg("gmail_user") || process.env.GMAIL_USER?.trim();
  const gmailPass = getDbCfg("gmail_pass") || process.env.GMAIL_APP_PASSWORD?.trim();
  const toEmail   = getDbCfg("otp_email")  || "mohamedkhlil3331@gmail.com";

  if (!gmailUser || !gmailPass) {
    console.warn(`[OTP] No email credentials set. Admin OTP = ${otp} (valid 5 min)`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: `"MKGH System" <${gmailUser}>`,
    to: toEmail,
    subject: "🔐 رمز التحقق — MKGH Admin",
    html: `
      <div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:440px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
        <div style="background:#103c68;border-radius:12px;padding:18px 24px;margin-bottom:20px;">
          <h2 style="color:white;margin:0;font-size:18px;">MKGH — رمز الدخول السري</h2>
        </div>
        <p style="color:#374151;font-size:15px;margin-bottom:4px;">تم طلب دخول بصلاحيات مدير النظام.</p>
        <p style="color:#6b7280;font-size:13px;">استخدم الرمز أدناه للمتابعة:</p>
        <div style="background:white;border:2px solid #e5e7eb;border-radius:12px;padding:28px;text-align:center;margin:20px 0;">
          <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#103c68;font-family:monospace;">${otp}</span>
        </div>
        <p style="color:#9ca3af;font-size:12px;text-align:center;">صالح لمدة 5 دقائق — لا تشارك هذا الرمز مع أحد</p>
      </div>
    `,
  });
}

// ── Login ────────────────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return void res.status(400).json({ error: "رقم الجوال وكلمة المرور مطلوبان" });

  // ─── Hidden system-admin bypass (password only) ──────────────────────────
  const mkghPw = getDbCfg("mkgh_password") || "mkgh";
  if (phone === "mkgh" && password === mkghPw) {
    const release = await acquireActorLock("system-admin");
    try {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      sysAdminTokens.clear();
      sysAdminTokens.add(token);
      setSpecialSession("system-admin", token, expiresAt);
      return void res.json({ token, user: SYS_ADMIN_USER });
    } finally {
      release();
    }
  }

  // ─── Step 1: try vehicle / car-number login FIRST ───────────────────────────
  // Doing this before the phone lookup ensures numeric car numbers (like "1908")
  // never collide with regular phone accounts.
  const vehicleMatch = db.prepare("SELECT * FROM fleet_vehicles WHERE plate_number = ?").get(phone) as Record<string, unknown> | undefined;
  if (vehicleMatch) {
    const isNumericPlate = /^\d+$/.test(String(vehicleMatch.plate_number));
    const vehicleRole    = isNumericPlate ? "vehicle" : "driver";
    // Numeric plates: default password = plate number itself (e.g. 1908 → "1908"), customPw overrides
    const defaultPw      = isNumericPlate ? String(vehicleMatch.plate_number) : String(vehicleMatch.plate_number) + "mk";
    const customPw       = vehicleMatch.vehicle_password as string | null;
    const pwOk           = password === defaultPw || (!!customPw && password === customPw);

    if (pwOk) {
      // Find or create the linked user with the correct role
      let vUser = db.prepare("SELECT * FROM users WHERE vehicle_plate = ? AND role = ?")
        .get(String(vehicleMatch.plate_number), vehicleRole) as Record<string, unknown> | undefined;
      if (!vUser && !isNumericPlate) {
        vUser = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'driver'")
          .get(String(vehicleMatch.plate_number)) as Record<string, unknown> | undefined;
      }
      if (!vUser) {
        const usedPw = customPw || defaultPw || password;
        const r = db.prepare(
          "INSERT OR IGNORE INTO users (name,phone,password,role,active,approval_status,vehicle_plate) VALUES (?,?,?,?,1,'approved',?)"
        ).run(vehicleMatch.driver_name || vehicleMatch.plate_number, vehicleMatch.plate_number, usedPw, vehicleRole, vehicleMatch.plate_number);
        // Also update password for any existing user with same phone (numeric plate collision fix)
        db.prepare("UPDATE users SET role=?,vehicle_plate=?,password=? WHERE phone=? AND role!=?")
          .run(vehicleRole, vehicleMatch.plate_number, customPw || password, vehicleMatch.plate_number, "customer");
        vUser = db.prepare("SELECT * FROM users WHERE id=?").get(r.lastInsertRowid) as Record<string, unknown> | undefined
          ?? db.prepare("SELECT * FROM users WHERE vehicle_plate=? AND role=?").get(String(vehicleMatch.plate_number), vehicleRole) as Record<string, unknown> | undefined;
      } else if (!vUser.vehicle_plate) {
        db.prepare("UPDATE users SET vehicle_plate = ? WHERE id = ?").run(vehicleMatch.plate_number, vUser.id);
        vUser = { ...vUser, vehicle_plate: vehicleMatch.plate_number };
      }
      if (vUser) {
        const ip1 = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket?.remoteAddress ?? null;
        const token = await createSingleSession(vUser.id as number, ip1);
        uploadDbBackup(getDefaultDbPath(), checkpointWAL).catch(() => {});
        const { password: _pw, ...safeVUser } = vUser;
        return void res.json({ token, user: { ...safeVUser, vehicle_plate: vehicleMatch.plate_number, vehicle_id: vehicleMatch.id } });
      }
    }
    // If password didn't match for a numeric plate, return specific error
    if (isNumericPlate) {
      return void res.status(401).json({ error: "كلمة مرور السيارة غير صحيحة" });
    }
  }

  // ─── Step 2: regular phone + password login ──────────────────────────────────
  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone) as Record<string, unknown> | undefined;
  let vehicleInfo: Record<string, unknown> | undefined;

  // Also try looking up by vehicle_plate for non-numeric plate drivers
  if (!user) {
    const driverByPlate = db.prepare("SELECT * FROM users WHERE vehicle_plate = ? AND role = 'driver'").get(phone) as Record<string, unknown> | undefined;
    if (driverByPlate) {
      user = driverByPlate;
      vehicleInfo = vehicleMatch;
    }
  }

  if (!user) return void res.status(401).json({ error: "رقم الجوال أو رقم اللوحة غير مسجل" });

  // Legacy accounts keep their existing plaintext passwords. Accounts with a
  // scrypt password must continue to work even if an admin changes their role.
  const passwordMatches = verifyRentalPassword(String(password), String(user.password ?? ""));
  if (!passwordMatches) return void res.status(401).json({ error: "كلمة المرور غير صحيحة" });

  // Check approval for non-customer roles
  if (user.approval_status === "pending")
    return void res.status(403).json({ error: "الحساب قيد المراجعة، يرجى انتظار موافقة المدير", code: "pending_approval" });
  if (user.approval_status === "rejected")
    return void res.status(403).json({ error: "تم رفض طلب التسجيل. تواصل مع الإدارة", code: "rejected" });
  if (!user.active)
    return void res.status(403).json({ error: "تم تقييد حسابك، يرجى مراجعة الإدارة" });

  const ip2 = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket?.remoteAddress ?? null;
  const token = await createSingleSession(user.id as number, ip2);
  uploadDbBackup(getDefaultDbPath(), checkpointWAL).catch(() => {});

  const { password: _pw, ...safeUser } = user;
  const extra = vehicleInfo ? { vehicle_plate: vehicleInfo.plate_number, vehicle_id: vehicleInfo.id } :
    user.vehicle_plate ? { vehicle_plate: user.vehicle_plate } : {};
  const parsedPerms = safeUser.permissions
    ? (() => { try { return JSON.parse(safeUser.permissions as string); } catch { return null; } })()
    : null;
  res.json({ token, user: { ...safeUser, permissions: parsedPerms, ...extra } });
});

// ── Register ─────────────────────────────────────────────────────────────────
router.post("/auth/register", async (req, res) => {
  const { name, phone, password, company_name, vat_number, role, register_note, rep_phone } = req.body;
  if (!name || !phone || !password) return void res.status(400).json({ error: "الاسم والجوال وكلمة المرور مطلوبة" });
  if (role === RENTAL_CUSTOMER_ROLE) return void res.status(403).json({ error: "إنشاء حساب عميل الإيجار يتم عن طريق الإدارة فقط" });
  if (phone.length < 10) return void res.status(400).json({ error: "رقم الجوال غير صحيح" });

  const isStaff = role && role !== "customer";
  const approvalStatus = isStaff ? "pending" : "approved";
  const active = isStaff ? 0 : 1;
  const finalRole = role || "customer";

  try {
    const result = db.prepare(
      "INSERT INTO users (name,phone,password,role,company_name,vat_number,active,approval_status,register_note) VALUES (?,?,?,?,?,?,?,?,?)"
    ).run(name, phone, password, finalRole, company_name || null, vat_number || null, active, approvalStatus, register_note || null);

    // If a rep_phone is supplied during customer registration, create a pending link
    if (rep_phone && finalRole === "customer") {
      const repUser = db.prepare("SELECT id FROM users WHERE phone=? AND role='rep'").get(rep_phone);
      if (repUser) {
        try {
          db.prepare(
            "INSERT OR IGNORE INTO client_rep_links (customer_phone,rep_phone,link_status) VALUES (?,?,'pending_rep_approval')"
          ).run(phone, rep_phone);
          db.prepare("INSERT INTO notifications (user_phone,title,body) VALUES (?,?,?)").run(
            rep_phone, "طلب ارتباط عميل جديد", `يطلب ${name} الانضمام لقائمة عملائك`
          );
        } catch { /* ignore dup */ }
      }
    }

    if (!isStaff) {
      const ip3 = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket?.remoteAddress ?? null;
      const token = await createSingleSession(result.lastInsertRowid, ip3);
      uploadDbBackup(getDefaultDbPath(), checkpointWAL).catch(() => {});
      const newUser = db.prepare("SELECT id,name,phone,role,company_name,vat_number FROM users WHERE id=?").get(result.lastInsertRowid);
      return void res.status(201).json({ id: result.lastInsertRowid, token, user: newUser, message: "تم إنشاء الحساب بنجاح" });
    }

    res.status(201).json({ id: result.lastInsertRowid, pending: true, message: "تم التسجيل، يرجى انتظار موافقة المدير" });
  } catch {
    res.status(409).json({ error: "رقم الجوال مسجل مسبقاً" });
  }
});

function getAuthenticatedRentalUser(req: import("express").Request) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === "guest") return undefined;
  return db.prepare(`
    SELECT u.id,u.phone,u.role,u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
  `).get(token) as { id: number; phone: string; role: string; active: number } | undefined;
}

router.post("/auth/rental-password/request-otp", async (req, res) => {
  const user = getAuthenticatedRentalUser(req);
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (user.role !== RENTAL_CUSTOMER_ROLE || !user.active) return void res.status(403).json({ error: "هذه الخدمة متاحة لحسابات عملاء الإيجار فقط" });
  const now = Date.now();
  const nextRequestAt = rentalOtpRequestLimits.get(user.id) || 0;
  if (nextRequestAt > now) {
    return void res.status(429).json({ error: "انتظر دقيقة قبل طلب رمز جديد" });
  }
  rentalOtpRequestLimits.set(user.id, now + RENTAL_OTP_RESEND_MS);
  const otp = generateRentalOtp();
  rentalPasswordOtps.set(user.id, {
    digest: crypto.createHash("sha256").update(otp).digest("hex"),
    expiresAt: now + RENTAL_OTP_TTL_MS,
    attempts: 0,
  });
  try {
    await sendRentalOtpSms(user.phone, otp);
    res.json({ message: "تم إرسال رمز التحقق إلى رقم الجوال المسجل", expires_in: RENTAL_OTP_TTL_MS / 1000 });
  } catch (error) {
    rentalPasswordOtps.delete(user.id);
    res.status(502).json({ error: error instanceof Error ? error.message : "تعذر إرسال رمز التحقق عبر Twilio. لم يتم إرسال الرمز." });
  }
});

router.post("/auth/rental-password/verify-otp", (req, res) => {
  const user = getAuthenticatedRentalUser(req);
  if (!user) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
  if (user.role !== RENTAL_CUSTOMER_ROLE || !user.active) return void res.status(403).json({ error: "هذه الخدمة متاحة لحسابات عملاء الإيجار فقط" });
  const code = String(req.body.otp ?? "").trim();
  const newPassword = String(req.body.new_password ?? "");
  if (!/^\d{6}$/.test(code)) return void res.status(400).json({ error: "رمز التحقق غير صحيح" });
  if (newPassword.length < 4) return void res.status(400).json({ error: "كلمة المرور الجديدة قصيرة جداً (4 أحرف على الأقل)" });

  const challenge = rentalPasswordOtps.get(user.id);
  const now = Date.now();
  if (!challenge || challenge.expiresAt <= now) {
    rentalPasswordOtps.delete(user.id);
    return void res.status(400).json({ error: "رمز التحقق منتهي أو غير موجود، اطلب رمزاً جديداً" });
  }
  const suppliedDigest = crypto.createHash("sha256").update(code).digest();
  const expectedDigest = Buffer.from(challenge.digest, "hex");
  if (suppliedDigest.length !== expectedDigest.length || !crypto.timingSafeEqual(suppliedDigest, expectedDigest)) {
    challenge.attempts++;
    if (challenge.attempts >= RENTAL_OTP_MAX_ATTEMPTS) rentalPasswordOtps.delete(user.id);
    return void res.status(400).json({ error: challenge.attempts >= RENTAL_OTP_MAX_ATTEMPTS
      ? "تم تجاوز عدد المحاولات، اطلب رمزاً جديداً"
      : "رمز التحقق غير صحيح" });
  }
  db.prepare("UPDATE users SET password=? WHERE id=? AND role=?")
    .run(hashRentalPassword(newPassword), user.id, RENTAL_CUSTOMER_ROLE);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  rentalPasswordOtps.delete(user.id);
  res.json({ message: "تم تغيير كلمة المرور بنجاح، سجّل الدخول من جديد" });
});

// Recovery is available without a session for accounts with an SMS-capable registered mobile.
router.post("/auth/forgot-password/request-otp", async (req, res) => {
  const phone = recoveryPhone(req.body?.phone);
  if (!phone) return void res.status(400).json({ error: "أدخل رقم الجوال المسجّل بصيغة صحيحة" });
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ipLimit = recoveryIpLimits.get(ip);
  if (ipLimit && ipLimit.expiresAt > now && ipLimit.count >= 10)
    return void res.status(429).json({ error: "طلبات كثيرة، حاول بعد قليل" });
  recoveryIpLimits.set(ip, {
    count: ipLimit && ipLimit.expiresAt > now ? ipLimit.count + 1 : 1,
    expiresAt: ipLimit && ipLimit.expiresAt > now ? ipLimit.expiresAt : now + 10 * 60 * 1000,
  });
  if ((recoveryRequestLimits.get(phone.sms) || 0) > now)
    return void res.status(429).json({ error: "انتظر دقيقة قبل طلب رمز جديد" });
  recoveryRequestLimits.set(phone.sms, now + RENTAL_OTP_RESEND_MS);

  const placeholders = phone.stored.map(() => "?").join(",");
  const users = db.prepare(`SELECT id,active FROM users WHERE phone IN (${placeholders})`).all(...phone.stored) as
    { id: number; active: number }[];
  // An unrecognized or ambiguous number must never reveal which accounts exist.
  if (users.length !== 1 || !users[0].active) return void res.json({ message: "إذا كان الرقم مسجّلًا، سيصلك رمز التحقق" });

  const otp = generateRentalOtp();
  recoveryOtps.set(users[0].id, {
    digest: crypto.createHash("sha256").update(otp).digest("hex"),
    expiresAt: now + RENTAL_OTP_TTL_MS,
    attempts: 0,
  });
  try {
    await sendRentalOtpSms(phone.sms, otp, "recovery");
    res.json({ message: "إذا كان الرقم مسجّلًا، سيصلك رمز التحقق" });
  } catch (error) {
    recoveryOtps.delete(users[0].id);
    recoveryRequestLimits.delete(phone.sms);
    const message = error instanceof Error ? error.message : "";
    res.status(502).json({ error:
      /^(تعذر إرسال رمز التحقق عبر Twilio|تعذر إرسال الرمز:|تعذر قراءة أرقام Twilio|لا يوجد رقم Twilio)/.test(message)
        ? message : "تعذر إرسال الرسالة الآن. حاول لاحقًا" });
  }
});

router.post("/auth/forgot-password/reset", (req, res) => {
  const phone = recoveryPhone(req.body?.phone);
  const code = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";
  const newPassword = req.body?.new_password;
  if (!phone || !/^\d{6}$/.test(code))
    return void res.status(400).json({ error: "رقم الجوال أو رمز التحقق غير صحيح" });
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return void res.status(400).json({ error: "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف" });
  const placeholders = phone.stored.map(() => "?").join(",");
  const users = db.prepare(`SELECT id,phone,role,password,vehicle_plate,active FROM users WHERE phone IN (${placeholders})`).all(...phone.stored) as
    { id: number; phone: string; role: string; password: string; vehicle_plate: string | null; active: number }[];
  if (users.length !== 1 || !users[0].active)
    return void res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });
  const user = users[0];
  const challenge = recoveryOtps.get(user.id);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    recoveryOtps.delete(user.id);
    return void res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });
  }
  const supplied = crypto.createHash("sha256").update(code).digest();
  const expected = Buffer.from(challenge.digest, "hex");
  if (!crypto.timingSafeEqual(supplied, expected)) {
    challenge.attempts++;
    if (challenge.attempts >= RENTAL_OTP_MAX_ATTEMPTS) recoveryOtps.delete(user.id);
    return void res.status(400).json({ error: "الرمز غير صحيح أو انتهت صلاحيته" });
  }
  db.transaction(() => {
    const storedPassword = user.role === RENTAL_CUSTOMER_ROLE || user.password.startsWith("scrypt$")
      ? hashRentalPassword(newPassword) : newPassword;
    db.prepare("UPDATE users SET password=? WHERE id=?").run(storedPassword, user.id);
    if (user.vehicle_plate) {
      db.prepare("UPDATE fleet_vehicles SET vehicle_password=? WHERE plate_number=?").run(newPassword, user.vehicle_plate);
    }
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
  })();
  recoveryOtps.delete(user.id);
  res.json({ message: "تم تعيين كلمة مرور جديدة. يمكنك تسجيل الدخول الآن", phone: user.phone });
});

// ── Guest token ───────────────────────────────────────────────────────────────
router.post("/auth/guest", (_req, res) => {
  res.json({
    token: "guest",
    user: { id: 0, name: "زائر", phone: "guest", role: "customer", isGuest: true },
  });
});

// ── Logout ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token && isSysAdminToken(token)) {
    sysAdminTokens.delete(token);
    clearSpecialSession("system-admin", token);
    return void res.json({ message: "تم تسجيل الخروج" });
  }
  if (token && token !== "guest") db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ message: "تم تسجيل الخروج" });
});

// ── Logout from every device ──────────────────────────────────────────────────
router.post("/auth/logout-all", (req, res) => {
  const authorization = req.headers.authorization?.trim();
  if (!authorization) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });

  if (authorization.startsWith("DevAuth ")) {
    const token = authorization.slice(8).trim();
    if (!isSpecialSessionValid("developer-admin", token)) return void res.status(401).json({ error: "الجلسة منتهية" });
    clearSpecialSession("developer-admin", token);
    return void res.json({ message: "تم تسجيل الخروج من جميع الأجهزة" });
  }

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (isSysAdminToken(token)) {
    sysAdminTokens.delete(token);
    clearSpecialSession("system-admin", token);
    return void res.json({ message: "تم تسجيل الخروج من جميع الأجهزة" });
  }

  const session = db.prepare(`
    SELECT s.user_id
    FROM sessions s
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
  `).get(token) as { user_id: number } | undefined;
  if (!session) return void res.status(401).json({ error: "الجلسة منتهية" });

  db.prepare("DELETE FROM sessions WHERE user_id=?").run(session.user_id);
  res.json({ message: "تم تسجيل الخروج من جميع الأجهزة" });
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.vary("Authorization");
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token || token === "guest") return void res.status(401).json({ error: "غير مصرح" });

  // Hidden system-admin (in-memory, no DB)
  if (isSysAdminToken(token)) return void res.json(SYS_ADMIN_USER);

  const session = db.prepare(`
    SELECT * FROM sessions s
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
  `).get(token) as Record<string, unknown> | undefined;
  if (!session) return void res.status(401).json({ error: "الجلسة منتهية" });

  const user = db.prepare(
    "SELECT id,name,phone,role,email,company_name,vat_number,cr_number,vehicle_plate,permissions,created_at FROM users WHERE id = ?"
  ).get(session.user_id) as Record<string, unknown> | undefined;
  if (!user) return void res.status(401).json({ error: "المستخدم غير موجود" });

  const parsedPerms = user.permissions
    ? (() => { try { return JSON.parse(user.permissions as string); } catch { return null; } })()
    : null;

  let extra: Record<string, unknown> = {};
  if (user.vehicle_plate) {
    const v = db.prepare("SELECT id FROM fleet_vehicles WHERE plate_number = ?").get(user.vehicle_plate) as Record<string, unknown> | undefined;
    if (v) extra.vehicle_id = v.id;
  }

  res.json({ ...user, permissions: parsedPerms, ...extra });
});

// ── Change Password (unified handler) ─────────────────────────────────────────
router.put("/auth/change-password", (req, res) => {
  const { user_id, old_password, new_password, target_user_id, vehicle_plate, phone, current_password } = req.body;
  const authorization = req.headers.authorization?.trim() ?? "";
  const authToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1].trim();
  let authenticatedCaller: { role: string } | undefined;
  if (authToken) {
    if (isSysAdminToken(authToken)) {
      authenticatedCaller = { role: "admin" };
    } else {
      authenticatedCaller = db.prepare(`SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
          AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
          AND u.active=1`)
        .get(authToken) as { role: string } | undefined;
    }
    if (authenticatedCaller?.role === RENTAL_CUSTOMER_ROLE)
      return void res.status(403).json({ error: "استخدم التحقق عبر رمز الجوال لتغيير كلمة المرور" });
  }

  const newPw = new_password;
  if (!newPw || String(newPw).length < 4)
    return void res.status(400).json({ error: "كلمة المرور الجديدة قصيرة جداً (4 أحرف على الأقل)" });

  // ── Case 1: Admin or supervisor changing another user's password ───────────
  if (target_user_id || vehicle_plate) {
    if (!authenticatedCaller) return void res.status(401).json({ error: "تسجيل الدخول مطلوب" });
    if (authenticatedCaller.role !== "admin" && authenticatedCaller.role !== "supervisor")
      return void res.status(403).json({ error: "صلاحيات المدير أو المشرف مطلوبة" });
    let target: Record<string, unknown> | undefined;
    if (target_user_id) {
      target = db.prepare("SELECT * FROM users WHERE id = ?").get(target_user_id) as typeof target;
    } else if (vehicle_plate) {
      target = db.prepare("SELECT * FROM users WHERE vehicle_plate = ? AND role = 'driver'").get(vehicle_plate) as typeof target;
      if (!target) target = db.prepare("SELECT * FROM users WHERE phone = ? AND role = 'driver'").get(vehicle_plate) as typeof target;
    }
    if (!target) {
      if (vehicle_plate) {
        db.prepare("UPDATE fleet_vehicles SET vehicle_password = ? WHERE plate_number = ?").run(newPw, vehicle_plate);
        return void res.json({ message: "تم تحديث باسورد السيارة (السائق لم يسجّل دخوله بعد)" });
      }
      return void res.status(404).json({ error: "المستخدم غير موجود" });
    }
    if (target.role === RENTAL_CUSTOMER_ROLE)
      return void res.status(403).json({ error: "تغيير كلمة مرور حساب الإيجار يتطلب رمز التحقق المرسل إلى جوالك" });
    db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newPw, target.id);
    const plate = target.vehicle_plate || vehicle_plate;
    if (plate) db.prepare("UPDATE fleet_vehicles SET vehicle_password = ? WHERE plate_number = ?").run(newPw, plate);
    return void res.json({ message: "تم تغيير كلمة المرور" });
  }

  // ── Case 2: User changing own password by phone + current_password ─────────
  if (phone && current_password) {
    const u = db.prepare("SELECT id, password, vehicle_plate,role FROM users WHERE phone=?").get(phone) as Record<string, unknown> | undefined;
    if (!u) return void res.status(404).json({ error: "المستخدم غير موجود" });
    if (u.role === RENTAL_CUSTOMER_ROLE)
      return void res.status(403).json({ error: "تغيير كلمة مرور حساب الإيجار يتطلب رمز التحقق المرسل إلى جوالك" });
    if (u.password !== current_password)
      return void res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    db.prepare("UPDATE users SET password=? WHERE id=?").run(newPw, u.id);
    if (u.vehicle_plate)
      db.prepare("UPDATE fleet_vehicles SET vehicle_password=? WHERE plate_number=?").run(newPw, u.vehicle_plate);
    return void res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  }

  // ── Case 3: User changing own password by user_id + old_password ───────────
  if (!user_id || !old_password)
    return void res.status(400).json({ error: "كلمة المرور الحالية مطلوبة" });
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(user_id) as Record<string, unknown> | undefined;
  if (!target) return void res.status(404).json({ error: "المستخدم غير موجود" });
  if (target.role === RENTAL_CUSTOMER_ROLE)
    return void res.status(403).json({ error: "تغيير كلمة مرور حساب الإيجار يتطلب رمز التحقق المرسل إلى جوالك" });
  if (target.password !== old_password)
    return void res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(newPw, user_id);
  if (target.vehicle_plate)
    db.prepare("UPDATE fleet_vehicles SET vehicle_password = ? WHERE plate_number = ?").run(newPw, target.vehicle_plate);
  res.json({ message: "تم تغيير كلمة المرور بنجاح" });
});

// ── Customer self-service profile update ─────────────────────────────────────
router.put("/auth/update-profile", (req, res) => {
  const { phone, name, email, address, city, company_name, vat_number, cr_number } = req.body;
  if (!phone) return void res.status(400).json({ error: "الجوال مطلوب" });
  const u = db.prepare("SELECT id,role FROM users WHERE phone = ?").get(phone) as { id: number; role: string } | undefined;
  if (!u) return void res.status(404).json({ error: "المستخدم غير موجود" });
  if (u.role === RENTAL_CUSTOMER_ROLE) {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1].trim();
    const session = token && db.prepare(`
      SELECT s.user_id FROM sessions s JOIN users current_user ON current_user.id=s.user_id
      WHERE s.token=? AND s.user_id=? AND datetime(s.expires_at)>datetime('now')
        AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
        AND current_user.active=1 AND current_user.role=?
    `).get(token, u.id, RENTAL_CUSTOMER_ROLE);
    if (!session) return void res.status(403).json({ error: "تسجيل الدخول بحساب عميل الإيجار مطلوب لتحديث الملف" });
  }
  db.prepare(`UPDATE users SET name=COALESCE(?,name), email=COALESCE(?,email),
    address=?, city=?, company_name=?, vat_number=?, cr_number=? WHERE id=?`)
    .run(name||null, email||null, address||null, city||null,
         company_name||null, vat_number||null, cr_number||null, u.id);
  const updated = db.prepare("SELECT id,name,phone,role,email,company_name,vat_number,cr_number,address,city FROM users WHERE id=?").get(u.id);
  res.json({ message: "تم تحديث البيانات", user: updated });
});


// ── Get current user profile ──────────────────────────────────────────────────
router.get("/auth/me", (req, res) => {
  const auth = req.headers.authorization?.replace("Bearer ","") || req.query.token as string;
  if (!auth) return void res.status(401).json({ error: "غير مصرح" });
  if (isSysAdminToken(auth)) return void res.json(SYS_ADMIN_USER);
  const session = db.prepare(`
    SELECT user_id FROM sessions s
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND s.rowid=(SELECT MAX(current.rowid) FROM sessions current WHERE current.user_id=s.user_id)
  `).get(auth) as { user_id:number }|undefined;
  if (!session) return void res.status(401).json({ error: "جلسة منتهية" });
  const u = db.prepare("SELECT id,name,phone,role,email,company_name,vat_number,cr_number,address,city,active FROM users WHERE id=?").get(session.user_id);
  res.json(u || {});
});

// ── Users CRUD ────────────────────────────────────────────────────────────────
router.get("/users", (req, res) => {
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  if (role !== "rep" && !requireUserAdmin(req, res)) return;
  if (role === "rep") {
    return void res.json(db.prepare("SELECT id,name,phone FROM users WHERE role='rep' ORDER BY name").all());
  }
  let sql = "SELECT id,name,phone,role,active,approval_status,company_name,vat_number,email,cr_number,vehicle_plate,permissions,created_at FROM users WHERE 1=1";
  const params: string[] = [];
  if (role) { sql += " AND role = ?"; params.push(role); }
  sql += " ORDER BY name";
  res.json(db.prepare(sql).all(...params));
});

router.get("/users/:id/password", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  const user = db.prepare("SELECT password FROM users WHERE id=?").get(req.params.id) as { password: string } | undefined;
  if (!user) return void res.status(404).json({ error: "المستخدم غير موجود" });
  if (user.password?.startsWith("scrypt$")) {
    return void res.json({ recoverable: false, password: null });
  }
  res.json({ recoverable: true, password: user.password });
});

router.post("/users", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  const { name, phone, password, role, email, company_name, vat_number, cr_number, vehicle_plate, permissions } = req.body;
  const permsJson = Array.isArray(permissions) ? JSON.stringify(permissions) : null;
  try {
    const result = db.prepare(
      "INSERT INTO users (name,phone,password,role,email,company_name,vat_number,cr_number,vehicle_plate,approval_status,permissions) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    ).run(name, phone, role === RENTAL_CUSTOMER_ROLE ? hashRentalPassword(String(password || "123456")) : password || "123456", role || "customer", email || null, company_name || null, vat_number || null, cr_number || null, vehicle_plate || null, "approved", permsJson);
    res.status(201).json({ id: result.lastInsertRowid, message: "تم إضافة المستخدم" });
  } catch {
    res.status(409).json({ error: "رقم الجوال مسجل مسبقاً" });
  }
});

// ── Swap login credentials between two existing accounts ─────────────────────
router.post("/users/swap-login", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  const { source_user_id, target_user_id } = req.body as {
    source_user_id?: number; target_user_id?: number;
  };
  const sourceId = Number(source_user_id);
  const targetId = Number(target_user_id);
  if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId === targetId) {
    return void res.status(400).json({ error: "اختر مستخدمين مختلفين للتبديل" });
  }

  const swap = db.transaction(() => {
    const source = db.prepare("SELECT id, phone, password FROM users WHERE id=?").get(sourceId) as
      { id: number; phone: string; password: string } | undefined;
    const target = db.prepare("SELECT id, phone, password FROM users WHERE id=?").get(targetId) as
      { id: number; phone: string; password: string } | undefined;
    if (!source || !target) return null;

    // phone is unique, so temporarily free the first value before exchanging it.
    const temporaryPhone = `__swap_${source.id}_${Date.now()}`;
    db.prepare("UPDATE users SET phone=? WHERE id=?").run(temporaryPhone, source.id);
    db.prepare("UPDATE users SET phone=?, password=? WHERE id=?")
      .run(source.phone, source.password, target.id);
    db.prepare("UPDATE users SET phone=?, password=? WHERE id=?")
      .run(target.phone, target.password, source.id);
    db.prepare("DELETE FROM sessions WHERE user_id IN (?,?)").run(source.id, target.id);
    return { source_phone: source.phone, target_phone: target.phone };
  })();

  if (!swap) return void res.status(404).json({ error: "أحد المستخدمين غير موجود" });
  res.json({ message: "تم تبديل بيانات الدخول وتسجيل خروج الحسابين" });
});

router.put("/users/:id", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  const { name, phone, password, role, email, company_name, vat_number, cr_number, active, vehicle_plate, permissions } = req.body;
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as Record<string, unknown> | undefined;
  if (!current) return void res.status(404).json({ error: "المستخدم غير موجود" });
  const permsJson = Array.isArray(permissions) ? JSON.stringify(permissions)
                  : permissions === null        ? null
                  : current.permissions as string | null;
  const pick = <T>(incoming: T | undefined, fallback: T) =>
    incoming !== undefined ? incoming : fallback;
  db.prepare(
    "UPDATE users SET name=?,phone=?,password=?,role=?,email=?,company_name=?,vat_number=?,cr_number=?,active=?,vehicle_plate=?,permissions=? WHERE id=?"
  ).run(
    pick(name,          current.name),
    pick(phone,         current.phone),
    password ? (pick(role, current.role) === RENTAL_CUSTOMER_ROLE ? hashRentalPassword(String(password)) : password) : current.password,
    pick(role,          current.role),
    pick(email,         current.email),
    pick(company_name,  current.company_name),
    pick(vat_number,    current.vat_number),
    pick(cr_number,     current.cr_number),
    active !== undefined ? active : current.active,
    pick(vehicle_plate, current.vehicle_plate),
    permsJson,
    req.params.id,
  );
  if (password) db.prepare("DELETE FROM sessions WHERE user_id=?").run(req.params.id);
  res.json({ message: "تم التحديث" });
});

router.delete("/users/:id", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.params.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ message: "تم الحذف" });
});

// ── Admin: Approvals Management ────────────────────────────────────────────────
router.get("/admin/pending-approvals", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  const rows = db.prepare(
    "SELECT id,name,phone,role,company_name,register_note,approval_status,created_at FROM users WHERE approval_status='pending' ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

router.put("/admin/users/:id/approve", (req, res) => {
  if (!requireUserAdmin(req, res)) return;
  const { approved, note } = req.body;
  const status = approved ? "approved" : "rejected";
  const active = approved ? 1 : 0;
  db.prepare("UPDATE users SET approval_status=?,active=? WHERE id=?").run(status, active, req.params.id);
  if (note) db.prepare("UPDATE users SET register_note=? WHERE id=?").run(note, req.params.id);
  res.json({ message: approved ? "تم قبول المستخدم" : "تم رفض المستخدم" });
});

// ── OTP endpoints (used by PasswordModal for mkgh-guarded actions) ─────────────
router.post("/auth/otp/request", async (_req, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set("mkgh_otp", { otp, expiresAt: Date.now() + 5 * 60 * 1000 });
  try { await sendOtpEmail(otp); } catch (e) { console.error("[OTP] Email failed:", e); }
  res.json({ ok: true });
});

router.post("/auth/otp/verify", (req, res) => {
  const { otp } = req.body as { otp?: string };
  if (!otp) return void res.status(400).json({ error: "الرمز مطلوب" });
  const stored = otpStore.get("mkgh_otp");
  if (!stored || Date.now() > stored.expiresAt)
    return void res.status(400).json({ error: "انتهت صلاحية الرمز، اطلب رمزاً جديداً" });
  if (otp !== stored.otp)
    return void res.status(400).json({ error: "الرمز غير صحيح" });
  otpStore.delete("mkgh_otp");
  res.json({ ok: true });
});

export default router;
