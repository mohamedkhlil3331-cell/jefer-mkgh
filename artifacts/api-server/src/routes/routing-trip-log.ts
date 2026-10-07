import db from "../lib/db.js";
// Ensure the existing trips.client_request_id column and unique index are initialized
// even when this helper is loaded independently from the central route registry.
import "./erp-trips.js";

type SyncOptions = {
  createIfMissing?: boolean;
  fallbackDate?: string;
  refreshDispatchSnapshot?: boolean;
  refreshTrailerSnapshot?: boolean;
  onlyActive?: boolean;
};

const routingTripKey = (childId: number) => `routing-trip:${childId}`;

/**
 * Keep the dispatch's trip-log row in sync with its child routing trip.
 * Date and tariff/bonus snapshots are immutable after first insertion unless an
 * explicit supervisor edit asks to refresh the dispatch snapshot.
 */
export function syncRoutingTripLog(childId: number, options: SyncOptions = {}): void {
  const source = db.prepare(`
    SELECT t.id, t.status, t.vehicle_plate, t.driver_name, t.driver_phone,
           t.driver_loading_image, t.permit_image_url AS child_permit_image_url,
           t.invoice_image_url, t.reference_no,
           sr.product_name, sr.destination_division, sr.warehouse_name,
           sr.reference_no AS parent_reference_no,
           sr.driver_expense, sr.rental, sr.permit_image_url AS parent_permit_image_url,
           sr.invoice_image, sr.customer_name, sr.customer_type, sr.cargo_type,
           sr.rep_name, sr.rep_phone,
           d.id AS dispatch_id, d.created_at AS dispatch_created_at,
           d.tariff_loading_place, d.tariff_unloading_place,
           d.customer_name AS dispatch_customer_name, d.customer_type AS dispatch_customer_type,
           d.driver_expense AS dispatch_driver_expense, d.rental AS dispatch_rental,
           d.cargo_type AS dispatch_cargo_type, d.rep_name AS dispatch_rep_name,
           d.rep_phone AS dispatch_rep_phone
    FROM supply_request_trips t
    JOIN supply_requests sr ON sr.id=t.supply_request_id
    JOIN routing_dispatches d ON d.id=sr.routing_dispatch_id
    WHERE t.id=?
  `).get(childId) as {
    id: number; status: string; vehicle_plate: string | null; driver_name: string | null; driver_phone: string | null;
    parent_reference_no: string | null;
    driver_loading_image: string | null; child_permit_image_url: string | null;
    invoice_image_url: string | null; reference_no: string | null;
    product_name: string; destination_division: string | null; warehouse_name: string | null;
    driver_expense: number | null; rental: number | null; parent_permit_image_url: string | null;
    invoice_image: string | null; customer_name: string | null; customer_type: string | null;
    cargo_type: string | null; rep_name: string | null; rep_phone: string | null;
    dispatch_id: number; dispatch_created_at: string; tariff_loading_place: string | null;
    tariff_unloading_place: string | null; dispatch_customer_name: string | null;
    dispatch_customer_type: string | null; dispatch_driver_expense: number | null;
    dispatch_rental: number | null; dispatch_cargo_type: string | null;
    dispatch_rep_name: string | null; dispatch_rep_phone: string | null;
  } | undefined;
  if (!source?.vehicle_plate) return;
  if (options.onlyActive && ["completed", "cancelled", "rejected"].includes(source.status)) return;

  const reference = source.reference_no || source.parent_reference_no || null;
  const driverName = source.driver_name || (db.prepare(
    "SELECT driver_name FROM driver_profiles WHERE vehicle_plate=? LIMIT 1"
  ).get(source.vehicle_plate) as { driver_name: string | null } | undefined)?.driver_name || null;
  const permitImage = source.child_permit_image_url || source.parent_permit_image_url || null;
  const invoiceImage = source.invoice_image_url || source.invoice_image || null;
  const driverExpense = Number(source.dispatch_driver_expense ?? source.driver_expense) || 0;
  const rental = Number(source.dispatch_rental ?? source.rental) || 0;
  const repName = source.dispatch_rep_name || source.rep_name;
  const repPhone = source.dispatch_rep_phone || source.rep_phone;
  const notes = [
    `توجيه #${source.dispatch_id}`,
    `حالة التوجيه: ${({
      assigned: "بانتظار الفسح",
      pending_permit: "بانتظار التصريح",
      in_transit: "في الطريق",
      loaded: "تم التحميل",
      delivered_to_warehouse: "وصل للمستودع",
      pending_warehouse_approval: "بانتظار اعتماد المستودع",
      completed: "مكتملة",
      cancelled: "ملغاة",
      rejected: "مرفوضة",
    } as Record<string, string>)[source.status] || source.status}`,
    repName ? `المندوب: ${String(repName).trim()}` : null,
    repPhone ? `هاتف المندوب: ${String(repPhone).trim()}` : null,
    reference ? `مرجع/فسح: ${reference.trim()}` : null,
  ].filter(Boolean).join(" | ");
  const trailer = (db.prepare(
    "SELECT linked_trailer_number FROM fleet_vehicles WHERE plate_number=? LIMIT 1"
  ).get(source.vehicle_plate) as { linked_trailer_number: string | null } | undefined)?.linked_trailer_number || null;
  const tripKey = routingTripKey(source.id);
  const existing = db.prepare("SELECT id FROM trips WHERE client_request_id=?").get(tripKey);

  if (!existing && options.createIfMissing) {
    // Existing dispatches without an early log retain the old completion-date behavior.
    const originalDate = options.fallbackDate || source.dispatch_created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO trips
        (date, car_id, driver_name, driver_phone, material_type, destination, trips_count,
         loading_region, unloading_region, unit_price, total_amount, net_amount, route_bonus,
         image_url, permit_image_url, fsohat_image_url, notes, trailer_number,
         client_name, customer_type_snapshot, loading_card_no, client_request_id)
      VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
    `).run(
      originalDate, source.vehicle_plate, driverName, source.driver_phone,
      source.dispatch_cargo_type || source.cargo_type || source.product_name,
      source.destination_division || source.warehouse_name || null,
      source.tariff_loading_place || source.warehouse_name || null,
      source.tariff_unloading_place || source.destination_division || source.warehouse_name || null,
      rental, rental, rental - driverExpense, driverExpense,
      source.driver_loading_image, permitImage, invoiceImage, notes, trailer,
      source.dispatch_customer_name || source.customer_name,
      source.dispatch_customer_type || source.customer_type, reference, tripKey,
    );
  }

  // Refresh live child-owned data without changing the original date/tariff
  // snapshot. During a supervisor edit, refresh all dispatch-level snapshots too.
  const refreshDispatchSnapshot = options.refreshDispatchSnapshot === true;
  db.prepare(`
    UPDATE trips SET
      car_id=?, driver_name=?, driver_phone=?,
      image_url=?, permit_image_url=?, fsohat_image_url=?, notes=?,
      loading_card_no=?,
      ${refreshDispatchSnapshot ? `
      material_type=?, destination=?, loading_region=?, unloading_region=?,
      unit_price=?, total_amount=?, net_amount=?, route_bonus=?,
      client_name=?, customer_type_snapshot=?,
      ` : ""}
      ${options.refreshTrailerSnapshot ? "trailer_number=?," : ""}
      client_request_id=?
    WHERE client_request_id=?
  `).run(
    source.vehicle_plate, driverName, source.driver_phone,
    source.driver_loading_image, permitImage, invoiceImage, notes,
    reference,
    ...(refreshDispatchSnapshot ? [
      source.dispatch_cargo_type || source.cargo_type || source.product_name,
      source.destination_division || source.warehouse_name || null,
      source.tariff_loading_place || source.warehouse_name || null,
      source.tariff_unloading_place || source.destination_division || source.warehouse_name || null,
      rental, rental, rental - driverExpense, driverExpense,
      source.dispatch_customer_name || source.customer_name,
      source.dispatch_customer_type || source.customer_type,
    ] : []),
    ...(options.refreshTrailerSnapshot ? [trailer] : []),
    tripKey, tripKey,
  );
}

/**
 * Remove only an uncompleted, keyed routing-dispatch placeholder. Legacy
 * trip-log rows never have this key, and delivered/completed trips are retained.
 */
export function deletePendingRoutingTripLog(childId: number): void {
  const child = db.prepare("SELECT status FROM supply_request_trips WHERE id=?").get(childId) as
    { status: string } | undefined;
  if (!child || !["assigned", "pending_permit", "in_transit", "loaded"].includes(child.status)) return;
  db.prepare(`
    DELETE FROM trips
    WHERE client_request_id=? AND client_request_id IS NOT NULL
  `).run(routingTripKey(childId));
}