/**
 * MKGH Monthly Report Scheduler
 * Fires on the configured day-of-month, generates an xlsx analysis report,
 * and emails it to the configured recipients.
 */
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import { execute, queryAll, queryOne } from "./erp-sql.js";
import { logger } from "./logger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function cfg(key: string): Promise<string> {
  try {
    return (await queryOne<{ value?: string }>("SELECT value FROM mkgh_email_settings WHERE key=?", key))?.value?.trim() ?? "";
  } catch { return ""; }
}

async function sysCfg(key: string): Promise<string> {
  try {
    return (await queryOne<{ value?: string }>("SELECT value FROM system_config WHERE key=?", key))?.value?.trim() ?? "";
  } catch { return ""; }
}

// ── Report builder (mirrors /mkgh/export logic) ───────────────────────────────
export async function buildMkghXlsx(): Promise<Buffer> {
  const [driverRows, vehicleRows, monthlyRows, matrixRows] = await Promise.all([
    queryAll<Record<string, unknown>>(`
    SELECT
      driver_name                                                             AS "السائق",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)               AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)          AS "المصاريف",
      COALESCE(SUM(net), 0)                                                  AS "صافي الربح",
      COUNT(*)                                                               AS "عدد الحركات",
      COUNT(DISTINCT cost_center)                                            AS "عدد السيارات"
    FROM mkgh_transactions
    WHERE driver_name IS NOT NULL AND driver_name != ''
    GROUP BY driver_name
    ORDER BY "صافي الربح" DESC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      cost_center                                                            AS "السيارة",
      MAX(activity)                                                          AS "النشاط",
      MAX(model)                                                             AS "الموديل",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS "المصاريف",
      COALESCE(SUM(net), 0)                                                 AS "صافي الربح",
      COUNT(*)                                                              AS "عدد الحركات",
      COUNT(DISTINCT driver_name)                                           AS "عدد السائقين",
      COUNT(CASE WHEN account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%' THEN 1 END) AS "أوامر الورشة"
    FROM mkgh_transactions
    WHERE cost_center IS NOT NULL AND cost_center != ''
    GROUP BY cost_center
    ORDER BY "صافي الربح" DESC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      printf('%d-%02d', year, month)                                        AS "الفترة",
      COALESCE(SUM(CASE WHEN net > 0 THEN net ELSE 0 END), 0)              AS "الإيرادات",
      COALESCE(SUM(CASE WHEN net < 0 THEN ABS(net) ELSE 0 END), 0)         AS "المصاريف",
      COALESCE(SUM(net), 0)                                                 AS "صافي الربح"
    FROM mkgh_transactions
    WHERE year IS NOT NULL AND month IS NOT NULL
    GROUP BY year, month
    ORDER BY year ASC, month ASC
    `),

    queryAll<Record<string, unknown>>(`
    SELECT
      driver_name                        AS "السائق",
      cost_center                        AS "السيارة",
      COUNT(*)                           AS "عدد أوامر الورشة",
      COALESCE(SUM(ABS(net)), 0)        AS "إجمالي التكلفة"
    FROM mkgh_transactions
    WHERE driver_name IS NOT NULL AND cost_center IS NOT NULL
      AND (account_name LIKE '%صيانه%' OR account_name LIKE '%صيانة%'
           OR account_name LIKE '%قطع غيار%' OR account_name LIKE '%كفرات%'
           OR account_name LIKE '%غيار زيت%')
    GROUP BY driver_name, cost_center
    ORDER BY "عدد أوامر الورشة" DESC
    `),
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(driverRows.length  ? driverRows  : [{}]), "تصنيف السائقين");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vehicleRows.length ? vehicleRows : [{}]), "تصنيف السيارات");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixRows.length  ? matrixRows  : [{}]), "مصفوفة السائق والسيارة");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows.length ? monthlyRows : [{}]), "الاتجاه الشهري");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Notify all admin users of a send failure ──────────────────────────────────
async function notifyAdmins(title: string, body: string): Promise<void> {
  try {
    const admins = await queryAll<{ phone: string }>(
      "SELECT phone FROM users WHERE role='admin' AND active=1"
    );
    await Promise.all(admins.map(({ phone }) => execute(
      "INSERT INTO notifications (user_phone, title, body, data) VALUES (?,?,?,?)",
      phone, title, body, JSON.stringify({ type: "mkgh_send_failure" }),
    )));
  } catch (err) {
    logger.warn({ err }, "[mkgh-scheduler] notifyAdmins failed — non-fatal");
  }
}

// ── Send fallback failure-alert email ─────────────────────────────────────────
async function sendFallbackAlert(
  gmailUser: string,
  gmailPass: string,
  fallbackEmail: string,
  periodLabel: string,
  reason: string
): Promise<void> {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"MKGH Reports" <${gmailUser}>`,
      to: fallbackEmail,
      subject: `⚠️ فشل إرسال تقرير MKGH — ${periodLabel}`,
      html: `
        <div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff5f5;padding:32px;border-radius:16px;">
          <div style="background:#b91c1c;border-radius:12px;padding:18px 24px;margin-bottom:20px;">
            <h2 style="color:white;margin:0;font-size:18px;">⚠️ فشل إرسال التقرير الشهري</h2>
          </div>
          <p style="color:#374151;font-size:15px;">فشل إرسال تقرير MKGH الشهري للفترة <strong>${periodLabel}</strong>.</p>
          <p style="color:#6b7280;font-size:13px;background:#fee2e2;padding:12px;border-radius:8px;direction:ltr;">${reason}</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">يُرجى مراجعة سجل الإرسال في لوحة الإعدادات وإعادة الإرسال يدوياً.</p>
        </div>
      `,
    });
    logger.info({ fallbackEmail, periodLabel }, "[mkgh-scheduler] Fallback alert sent");
  } catch (err) {
    logger.warn({ err }, "[mkgh-scheduler] Fallback alert email failed — non-fatal");
  }
}

// ── Send function ─────────────────────────────────────────────────────────────
export async function sendMkghReport(triggeredBy = "scheduler"): Promise<{ ok: boolean; error?: string }> {
  let recipients: string[];
  try { recipients = JSON.parse(await cfg("recipients") || "[]"); } catch { recipients = []; }

  const now         = new Date();
  const periodLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // ── Helper: fire notification + optional fallback alert then return error ────
  // Deduped per period_label: only one alert per month regardless of how many
  // hourly retries occur on the send day.
  async function fail(msg: string, gmailUser?: string, gmailPass?: string): Promise<{ ok: boolean; error: string }> {
    const alreadyNotified = await cfg("last_failure_notified") === periodLabel;
    if (!alreadyNotified) {
      await notifyAdmins("⚠️ فشل إرسال تقرير MKGH", `${periodLabel}: ${msg}`);
      const fallbackEmail = await cfg("fallback_email");
      if (fallbackEmail && gmailUser && gmailPass) {
        await sendFallbackAlert(gmailUser, gmailPass, fallbackEmail, periodLabel, msg);
      }
      try {
        await execute("UPDATE mkgh_email_settings SET value=? WHERE key='last_failure_notified'", periodLabel);
      } catch {}
    }
    return { ok: false, error: msg };
  }

  if (!recipients.length) {
    await execute(
      "INSERT INTO mkgh_report_log (period_label, recipients, status, error, triggered_by) VALUES (?,?,?,?,?)"
    , periodLabel, "", "error", "لا يوجد مستلمون", triggeredBy);
    return await fail("لا يوجد مستلمون");
  }

  const gmailUser = await sysCfg("gmail_user") || process.env.GMAIL_USER?.trim();
  const gmailPass = await sysCfg("gmail_pass") || process.env.GMAIL_APP_PASSWORD?.trim();

  if (!gmailUser || !gmailPass) {
    const msg = "بيانات Gmail غير مُعدَّة (gmail_user / gmail_pass)";
    await execute(
      "INSERT INTO mkgh_report_log (period_label, recipients, status, error, triggered_by) VALUES (?,?,?,?,?)"
    , periodLabel, recipients.join(", "), "error", msg, triggeredBy);
    // No Gmail creds → can't send fallback email; route through fail() for in-app dedup
    return await fail(msg);
  }

  const monthAr  = now.toLocaleString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" });
  const filename = `mkgh-report-${periodLabel}.xlsx`;

  let xlsxBuf: Buffer;
  try {
    xlsxBuf = await buildMkghXlsx();
  } catch (err) {
    const msg = `فشل توليد الملف: ${String(err)}`;
    await execute(
      "INSERT INTO mkgh_report_log (period_label, recipients, status, error, triggered_by) VALUES (?,?,?,?,?)"
    , periodLabel, recipients.join(", "), "error", msg, triggeredBy);
    return await fail(msg, gmailUser, gmailPass);
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"MKGH Reports" <${gmailUser}>`,
      to: recipients.join(", "),
      subject: `📊 تقرير MKGH الشهري — ${monthAr}`,
      html: `
        <div dir="rtl" style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#f8fafc;padding:32px;border-radius:16px;">
          <div style="background:#103c68;border-radius:12px;padding:18px 24px;margin-bottom:20px;">
            <h2 style="color:white;margin:0;font-size:18px;">MKGH — التقرير الشهري</h2>
          </div>
          <p style="color:#374151;font-size:15px;margin-bottom:4px;">مرفق التقرير الشهري لبيانات MKGH بصيغة Excel.</p>
          <p style="color:#6b7280;font-size:13px;">الفترة: <strong>${periodLabel}</strong></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px;">تم الإرسال تلقائياً بواسطة نظام MKGH</p>
        </div>
      `,
      attachments: [
        { filename, content: xlsxBuf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      ],
    });

    // Mark this month as sent and clear any previous failure notification state
    await execute("UPDATE mkgh_email_settings SET value=? WHERE key='last_sent'", periodLabel);
    await execute("UPDATE mkgh_email_settings SET value='' WHERE key='last_failure_notified'");
    await execute(
      "INSERT INTO mkgh_report_log (period_label, recipients, status, triggered_by) VALUES (?,?,?,?)"
    , periodLabel, recipients.join(", "), "ok", triggeredBy);

    logger.info({ recipients, periodLabel }, "[mkgh-scheduler] Monthly report sent");
    return { ok: true };
  } catch (err) {
    const msg = String(err);
    await execute(
      "INSERT INTO mkgh_report_log (period_label, recipients, status, error, triggered_by) VALUES (?,?,?,?,?)"
    , periodLabel, recipients.join(", "), "error", msg, triggeredBy);
    logger.warn({ err }, "[mkgh-scheduler] Failed to send monthly report");
    return await fail(msg, gmailUser, gmailPass);
  }
}

// ── Scheduler loop (runs every hour) ─────────────────────────────────────────
export async function runMkghSchedulerOnce(): Promise<void> {
  try {
    if (await cfg("enabled") !== "1") return;

    const sendDay  = parseInt(await cfg("send_day") || "1", 10);
    const lastSent = await cfg("last_sent"); // "YYYY-MM"
    const now      = new Date();
    const today    = now.getDate();
    const thisPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (today !== sendDay) return;
    if (lastSent === thisPeriod) return; // already sent this month

    const rowCount = (await queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM mkgh_transactions"))?.c || 0;
    if (rowCount === 0) {
      logger.info("[mkgh-scheduler] No data — skipping monthly send");
      return;
    }

    logger.info({ thisPeriod, sendDay }, "[mkgh-scheduler] Sending monthly report");
    await sendMkghReport("scheduler");
  } catch (err) {
    logger.warn({ err }, "[mkgh-scheduler] check() error — non-fatal");
  }
}

export function startMkghScheduler(): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  void runMkghSchedulerOnce();
  setInterval(() => { void runMkghSchedulerOnce(); }, CHECK_INTERVAL_MS);
  logger.info("[mkgh-scheduler] Started (hourly check)");
}
