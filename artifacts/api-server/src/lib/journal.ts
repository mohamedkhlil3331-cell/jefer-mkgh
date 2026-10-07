/**
 * Journal Entries Helper — createJournalEntry()
 * Called by financial event handlers to write a double-entry record.
 *
 * IDEMPOTENCY: Automatic events (non-manual, non-reversal) use INSERT OR IGNORE
 * against a UNIQUE partial index on (reference_type, reference_id, debit_account, credit_account)
 * so duplicate calls for the same event are silently no-ops.
 *
 * ATOMICITY: Callers wrap { business-update + createJournalEntry } in a db.transaction().
 *
 * ERROR HANDLING: Manual/reversal throws on failure; automatic logs a warning.
 */
import db from "./db.js";

export interface JournalEntryPayload {
  reference_type: string;  // invoice | payment_cash | payment_bank | purchase_receive | job_inventory | job_external | settlement_create | settlement_pay | manual | reversal
  reference_id?: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  description?: string;
  created_by?: string;
  entry_date?: string;     // YYYY-MM-DD — defaults to today
}

const MANUAL_TYPES = new Set(["manual", "reversal"]);

export function createJournalEntry(p: JournalEntryPayload): number | bigint {
  if (!p.amount || p.amount <= 0) return 0;

  const isManual = MANUAL_TYPES.has(p.reference_type);

  // Automatic events: INSERT OR IGNORE (idempotent — duplicate fires for same event are no-ops)
  // Manual/reversal entries: plain INSERT (callers expect a real row; duplicates should error)
  const insertMode = isManual ? "INSERT" : "INSERT OR IGNORE";

  // All callers wrap { business-update + createJournalEntry } in db.transaction().
  // Throwing here causes the surrounding transaction to roll back, keeping
  // business state and accounting in sync for both automatic and manual types.
  const r = db.prepare(`
    ${insertMode} INTO journal_entries
      (entry_date, reference_type, reference_id, debit_account, credit_account, amount, description, created_by)
    VALUES (COALESCE(?,date('now')), ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.entry_date || null,
    p.reference_type,
    p.reference_id || null,
    p.debit_account,
    p.credit_account,
    p.amount,
    p.description || null,
    p.created_by || null,
  );
  return r.lastInsertRowid;
}
