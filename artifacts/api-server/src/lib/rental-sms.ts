import { ReplitConnectors } from "@replit/connectors-sdk";
import db from "./db.js";

function setting(key: string): string {
  try {
    const row = db.prepare("SELECT value FROM system_config WHERE key=?").get(key) as { value?: string } | undefined;
    return row?.value?.trim() || "";
  } catch {
    return "";
  }
}

function providerError(status: number): Error {
  if (status === 401 || status === 403)
    return new Error("تعذر إرسال الرمز: بيانات اتصال Twilio غير صالحة أو لا تملك صلاحية الإرسال. يلزم تحديث اتصال Twilio.");
  return new Error(`تعذر إرسال رمز التحقق عبر Twilio (HTTP ${status}). لم يتم إرسال الرمز.`);
}

export async function sendRentalOtpSms(to: string, otp: string, purpose: "rental" | "recovery" = "rental"): Promise<void> {
  const connector = new ReplitConnectors();
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() || "";
  let sid = accountSid;
  if (!sid) {
    const accountsResponse = await connector.proxy("twilio", "/2010-04-01/Accounts.json");
    if (!accountsResponse.ok) throw providerError(accountsResponse.status);
    const payload = await accountsResponse.json() as { accounts?: Array<{ sid?: string }> };
    sid = payload.accounts?.[0]?.sid || "";
    if (!sid) throw new Error("تعذر إرسال رمز التحقق عبر Twilio: لم يتم العثور على حساب إرسال صالح.");
  }
  let from = setting("twilio_from_number") || process.env.TWILIO_FROM_NUMBER?.trim() || "";
  if (!from) {
    const numbersResponse = await connector.proxy(
      "twilio",
      `/2010-04-01/Accounts/${encodeURIComponent(sid)}/IncomingPhoneNumbers.json`,
    );
    if (!numbersResponse.ok) throw providerError(numbersResponse.status);
    let numbersPayload: {
      incoming_phone_numbers?: Array<{
        phone_number?: string;
        capabilities?: { sms?: boolean };
      }>;
    };
    try {
      numbersPayload = await numbersResponse.json() as typeof numbersPayload;
    } catch {
      throw new Error("تعذر قراءة أرقام Twilio المتاحة لإرسال الرسائل. لم يتم إرسال الرمز.");
    }
    from = numbersPayload.incoming_phone_numbers?.find(number =>
      number.capabilities?.sms === true && typeof number.phone_number === "string" && !!number.phone_number.trim()
    )?.phone_number?.trim() || "";
    if (!from) throw new Error("لا يوجد رقم Twilio مفعّل للرسائل النصية في هذا الحساب. لم يتم إرسال الرمز.");
  }

  const body = new URLSearchParams({
    To: to,
    From: from,
    Body: `${purpose === "recovery" ? "رمز استعادة كلمة المرور" : "رمز التحقق لتغيير كلمة مرور حساب الإيجار"}: ${otp}`,
  });
  const response = await connector.proxy("twilio", `/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw providerError(response.status);
}
