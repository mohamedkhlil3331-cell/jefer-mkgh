import crypto from "node:crypto";

export const RENTAL_CUSTOMER_ROLE = "rental_trip_customer";

export function hashRentalPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyRentalPassword(password: string, stored: string): boolean {
  if (!stored.startsWith("scrypt$")) return password === stored;
  const [, salt, expected] = stored.split("$");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const actualBytes = Buffer.from(actual, "hex");
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}

export function generateRentalOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}
