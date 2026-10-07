import { useState, useEffect, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { Car, Upload, X, Save, Search, RefreshCw, Eye, FileText, Shield, Wrench, Trash2, Bell, Package, ArrowLeftRight, OctagonX, AlertTriangle, Truck, Download, ChevronDown, Printer, Share2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import * as XLSX from "xlsx";
import type { VehicleDossierPerson, VehicleDossierVehicle } from "./vehicleDossierPdf";

type ComplianceDoc = {
  id: number; car_number: string; doc_type: string;
  start_date?: string; end_date?: string; image_url?: string; notes?: string; created_at: string;
};
type Vehicle = {
  id: number; plate_number: string; vehicle_name?: string; vehicle_type?: string;
  entity?: string; branch?: string; status?: string; driver_name?: string; driver_phone?: string;
  show_cargo_photo?: number | null;
  backup_driver_name?: string; backup_driver_phone?: string; notes?: string;
  max_weight_kg?: number; empty_weight_kg?: number;
  compliance?: Record<string, ComplianceDoc>;
  types?: VehicleTypeAssignment[];
  linked_teidarat?: Teidara[];
  unresolved_teidara_links?: { source: string; value: string }[];
  [key: string]: unknown;
};
type Teidara = { id: number; seq_no: number; category: string; teidara_number?: string; teidara_type?: string; vehicle_plate?: string };
type DocFormState = { file: File | null; start_date: string; end_date: string; notes: string; uploading: boolean };
type VehicleImage = { id: number; plate_number: string; angle: string; image_url: string; created_at: string };
type AttachmentDeleteResponse = {
  ok?: boolean;
  error?: string;
  fileRemoved?: boolean;
  fileRetainedBecauseShared?: boolean;
  referencesVerified?: boolean;
  clearedFields?: string[];
};

const ANGLE_LABELS: Record<string, string> = {
  front: "أمامية", back: "خلفية", left: "يسار", right: "يمين", interior: "داخلية", other: "أخرى",
};

const DOC_TYPES = [
  { key: "insurance",      label: "التأمين",        icon: Shield,    color: "blue"   },
  { key: "inspection",     label: "الفحص الدوري",   icon: Wrench,    color: "green"  },
  { key: "operation_card", label: "كرت التشغيل",    icon: FileText,  color: "orange" },
];

const VEHICLE_ATTACHMENT_LABELS: Record<string, string> = {
  registration_image: "صورة استمارة السيارة",
  registration_url: "استمارة السيارة",
  vehicle_registration_url: "استمارة السيارة",
  insurance_image: "صورة التأمين",
  inspection_image: "صورة الفحص الدوري",
  operation_card_image: "صورة كرت التشغيل",
  vehicle_image_url: "صورة السيارة",
};

function getVehicleAttachmentLabel(field: string): string {
  if (VEHICLE_ATTACHMENT_LABELS[field]) return VEHICLE_ATTACHMENT_LABELS[field];
  const readableName = field.replace(/_(?:url|image|pdf)$/i, "").replace(/_/g, " ");
  return `مرفق السيارة: ${readableName}`;
}

function getVehicleAttachmentHref(url: string): string {
  return url.startsWith("/objects/") ? `/api/storage${url}` : url;
}

function getDirectVehicleAttachments(vehicle: Vehicle | null): Array<[string, string]> {
  if (!vehicle) return [];

  const seenUrls = new Set<string>();
  const attachments: Array<[string, string]> = [];
  for (const [field, value] of Object.entries(vehicle)) {
    if (!/(?:_url|_image|_pdf)$/i.test(field) || typeof value !== "string" || !value.trim()) continue;
    const url = value.trim();
    if (url.startsWith("data:") || url.length > 4096) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);
    attachments.push([field, url]);
  }
  return attachments;
}

async function readAttachmentDeleteResponse(response: Response): Promise<AttachmentDeleteResponse> {
  return response.json().catch(() => ({})) as Promise<AttachmentDeleteResponse>;
}

function showAttachmentDeleteNotice(data: AttachmentDeleteResponse): void {
  if (data.fileRemoved !== false) return;
  if (data.fileRetainedBecauseShared) {
    alert("تم حذف المرفق من هذه السيارة، وأُبقي الملف لأنه مستخدم في سجل آخر.");
  } else if (!data.referencesVerified) {
    alert("تم حذف ارتباط المرفق من السيارة، وأُبقي الملف لتعذر التأكد من عدم استخدامه في مكان آخر.");
  }
}

const VEH_TYPES    = ["سطحة","بلكر","ونش","دين","شاحنة","بيك أب","أخرى"];
const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  available:   { label: "متاح",          cls: "bg-green-100 text-green-700"  },
  on_trip:     { label: "في رحلة",       cls: "bg-blue-100 text-blue-700"    },
  busy:        { label: "في رحلة",       cls: "bg-blue-100 text-blue-700"    },
  maintenance: { label: "في الصيانة",    cls: "bg-yellow-100 text-yellow-700"},
  inactive:    { label: "متوقف",         cls: "bg-gray-100 text-gray-500"    },
};

type DocStatus = "missing" | "uploaded" | "valid" | "expiring" | "expired";

function getDocStatus(doc?: ComplianceDoc): DocStatus {
  if (!doc) return "missing";
  if (!doc.end_date) return doc.image_url || doc.start_date ? "uploaded" : "missing";
  const daysLeft = Math.floor((new Date(doc.end_date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0)  return "expired";
  if (daysLeft < 30) return "expiring";
  return "valid";
}

const DOC_STATUS_CFG: Record<DocStatus, { label: string; dot: string; badge: string; card: string; border: string }> = {
  missing:  { label: "غير موجودة",       dot: "bg-gray-300",    badge: "bg-gray-100 text-gray-500",      card: "bg-gray-50",       border: "border-gray-200"   },
  uploaded: { label: "موجودة",           dot: "bg-blue-400",    badge: "bg-blue-100 text-blue-600",      card: "bg-blue-50/30",    border: "border-blue-100"   },
  valid:    { label: "سارية",            dot: "bg-green-500",   badge: "bg-green-100 text-green-700",    card: "bg-green-50/30",   border: "border-green-200"  },
  expiring: { label: "تنتهي قريباً",     dot: "bg-orange-400",  badge: "bg-orange-100 text-orange-700",  card: "bg-orange-50/40",  border: "border-orange-200" },
  expired:  { label: "منتهية ⚠️",       dot: "bg-red-500",     badge: "bg-red-100 text-red-600",        card: "bg-red-50/40",     border: "border-red-200"    },
};

const EMPTY_DOC_FORM: DocFormState = { file: null, start_date: "", end_date: "", notes: "", uploading: false };

type VehicleTypeAssignment = { type_name: string; is_primary: number };
type VehicleTypeDef = { id: number; name: string; icon: string; is_active: number };
type FleetNotif = { id: number; title: string; body: string; read: number; created_at: string };
type DriverProfile = { id: number; driver_name: string; phone?: string; vehicle_plate?: string };
type GeneratedVehiclePdf = { file: File; url: string; title: string };

export default function FleetManagePage() {
  const { user } = useAuth();
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [loading, setLoading]     = useState(true);
  const [drivers, setDrivers]     = useState<DriverProfile[]>([]);
  const [teidarat, setTeidarat]   = useState<Teidara[]>([]);
  const [companyBranches, setCompanyBranches] = useState<{ id: number; entity_name: string }[]>([]);
  const [search, setSearch]       = useRememberedState("admin-fleet-vehicles-search", "");
  const [selected, setSelected]   = useState<Vehicle | null>(null);
  const [tab, setTab]             = useState<"info" | "photos" | "docs">("info");
  const [editForm, setEditForm]   = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState(false);
  const [vehicleDocs, setVehicleDocs] = useState<ComplianceDoc[]>([]);
  const [docForms, setDocForms]   = useState<Record<string, DocFormState>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [newDoc, setNewDoc]       = useState<DocFormState & { doc_type: string }>({ ...EMPTY_DOC_FORM, doc_type: "" });
  const newDocFileRef = useRef<HTMLInputElement | null>(null);
  const [addOpen, setAddOpen]     = useState(false);
  const [addForm, setAddForm]     = useState<Record<string, string>>({ status: "available" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError]   = useState("");
  const [addLinkedTeidaraIds, setAddLinkedTeidaraIds] = useState<string[]>([]);

  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeDef[]>([]);
  const [typeFilter, setTypeFilter]     = useRememberedState<string>("admin-fleet-vehicles-type-filter", "all");
  const [notifs, setNotifs]             = useState<FleetNotif[]>([]);
  const [editTypes, setEditTypes]       = useState<string[]>([]);
  const [editPrimaryType, setEditPrimaryType] = useState<string>("");
  const [editLinkedTeidaraIds, setEditLinkedTeidaraIds] = useState<string[]>([]);
  const [editTeidaraLinksTouched, setEditTeidaraLinksTouched] = useState(false);

  type ActiveOrder = { id: number; order_number: string; customer_name: string; product_name: string; quantity: number; stage: string; driver_name?: string; driver_phone?: string };
  const [activeOrder, setActiveOrder]   = useState<ActiveOrder | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [swapOpen, setSwapOpen]         = useState(false);
  const [swapVehicleId, setSwapVehicleId] = useState<string>("");
  const [swapDriverPhone, setSwapDriverPhone] = useState<string>("");
  const [swapSaving, setSwapSaving]     = useState(false);
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [importing, setImporting]       = useState(false);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const directVehicleAttachments = getDirectVehicleAttachments(selected);
  const [xlsOpen, setXlsOpen]           = useState(false);
  const xlsRef = useRef<HTMLDivElement | null>(null);

  const [vehicleImages, setVehicleImages] = useState<VehicleImage[]>([]);
  const [vImgAngle, setVImgAngle]         = useState("front");
  const [vImgUploading, setVImgUploading] = useState(false);
  const vImgFileRef = useRef<HTMLInputElement | null>(null);
  const [pdfGeneratingPlate, setPdfGeneratingPlate] = useState<string | null>(null);
  const [vehiclePdfPreview, setVehiclePdfPreview] = useState<GeneratedVehiclePdf | null>(null);

  useEffect(() => {
    const url = vehiclePdfPreview?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [vehiclePdfPreview?.url]);

  const load = () => {
    setLoading(true);
    fetch("/api/fleet-vehicles/manage-full").then(r => r.json()).then(d => { setVehicles(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  };

  const setCargoPhotoVisibility = async (vehicle: Vehicle, visible: boolean) => {
    try {
      const response = await fetch(`/api/fleet-vehicles/${encodeURIComponent(vehicle.plate_number)}/cargo-photo-visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}` },
        body: JSON.stringify({ visible }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "تعذر تحديث إعداد بطاقة صورة الحمولة");
        return;
      }
      setVehicles(current => current.map(item => item.plate_number === vehicle.plate_number
        ? { ...item, show_cargo_photo: data.show_cargo_photo }
        : item));
      setSelected(current => current?.plate_number === vehicle.plate_number
        ? { ...current, show_cargo_photo: data.show_cargo_photo }
        : current);
    } catch {
      alert("تعذر الاتصال بالخادم لتحديث بطاقة صورة الحمولة");
    }
  };

  const loadNotifs = () => {
    if (!user) return;
    fetch(`/api/notifications?phone=${user.phone}`)
      .then(r => r.json())
      .then((d: FleetNotif[]) => {
        const fleet = (Array.isArray(d) ? d : []).filter(n =>
          !n.read && (n.title?.includes("حمولة") || n.title?.includes("أسطول") || n.body?.includes("سيار"))
        );
        setNotifs(fleet);
      })
      .catch(() => {});
  };

  const markRead = (id: number) => {
    if (!user) return;
    fetch(`/api/notifications/${id}/read`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: user.phone }),
    }).catch(() => {});
    setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const handleNotifClick = (n: FleetNotif) => {
    const plate = n.title.replace(/.*—\s*/, "").trim();
    if (plate) setSearch(plate);
    markRead(n.id);
  };

  useEffect(() => {
    load();
    fetch("/api/vehicle-type-defs")
      .then(r => r.json())
      .then((d: VehicleTypeDef[]) => setVehicleTypes(Array.isArray(d) ? d.filter(t => t.is_active !== 0) : []))
      .catch(() => {});
    fetch("/api/drivers")
      .then(r => r.json())
      .then((d: DriverProfile[]) => setDrivers(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/company-settings")
      .then(r => r.json())
      .then(d => setCompanyBranches(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch("/api/teidarat")
      .then(r => r.json())
      .then((d: Teidara[]) => setTeidarat(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadNotifs(); }, [user]);

  const uploadNewDoc = async () => {
    if (!selected || !newDoc.doc_type.trim()) return;
    setNewDoc(f => ({ ...f, uploading: true }));
    const fd = new FormData();
    fd.append("car_number", selected.plate_number);
    fd.append("doc_type",   newDoc.doc_type.trim());
    if (newDoc.file)       fd.append("image",      newDoc.file);
    if (newDoc.start_date) fd.append("start_date", newDoc.start_date);
    if (newDoc.end_date)   fd.append("end_date",   newDoc.end_date);
    if (newDoc.notes)      fd.append("notes",      newDoc.notes);
    await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
    setNewDoc({ ...EMPTY_DOC_FORM, doc_type: "" });
    if (newDocFileRef.current) newDocFileRef.current.value = "";
    const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(selected.plate_number)}`).then(r => r.json());
    setVehicleDocs(Array.isArray(docs) ? docs : []);
    setNewDoc(f => ({ ...f, uploading: false }));
  };

  const deleteVehicle = async () => {
    if (!selected) return;
    if (!confirm(`حذف السيارة "${selected.plate_number}" نهائياً؟`)) return;
    await fetch(`/api/fleet-vehicles/${encodeURIComponent(selected.plate_number)}`, { method: "DELETE" });
    setSelected(null);
    load();
  };

  const addVehicle = async () => {
    if (!addForm.plate_number?.trim()) return;
    const dup = vehicles.find(v => v.plate_number.trim() === addForm.plate_number.trim());
    if (dup) { setAddError("رقم اللوحة مسجّل مسبقاً في دفتر السيارات"); return; }
    setAddSaving(true);
    try {
      const res = await fetch("/api/fleet-vehicles/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, linked_teidara_ids: addLinkedTeidaraIds }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || "حدث خطأ"); return; }
      setAddOpen(false);
      setAddForm({ status: "available" });
      setAddLinkedTeidaraIds([]);
      setAddError("");
      load();
    } finally { setAddSaving(false); }
  };

  const loadVehicleImages = (plate: string) => {
    fetch(`/api/vehicle-images/${encodeURIComponent(plate)}`)
      .then(r => r.json()).then(d => setVehicleImages(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const uploadVehicleImage = async (plate: string, angle: string, file: File) => {
    setVImgUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("plate_number", plate);
      fd.append("angle", angle);
      const r = await fetch("/api/vehicle-images", { method: "POST", body: fd });
      const data = await r.json();
      if (r.ok) setVehicleImages(prev => [...prev, { id: data.id, plate_number: plate, angle: data.angle, image_url: data.image_url, created_at: new Date().toISOString() }]);
    } finally { setVImgUploading(false); if (vImgFileRef.current) vImgFileRef.current.value = ""; }
  };

  const deleteVehicleImage = async (id: number) => {
    if (!confirm("حذف هذه الصورة؟")) return;
    try {
      const response = await fetch(`/api/vehicle-images/${id}`, { method: "DELETE" });
      const data = await readAttachmentDeleteResponse(response);
      if (!response.ok) {
        alert(data.error || "تعذر حذف الصورة");
        return;
      }
      setVehicleImages(prev => prev.filter(i => i.id !== id));
      showAttachmentDeleteNotice(data);
    } catch {
      alert("تعذر الاتصال بالخادم لحذف الصورة");
    }
  };

  const deleteVehicleComplianceDocument = async (doc: ComplianceDoc, label: string) => {
    if (!confirm(`حذف ${label}؟ سيُحذف الملف ما لم يكن مستخدماً في سجل آخر.`)) return;
    try {
      const response = await fetch(`/api/vehicle-compliance/${doc.id}`, { method: "DELETE" });
      const data = await readAttachmentDeleteResponse(response);
      if (!response.ok) {
        alert(data.error || "تعذر حذف الوثيقة");
        return;
      }
      setVehicleDocs(prev => prev.filter(item => item.id !== doc.id));
      showAttachmentDeleteNotice(data);
    } catch {
      alert("تعذر الاتصال بالخادم لحذف الوثيقة");
    }
  };

  const deleteDirectVehicleAttachment = async (field: string, label: string) => {
    if (!selected) return;
    const plate = selected.plate_number;
    if (!confirm(`حذف ${label} من السيارة؟ سيُحذف الملف ما لم يكن مستخدماً في سجل آخر.`)) return;

    try {
      const response = await fetch(
        `/api/fleet-vehicles/${encodeURIComponent(plate)}/attachments/${encodeURIComponent(field)}`,
        { method: "DELETE" },
      );
      const data = await readAttachmentDeleteResponse(response);
      if (!response.ok) {
        alert(data.error || "تعذر حذف المرفق");
        return;
      }

      const fieldsToClear = data.clearedFields?.length ? data.clearedFields : [field];
      const clearedValues = Object.fromEntries(fieldsToClear.map(name => [name, null]));
      setSelected(current => current?.plate_number === plate ? { ...current, ...clearedValues } : current);
      setVehicles(current => current.map(vehicle =>
        vehicle.plate_number === plate ? { ...vehicle, ...clearedValues } : vehicle,
      ));
      showAttachmentDeleteNotice(data);
    } catch {
      alert("تعذر الاتصال بالخادم لحذف المرفق");
    }
  };

  const generateVehiclePdf = async (vehicle: Vehicle) => {
    if (pdfGeneratingPlate) return;
    setPdfGeneratingPlate(vehicle.plate_number);
    try {
      const encodedPlate = encodeURIComponent(vehicle.plate_number);
      const [docsResponse, imagesResponse, driversResponse] = await Promise.all([
        fetch(`/api/vehicle-compliance/${encodedPlate}`),
        fetch(`/api/vehicle-images/${encodedPlate}`),
        fetch("/api/drivers"),
      ]);
      if (!docsResponse.ok) throw new Error(`تعذر تحميل وثائق السيارة (${docsResponse.status})`);
      if (!imagesResponse.ok) throw new Error(`تعذر تحميل صور السيارة (${imagesResponse.status})`);
      const hasLinkedDriver = !!(vehicle.driver_name || vehicle.backup_driver_name);
      if (!driversResponse.ok && hasLinkedDriver) {
        throw new Error(`تعذر تحميل بيانات السائقين (${driversResponse.status})`);
      }

      const [docsData, imagesData, driversData] = await Promise.all([
        docsResponse.json(),
        imagesResponse.json(),
        driversResponse.ok ? driversResponse.json() : Promise.resolve([]),
      ]);
      if (!Array.isArray(docsData)) throw new Error("تعذر قراءة وثائق السيارة");
      if (!Array.isArray(imagesData)) throw new Error("تعذر قراءة صور السيارة");
      if (!Array.isArray(driversData) && hasLinkedDriver) throw new Error("تعذر قراءة بيانات السائقين");

      const { createVehicleDossierPdf } = await import("./vehicleDossierPdf");
      const pdfBlob = await createVehicleDossierPdf({
        vehicle: vehicle as unknown as VehicleDossierVehicle,
        vehicleDocs: docsData,
        vehicleImages: imagesData,
        drivers: (Array.isArray(driversData) ? driversData : []) as VehicleDossierPerson[],
      });
      const safePlate = vehicle.plate_number.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-");
      const file = new File([pdfBlob], `ملف-السيارة-${safePlate}.pdf`, { type: "application/pdf" });
      setVehiclePdfPreview({
        file,
        url: URL.createObjectURL(file),
        title: `ملف السيارة ${vehicle.plate_number}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "تعذر تجهيز الملف";
      alert(`تعذر إنشاء ملف السيارة: ${detail}`);
    } finally {
      setPdfGeneratingPlate(null);
    }
  };

  const openVehicle = (v: Vehicle) => {
    setSelected(v);
    const linkedDriver = drivers.find(d => d.driver_name === v.driver_name);
    setEditForm({
      vehicle_name:     v.vehicle_name     || "",
      new_plate_number: v.plate_number,
      vehicle_type:     v.vehicle_type     || "",
      entity:           v.entity           || "",
      branch:           v.branch           || "",
      status:           v.status           || "available",
      notes:            v.notes            || "",
      max_weight_kg:    String(v.max_weight_kg   || ""),
      empty_weight_kg:  String(v.empty_weight_kg || ""),
      driver_name:      v.driver_name      || "",
      driver_phone:     v.driver_phone || linkedDriver?.phone || "",
      backup_driver_name:  v.backup_driver_name || "",
      backup_driver_phone: v.backup_driver_phone || "",
    });
    setEditLinkedTeidaraIds((v.linked_teidarat || []).map(t => String(t.id)));
    setEditTeidaraLinksTouched(false);
    const assigned = (v.types || []).map(t => t.type_name);
    setEditTypes(assigned.length > 0 ? assigned : (v.vehicle_type ? [v.vehicle_type] : []));
    setEditPrimaryType(
      (v.types || []).find(t => t.is_primary)?.type_name || v.vehicle_type || ""
    );
    setDocForms({});
    // Use active_order already embedded in vehicle data by manage-full endpoint
    setActiveOrder((v as unknown as { active_order?: ActiveOrder | null }).active_order ?? null);
    setLoadingOrder(false);
    setTab("info");
    setVehicleImages([]);
    fetch(`/api/vehicle-compliance/${encodeURIComponent(v.plate_number)}`)
      .then(r => r.json()).then(d => setVehicleDocs(Array.isArray(d) ? d : [])).catch(() => {});
    loadVehicleImages(v.plate_number);
  };

  const doSwapVehicle = async () => {
    if (!activeOrder || !swapVehicleId) return;
    setSwapSaving(true);
    try {
      const res = await fetch(`/api/workflow/orders/${activeOrder.id}/swap-vehicle`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: swapVehicleId, driver_phone: swapDriverPhone || undefined }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "حدث خطأ"); return; }
      setSwapOpen(false);
      setSwapVehicleId(""); setSwapDriverPhone("");
      setSelected(null); load();
    } finally { setSwapSaving(false); }
  };

  const doCancelTrip = async () => {
    if (!activeOrder) return;
    setCancelSaving(true);
    try {
      const res = await fetch(`/api/workflow/orders/${activeOrder.id}/cancel-trip`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel_reason: cancelReason || "إلغاء الرحلة من قِبَل الإدارة" }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "حدث خطأ"); return; }
      setCancelOpen(false); setCancelReason("");
      setSelected(null); load();
    } finally { setCancelSaving(false); }
  };

  const saveVehicle = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fleet-vehicles/${encodeURIComponent(selected.plate_number)}/info`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          linked_teidara_ids: editLinkedTeidaraIds,
          teidara_links_touched: editTeidaraLinksTouched,
        }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      const newPlate = data.new_plate || selected.plate_number;
      const typesPayload = editTypes.map(name => ({
        type_name: name,
        is_primary: name === editPrimaryType ? 1 : 0,
      }));
      await fetch(`/api/fleet-vehicles/${encodeURIComponent(newPlate)}/types`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: typesPayload }),
      });
      load();
      setSelected(prev => prev ? {
        ...prev, plate_number: newPlate,
        vehicle_name: editForm.vehicle_name, vehicle_type: editPrimaryType || editTypes[0] || editForm.vehicle_type,
        status: editForm.status, notes: editForm.notes,
        types: typesPayload,
        linked_teidarat: editTeidaraLinksTouched
          ? teidarat.filter(t => editLinkedTeidaraIds.includes(String(t.id)))
          : prev.linked_teidarat,
        unresolved_teidara_links: editTeidaraLinksTouched ? [] : prev.unresolved_teidara_links,
      } : null);
      setEditTeidaraLinksTouched(false);
    } finally { setSaving(false); }
  };

  const setDocField = (docType: string, field: keyof DocFormState, val: unknown) => {
    setDocForms(f => ({ ...f, [docType]: { ...(f[docType] || { ...EMPTY_DOC_FORM }), [field]: val } }));
  };

  const uploadDoc = async (docType: string) => {
    if (!selected) return;
    const form = docForms[docType] || EMPTY_DOC_FORM;
    if (!form.file && !form.start_date && !form.end_date) return;
    setDocField(docType, "uploading", true);
    try {
      const fd = new FormData();
      fd.append("car_number", selected.plate_number);
      fd.append("doc_type", docType);
      if (form.file)       fd.append("image", form.file);
      if (form.start_date) fd.append("start_date", form.start_date);
      if (form.end_date)   fd.append("end_date",   form.end_date);
      if (form.notes)      fd.append("notes",      form.notes);
      await fetch("/api/vehicle-compliance", { method: "POST", body: fd });
      const docs = await fetch(`/api/vehicle-compliance/${encodeURIComponent(selected.plate_number)}`).then(r => r.json());
      setVehicleDocs(Array.isArray(docs) ? docs : []);
      setDocForms(f => ({ ...f, [docType]: { ...EMPTY_DOC_FORM } }));
      if (fileRefs.current[docType]) fileRefs.current[docType]!.value = "";
      load();
    } finally { setDocField(docType, "uploading", false); }
  };

  // ── Excel export: fleet vehicles (full) ──────────────────────────────────
  const exportFleet = () => {
    const STATUS_LABELS: Record<string, string> = {
      available: "متاح", on_trip: "في رحلة", busy: "في رحلة",
      maintenance: "في الصيانة", inactive: "متوقف",
    };
    const DOC_STATUS_LABELS: Record<string, string> = {
      missing: "غير موجودة", uploaded: "موجودة", valid: "سارية",
      expiring: "تنتهي قريباً", expired: "منتهية ⚠️",
    };
    const rows = vehicles.map(v => {
      const allTypes = v.types && v.types.length > 0
        ? v.types.map(t => (t.is_primary ? `★${t.type_name}` : t.type_name)).join(" / ")
        : v.vehicle_type || "";

      const ins  = v.compliance?.["insurance"];
      const insp = v.compliance?.["inspection"];
      const opc  = v.compliance?.["operation_card"];

      const docRow = (doc?: ComplianceDoc) => ({
        status:  DOC_STATUS_LABELS[getDocStatus(doc)] ?? "",
        start:   doc?.start_date  || "",
        end:     doc?.end_date    || "",
        notes:   doc?.notes       || "",
      });
      const insR  = docRow(ins);
      const inspR = docRow(insp);
      const opcR  = docRow(opc);

      return {
        "رقم اللوحة":               v.plate_number,
        "اسم المركبة":              v.vehicle_name        || "",
        "أنواع المركبة":            allTypes,
        "فرع الشركة":               v.branch              || "",
        "الحالة":                   STATUS_LABELS[v.status || "available"] || v.status || "",
        "السائق الأساسي":           v.driver_name         || "",
        "جوال السائق الأساسي":      v.driver_phone        || "",
        "السائق الاحتياطي":         v.backup_driver_name  || "",
        "جوال السائق الاحتياطي":    v.backup_driver_phone || "",
        "وزن السيارة الفارغ (كجم)": v.empty_weight_kg     ?? "",
        "الحمولة القصوى (كجم)":     v.max_weight_kg       ?? "",
        "ملاحظات السيارة":          v.notes               || "",
        // ── التأمين ──
        "التأمين - الحالة":         insR.status,
        "التأمين - تاريخ البداية":  insR.start,
        "التأمين - تاريخ الانتهاء": insR.end,
        "التأمين - ملاحظات":        insR.notes,
        // ── الفحص الدوري ──
        "الفحص الدوري - الحالة":         inspR.status,
        "الفحص الدوري - تاريخ البداية":  inspR.start,
        "الفحص الدوري - تاريخ الانتهاء": inspR.end,
        "الفحص الدوري - ملاحظات":        inspR.notes,
        // ── كرت التشغيل ──
        "كرت التشغيل - الحالة":         opcR.status,
        "كرت التشغيل - تاريخ البداية":  opcR.start,
        "كرت التشغيل - تاريخ الانتهاء": opcR.end,
        "كرت التشغيل - ملاحظات":        opcR.notes,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // ── عرض الأعمدة ──────────────────────────────────────────────────────
    ws["!cols"] = [
      { wch: 14 }, // رقم اللوحة
      { wch: 18 }, // اسم المركبة
      { wch: 20 }, // أنواع المركبة
      { wch: 16 }, // الجهة
      { wch: 12 }, // الحالة
      { wch: 18 }, // السائق
      { wch: 14 }, // وزن فارغ
      { wch: 14 }, // حمولة قصوى
      { wch: 24 }, // ملاحظات السيارة
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, // تأمين
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, // فحص
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, // كرت
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الأسطول الشامل");
    XLSX.writeFile(wb, `الأسطول_الشامل_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Excel export: compliance documents ───────────────────────────────────
  const exportDocs = async () => {
    const DOC_LABELS: Record<string, string> = {
      insurance: "التأمين", inspection: "الفحص الدوري", operation_card: "كرت التشغيل",
    };
    const allDocs = await fetch("/api/vehicle-compliance/all").then(r => r.json()).catch(() => []);
    const rows = (allDocs as Record<string,unknown>[]).map(d => ({
      "رقم اللوحة":   d.car_number,
      "نوع الوثيقة":  DOC_LABELS[d.doc_type as string] || d.doc_type,
      "تاريخ البداية": d.start_date || "",
      "تاريخ الانتهاء": d.end_date  || "",
      "ملاحظات":      d.notes      || "",
      "تاريخ الرفع":  d.created_at || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الوثائق");
    XLSX.writeFile(wb, `وثائق_الأسطول_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ── Excel import: fleet vehicles ─────────────────────────────────────────
  const importFleet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];
      if (!rows.length) { alert("الملف فارغ"); return; }
      const res = await fetch("/api/fleet-vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "حدث خطأ"); return; }
      alert(data.message || "تم الاستيراد");
      load();
    } catch { alert("فشل قراءة الملف"); }
    finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const typeNames = v.types && v.types.length > 0 ? v.types.map(t => t.type_name) : (v.vehicle_type ? [v.vehicle_type] : []);
    const matchSearch = !q ||
      v.plate_number.toLowerCase().includes(q) ||
      (v.vehicle_name || "").toLowerCase().includes(q) ||
      (v.vehicle_type || "").toLowerCase().includes(q) ||
      (v.branch       || "").toLowerCase().includes(q) ||
      (v.driver_name  || "").toLowerCase().includes(q) ||
      typeNames.some(tn => tn.toLowerCase().includes(q));
    const matchType = typeFilter === "all" || typeNames.includes(typeFilter);
    return matchSearch && matchType;
  });

  // Overall fleet doc health
  const alertCount = vehicles.filter(v => DOC_TYPES.some(dt => {
    const st = getDocStatus(v.compliance?.[dt.key]);
    return st === "expired" || st === "expiring";
  })).length;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">إدارة الأسطول</h1>
          <p className="text-sm text-gray-400 mt-1">تعديل بيانات السيارات ورفع وثائق التأمين والفحص وكرت التشغيل</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {alertCount > 0 && (
            <span className="bg-red-100 text-red-700 text-sm font-semibold px-3 py-1 rounded-xl">
              ⚠️ {alertCount} سيارة تحتاج مراجعة وثائق
            </span>
          )}
          {/* Hidden file input for import */}
          <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={importFleet} />
          {/* Excel dropdown */}
          <div ref={xlsRef} className="relative">
            <button
              onClick={() => setXlsOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-green-300 rounded-xl text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100"
            >
              <Download size={14} />إكسل<ChevronDown size={13} />
            </button>
            {xlsOpen && (
              <div
                className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]"
                onMouseLeave={() => setXlsOpen(false)}
              >
                <button onClick={() => { exportFleet(); setXlsOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-green-700 hover:bg-green-50 font-medium">
                  <Download size={14} />تصدير الأسطول الشامل
                </button>
                <button onClick={() => { exportDocs(); setXlsOpen(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-teal-700 hover:bg-teal-50 font-medium">
                  <Download size={14} />تصدير الوثائق
                </button>
                <div className="border-t border-gray-100" />
                <button onClick={() => { importFileRef.current?.click(); setXlsOpen(false); }} disabled={importing}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-purple-700 hover:bg-purple-50 font-medium disabled:opacity-60">
                  <Upload size={14} />{importing ? "جاري الاستيراد..." : "استيراد من إكسل"}
                </button>
              </div>
            )}
          </div>
          <button onClick={() => { setAddForm({ status: "available" }); setAddError(""); setAddOpen(true); }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700">
            + إضافة سيارة
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />تحديث
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`بحث بالرقم أو النوع أو الموديل أو الجهة... (${vehicles.length} سيارة)`}
          className="w-full pr-9 pl-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>

      {/* Notification strip — fleet load requests */}
      {notifs.length > 0 && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-orange-700 mb-1">
            <Bell size={13} />
            <span>إشعارات طلبات الحمولة — اضغط لعرض السيارة</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {notifs.map(n => (
              <button
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-orange-200 rounded-xl text-xs font-semibold text-orange-800 hover:bg-orange-100 transition-colors shadow-sm"
              >
                <Package size={11} />
                <span>{n.title}</span>
                <X size={10} className="text-orange-400 mr-0.5" onClick={e => { e.stopPropagation(); markRead(n.id); }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Type filter buttons */}
      {vehicleTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
              typeFilter === "all"
                ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
            }`}
          >
            الكل
            <span className={`text-xs tabular-nums font-black ${typeFilter === "all" ? "text-white/80" : "text-gray-400"}`}>
              {vehicles.length}
            </span>
          </button>
          {vehicleTypes.map(t => {
            const count = vehicles.filter(v => {
              const vt = v.types && v.types.length > 0 ? v.types.map(x => x.type_name) : (v.vehicle_type ? [v.vehicle_type] : []);
              return vt.includes(t.name);
            }).length;
            const active = typeFilter === t.name;
            return (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.name)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  active
                    ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
                <span className={`text-xs tabular-nums font-black ${active ? "text-white/80" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Vehicle Table */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">لا توجد سيارات</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="bg-[#103c68] text-white text-xs">
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap">اللوحة</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap">الاسم / النوع</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap">فرع الشركة</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap">السائق</th>
                <th className="px-3 py-3 text-right font-bold whitespace-nowrap">الحالة</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap" title="التأمين">🛡️ تأمين</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap" title="الفحص الدوري">🔧 فحص</th>
                <th className="px-3 py-3 text-center font-bold whitespace-nowrap" title="كرت التشغيل">📄 تشغيل</th>
                <th className="px-3 py-3 text-right font-bold">الملاحظات</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, idx) => {
                const hasAlert = DOC_TYPES.some(dt => {
                  const st = getDocStatus(v.compliance?.[dt.key]);
                  return st === "expired" || st === "expiring";
                });
                const rowBg = hasAlert
                  ? "bg-orange-50 hover:bg-orange-100"
                  : idx % 2 === 0 ? "bg-white hover:bg-blue-50" : "bg-gray-50/60 hover:bg-blue-50";

                return (
                  <tr key={v.plate_number}
                    onClick={() => openVehicle(v)}
                    className={`cursor-pointer transition-colors border-b border-gray-100 last:border-0 ${rowBg}`}>

                    {/* اللوحة */}
                    <td className="px-3 py-2.5 font-black font-mono text-gray-900 whitespace-nowrap">
                      {hasAlert && <span className="text-orange-500 ml-1">⚠️</span>}
                      {v.plate_number}
                    </td>

                    {/* الاسم / النوع */}
                    <td className="px-3 py-2.5">
                      {v.vehicle_name && (
                        <div className="font-semibold text-blue-700 text-xs leading-tight">{v.vehicle_name}</div>
                      )}
                      {v.types && v.types.length > 0 ? (
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {v.types.map(t => (
                            <span key={t.type_name}
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${t.is_primary ? "bg-[#103c68]/10 text-[#103c68]" : "bg-gray-100 text-gray-500"}`}>
                              {t.is_primary ? "★ " : ""}{t.type_name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">{v.vehicle_type || "—"}</div>
                      )}
                    </td>

                    {/* الجهة */}
                    <td className="px-3 py-2.5 text-xs text-indigo-700 font-medium whitespace-nowrap">
                      {v.branch || <span className="text-gray-300">—</span>}
                    </td>

                    {/* السائق */}
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap max-w-[120px] truncate">
                      {v.driver_name || <span className="text-gray-300">—</span>}
                    </td>

                    {/* الحالة */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(STATUS_MAP[v.status||"available"] || STATUS_MAP.available).cls}`}>
                        {(STATUS_MAP[v.status||"available"] || STATUS_MAP.available).label}
                      </span>
                    </td>

                    {/* وثائق — عمود لكل نوع */}
                    {DOC_TYPES.map(dt => {
                      const st = getDocStatus(v.compliance?.[dt.key]);
                      const cfg = DOC_STATUS_CFG[st];
                      const doc = v.compliance?.[dt.key];
                      const daysLeft = doc?.end_date
                        ? Math.floor((new Date(doc.end_date).getTime() - Date.now()) / 86400000)
                        : null;
                      return (
                        <td key={dt.key} className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => { openVehicle(v); setTimeout(() => setTab("docs"), 50); }}
                            className="flex flex-col items-center gap-0.5 mx-auto group"
                            title={`${dt.label}: ${cfg.label}${daysLeft !== null ? ` (${daysLeft} يوم)` : ""}`}>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            {daysLeft !== null && (st === "expiring" || st === "expired") && (
                              <span className="text-[9px] text-gray-400">{daysLeft}ي</span>
                            )}
                          </button>
                        </td>
                      );
                    })}

                    {/* الملاحظات */}
                    <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[180px]">
                      <span className="line-clamp-2">{v.notes || <span className="text-gray-200">—</span>}</span>
                    </td>

                    {/* أزرار الصف */}
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); openVehicle(v); }}
                          className="text-xs text-blue-500 hover:text-blue-700 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                          تعديل
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); void generateVehiclePdf(v); }}
                          disabled={!!pdfGeneratingPlate}
                          title={`إنشاء ملف PDF للسيارة ${v.plate_number}`}
                          aria-label={`إنشاء ملف PDF للسيارة ${v.plate_number}`}
                          className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-wait">
                          {pdfGeneratingPlate === v.plate_number
                            ? <RefreshCw size={12} className="animate-spin" />
                            : <FileText size={12} />}
                          {pdfGeneratingPlate === v.plate_number ? "جارٍ..." : "PDF"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Doc legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {Object.entries(DOC_STATUS_CFG).map(([k, cfg]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block ${cfg.dot}`} />{cfg.label}
          </span>
        ))}
      </div>

      {/* ── Add Vehicle Modal ── */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900">إضافة سيارة جديدة</h2>
              <button onClick={() => setAddOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">رقم اللوحة *</label>
                  <input value={addForm.plate_number || ""} onChange={e => {
                    const val = e.target.value;
                    setAddForm(f => ({ ...f, plate_number: val }));
                    const dup = vehicles.find(v => v.plate_number.trim() === val.trim());
                    setAddError(dup ? "رقم اللوحة مسجّل مسبقاً في دفتر السيارات" : "");
                  }}
                    placeholder="مثال: أ ب ج 1234"
                    className={`w-full px-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 font-mono ${addError && addForm.plate_number ? "border-red-400 focus:ring-red-300 bg-red-50" : "border-gray-200 focus:ring-blue-400"}`} />
                  {addError && <p className="text-red-600 text-xs mt-1 font-semibold">⚠️ {addError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم السيارة</label>
                  <input value={addForm.vehicle_name || ""} onChange={e => setAddForm(f => ({ ...f, vehicle_name: e.target.value }))}
                    placeholder="اسم مميز (اختياري)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">نوع السيارة</label>
                  <input list="add-vt-list" value={addForm.vehicle_type || ""} onChange={e => setAddForm(f => ({ ...f, vehicle_type: e.target.value }))}
                    placeholder="اختر أو اكتب"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <datalist id="add-vt-list">{VEH_TYPES.map(t => <option key={t} value={t} />)}</datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">فرع الشركة *</label>
                <select value={addForm.branch || ""} onChange={e => setAddForm(f => ({ ...f, branch: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— اختر فرع الشركة —</option>
                  {companyBranches.map(branch => <option key={branch.id} value={branch.entity_name}>{branch.entity_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الحالة</label>
                <select value={addForm.status || "available"} onChange={e => setAddForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">👤 السائق الأساسي</label>
                <select value={addForm.driver_name || ""}
                  onChange={e => {
                    const driver = drivers.find(d => d.driver_name === e.target.value);
                    setAddForm(f => ({ ...f, driver_name: e.target.value, driver_phone: driver?.phone || "" }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— بدون سائق —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.driver_name}>{d.driver_name}{d.phone ? ` (${d.phone})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">👥 السائق الاحتياطي</label>
                <select value={addForm.backup_driver_name || ""}
                  onChange={e => {
                    const driver = drivers.find(d => d.driver_name === e.target.value);
                    setAddForm(f => ({ ...f, backup_driver_name: e.target.value, backup_driver_phone: driver?.phone || "" }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">— بدون سائق احتياطي —</option>
                  {drivers.filter(d => d.driver_name !== addForm.driver_name).map(d => (
                    <option key={d.id} value={d.driver_name}>{d.driver_name}{d.phone ? ` (${d.phone})` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-600 mb-2">🔗 التيدارات المرتبطة</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 p-3 bg-gray-50">
                  {teidarat.length === 0 ? (
                    <p className="text-xs text-gray-400">لا توجد تيدارات مسجلة</p>
                  ) : teidarat.map(t => {
                    const id = String(t.id);
                    const checked = addLinkedTeidaraIds.includes(id);
                    const linkedElsewhere = !!t.vehicle_plate && t.vehicle_plate !== addForm.plate_number;
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-xs bg-white rounded-lg border border-gray-100 px-3 py-2 cursor-pointer">
                        <input type="checkbox" checked={checked}
                          onChange={e => setAddLinkedTeidaraIds(ids => e.target.checked ? [...ids, id] : ids.filter(x => x !== id))} />
                        <span className="font-bold">{t.teidara_number || `تيدار #${t.seq_no}`}</span>
                        {linkedElsewhere && <span className="mr-auto text-[10px] text-amber-600">مرتبط حاليًا: {t.vehicle_plate}</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-gray-400">اختيار تيدار مرتبط بسيارة أخرى ينقله إلى هذه السيارة عند الحفظ.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">وزن فارغة (كجم)</label>
                <input type="number" min="0" value={addForm.empty_weight_kg || ""}
                  onChange={e => setAddForm(f => ({ ...f, empty_weight_kg: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الحمولة القصوى (كجم)</label>
                <input type="number" min="0" value={addForm.max_weight_kg || ""}
                  onChange={e => setAddForm(f => ({ ...f, max_weight_kg: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setAddOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={addVehicle} disabled={addSaving || !addForm.plate_number?.trim() || !addForm.branch || !!addError}
                className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
                {addSaving ? "جاري الحفظ..." : "إضافة السيارة"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vehicle Modal ── */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: "92vh" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <div className="font-black text-gray-900 text-lg font-mono">{selected.plate_number}</div>
                <div className="text-sm text-gray-500">{selected.vehicle_name || selected.vehicle_type || "سيارة"}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-4 pt-3 border-b border-gray-100 pb-3 flex-shrink-0">
              {([["info","✏️ بيانات السيارة"],["photos","📸 الصور"],["docs","📄 الوثائق الرسمية"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${tab === k ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-5 py-5 space-y-5">
              <label className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.show_cargo_photo !== 0}
                  onChange={e => void setCargoPhotoVisibility(selected, e.target.checked)}
                  aria-label={`إظهار كرت صورة الحمولة للسائق في السيارة ${selected.plate_number}`}
                />
                إظهار كرت صورة الحمولة للسائق
              </label>

              {/* ─ Info tab ─ */}
              {tab === "info" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">رقم اللوحة</label>
                      <input value={editForm.new_plate_number || ""}
                        onChange={e => setEditForm(f => ({ ...f, new_plate_number: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">اسم السيارة</label>
                      <input value={editForm.vehicle_name || ""}
                        onChange={e => setEditForm(f => ({ ...f, vehicle_name: e.target.value }))}
                        placeholder="اسم مميز..."
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>
                  {/* أنواع السيارة — multi-select + primary */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-2">أنواع السيارة</label>
                    <div className="flex flex-wrap gap-2">
                      {vehicleTypes.map(t => {
                        const sel = editTypes.includes(t.name);
                        const isPrimary = editPrimaryType === t.name;
                        return (
                          <div key={t.id} className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (sel) {
                                  const next = editTypes.filter(x => x !== t.name);
                                  setEditTypes(next);
                                  if (isPrimary) setEditPrimaryType(next[0] || "");
                                } else {
                                  const next = [...editTypes, t.name];
                                  setEditTypes(next);
                                  if (next.length === 1) setEditPrimaryType(t.name);
                                }
                              }}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                sel ? "bg-[#103c68] text-white border-[#103c68]" : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
                              }`}
                            >
                              <span>{t.icon}</span><span>{t.name}</span>
                            </button>
                            {sel && (
                              <button
                                type="button"
                                onClick={() => setEditPrimaryType(t.name)}
                                title="تعيين كنوع أساسي"
                                className={`px-1.5 py-1 rounded-lg text-sm transition-all ${
                                  isPrimary ? "text-yellow-500 bg-yellow-50 border border-yellow-300" : "text-gray-300 hover:text-yellow-500 border border-transparent"
                                }`}
                              >★</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {editPrimaryType && editTypes.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1.5">النوع الأساسي: <span className="font-semibold text-[#103c68]">{editPrimaryType}</span></p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">الحالة</label>
                    <select value={editForm.status || "available"}
                      onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                      {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">👤 السائق الأساسي</label>
                    <select value={editForm.driver_name || ""}
                      onChange={e => {
                        const name = e.target.value;
                        const d = drivers.find(d => d.driver_name === name);
                        setEditForm(f => ({ ...f, driver_name: name, driver_phone: d?.phone || "" }));
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">— بدون سائق —</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.driver_name}>{d.driver_name}{d.phone ? ` (${d.phone})` : ""}</option>
                      ))}
                    </select>
                    {/* رقم جوال السائق — يُسحب من إدارة السائقين */}
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-gray-500 whitespace-nowrap shrink-0">📱 الجوال:</label>
                      <input
                        type="tel"
                        value={editForm.driver_phone || ""}
                        onChange={e => setEditForm(f => ({ ...f, driver_phone: e.target.value }))}
                        placeholder={editForm.driver_name ? "غير مسجّل في إدارة السائقين" : "—"}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
                      />
                      {editForm.driver_phone && (
                        <a href={`tel:${editForm.driver_phone}`}
                          className="shrink-0 text-green-600 hover:text-green-700 text-xs font-semibold px-2 py-1.5 bg-green-50 rounded-xl border border-green-200"
                          title="اتصال">
                          📞
                        </a>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">👥 السائق الاحتياطي</label>
                    <select value={editForm.backup_driver_name || ""}
                      onChange={e => {
                        const name = e.target.value;
                        const d = drivers.find(d => d.driver_name === name);
                        setEditForm(f => ({ ...f, backup_driver_name: name, backup_driver_phone: d?.phone || "" }));
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">— بدون سائق احتياطي —</option>
                      {drivers.filter(d => d.driver_name !== editForm.driver_name).map(d => (
                        <option key={d.id} value={d.driver_name}>{d.driver_name}{d.phone ? ` (${d.phone})` : ""}</option>
                      ))}
                    </select>
                    {editForm.backup_driver_phone && (
                      <p className="mt-2 text-xs text-gray-500">📱 {editForm.backup_driver_phone}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">فرع الشركة</label>
                    <select value={editForm.branch || ""}
                      onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">— اختر فرع الشركة —</option>
                      {companyBranches.map(branch => <option key={branch.id} value={branch.entity_name}>{branch.entity_name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 mb-2">🔗 التيدارات المرتبطة بهذه السيارة</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto rounded-xl border border-gray-200 p-3 bg-gray-50">
                      {teidarat.length === 0 ? (
                        <p className="text-xs text-gray-400">لا توجد تيدارات مسجلة</p>
                      ) : teidarat.map(t => {
                        const id = String(t.id);
                        const checked = editLinkedTeidaraIds.includes(id);
                        const linkedElsewhere = !!t.vehicle_plate && t.vehicle_plate !== selected.plate_number;
                        return (
                          <label key={t.id} className={`flex items-center gap-2 text-xs rounded-lg border px-3 py-2 cursor-pointer ${checked ? "bg-blue-50 border-blue-200" : "bg-white border-gray-100"}`}>
                            <input type="checkbox" checked={checked}
                              onChange={e => {
                                setEditTeidaraLinksTouched(true);
                                setEditLinkedTeidaraIds(ids => e.target.checked ? [...ids, id] : ids.filter(x => x !== id));
                              }} />
                            <span className="font-bold">{t.teidara_number || `تيدار #${t.seq_no}`}</span>
                            <span className="text-gray-400">{t.teidara_type || ""}</span>
                            {linkedElsewhere && <span className="mr-auto text-[10px] text-amber-600">مرتبط حاليًا: {t.vehicle_plate}</span>}
                          </label>
                        );
                      })}
                    </div>
                    {(selected.unresolved_teidara_links || []).length > 0 && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold text-amber-800">روابط قديمة محفوظة وغير موجودة في سجل التيدارات:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {selected.unresolved_teidara_links!.map((link, index) => (
                            <span key={`${link.source}-${link.value}-${index}`} className="rounded-lg bg-white px-2 py-1 text-xs text-amber-700 border border-amber-200">
                              {link.source === "number" ? `رقم ${link.value}` : `معرّف #${link.value}`}
                            </span>
                          ))}
                        </div>
                        <button type="button"
                          onClick={() => setEditTeidaraLinksTouched(true)}
                          className="mt-2 text-[11px] font-bold text-red-600 hover:underline">
                          إزالة الروابط القديمة غير المحسومة عند الحفظ
                        </button>
                        {!editTeidaraLinksTouched && (
                          <p className="mt-1 text-[10px] text-amber-600">ستظل محفوظة كما هي ما لم تضغط إزالة أو تعدّل اختيار التيدارات.</p>
                        )}
                      </div>
                    )}
                    <p className="mt-1 text-[11px] text-gray-400">الروابط القديمة ظاهرة تلقائيًا ويمكن تعديلها من هنا فقط.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">ملاحظات</label>
                    <textarea value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="أي ملاحظات..." style={{ resize: "none" }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">⚖️ وزن السيارة فارغة (كجم)</label>
                      <input type="number" min="0" value={editForm.empty_weight_kg || ""}
                        onChange={e => setEditForm(f => ({ ...f, empty_weight_kg: e.target.value }))}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">🏋️ الحمولة القصوى (كجم)</label>
                      <input type="number" min="0" value={editForm.max_weight_kg || ""}
                        onChange={e => setEditForm(f => ({ ...f, max_weight_kg: e.target.value }))}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                  </div>
                  {/* ── Active trip panel (on_trip vehicles) ── */}
                  {(selected.status === "on_trip" || selected.status === "busy") && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-blue-800">
                        <Truck size={15} className="flex-shrink-0" />
                        <span>الرحلة النشطة</span>
                        {loadingOrder && <RefreshCw size={12} className="animate-spin text-blue-500 mr-auto" />}
                      </div>
                      {activeOrder ? (
                        <>
                          <div className="bg-white rounded-lg px-3 py-2.5 text-xs space-y-1 border border-blue-100">
                            <div className="font-mono font-bold text-[#103c68]">{activeOrder.order_number}</div>
                            <div className="text-gray-700">{activeOrder.customer_name} — {activeOrder.product_name}</div>
                            <div className="text-gray-400">الكمية: {activeOrder.quantity} | الحالة: {activeOrder.stage}</div>
                            {activeOrder.driver_name && <div className="text-gray-500">السائق: {activeOrder.driver_name}</div>}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setSwapOpen(true)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors">
                              <ArrowLeftRight size={13} />تبديل السيارة
                            </button>
                            <button onClick={() => setCancelOpen(true)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-colors">
                              <OctagonX size={13} />إلغاء الرحلة
                            </button>
                          </div>
                        </>
                      ) : !loadingOrder ? (
                        <p className="text-xs text-blue-500">لا يوجد طلب نشط مسجّل لهذه السيارة حالياً</p>
                      ) : null}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={saveVehicle} disabled={saving || !editForm.new_plate_number?.trim()}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      <Save size={15} />{saving ? "جاري الحفظ..." : "حفظ البيانات"}
                    </button>
                    <button onClick={deleteVehicle}
                      className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl font-semibold hover:bg-red-100 transition-colors border border-red-200">
                      <Trash2 size={14} />حذف
                    </button>
                  </div>
                </div>
              )}

              {/* ─ Photos tab ─ */}
              {tab === "photos" && (
                <div className="space-y-4">
                  {/* Upload form */}
                  <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/40 p-4 space-y-3">
                    <p className="text-xs font-bold text-blue-700">+ رفع صورة جديدة</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">زاوية التصوير</label>
                        <select value={vImgAngle} onChange={e => setVImgAngle(e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                          {Object.entries(ANGLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div className="flex items-end">
                        <input type="file" accept="image/*" ref={vImgFileRef}
                          className="w-full text-xs text-gray-500 file:ml-1 file:py-1 file:px-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs file:font-semibold hover:file:bg-blue-700 cursor-pointer" />
                      </div>
                    </div>
                    <button onClick={() => { const file = vImgFileRef.current?.files?.[0]; if (!file || !selected) return; uploadVehicleImage(selected.plate_number, vImgAngle, file); }}
                      disabled={vImgUploading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40">
                      <Upload size={12} />{vImgUploading ? "جاري الرفع..." : "رفع الصورة"}
                    </button>
                  </div>

                  {/* Images grid */}
                  {vehicleImages.length === 0
                    ? <div className="text-center py-8 text-gray-400 text-sm">لا توجد صور بعد</div>
                    : (
                      <div className="grid grid-cols-2 gap-3">
                        {vehicleImages.map(img => (
                          <div key={img.id} className="relative group rounded-xl overflow-hidden border border-gray-100 shadow-sm">
                            <img src={getVehicleAttachmentHref(img.image_url)} alt={ANGLE_LABELS[img.angle] || img.angle}
                              className="w-full h-32 object-cover" />
                            <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 flex items-center justify-between">
                              <span>{ANGLE_LABELS[img.angle] || img.angle}</span>
                              <button onClick={() => deleteVehicleImage(img.id)} title="حذف الصورة"
                                aria-label={`حذف صورة ${ANGLE_LABELS[img.angle] || img.angle}`}
                                className="rounded-full bg-red-600/90 p-1.5 text-white hover:bg-red-700 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {/* ─ Docs tab ─ */}
              {tab === "docs" && (
                <div className="space-y-4">

                  {/* ─ Add new doc form ─ */}
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-2">
                    <p className="text-xs font-bold text-gray-600 mb-1">+ إضافة وثيقة جديدة</p>
                    <input value={newDoc.doc_type} onChange={e => setNewDoc(f => ({ ...f, doc_type: e.target.value }))}
                      placeholder="اسم الوثيقة (مثال: رخصة، تصريح، ضمان...)"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    <input type="file" accept="image/*,application/pdf" ref={newDocFileRef}
                      onChange={e => setNewDoc(f => ({ ...f, file: e.target.files?.[0] || null }))}
                      className="w-full text-xs text-gray-500 file:ml-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs file:font-semibold hover:file:bg-blue-700 cursor-pointer" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">تاريخ البداية</label>
                        <input type="date" value={newDoc.start_date} onChange={e => setNewDoc(f => ({ ...f, start_date: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">تاريخ الانتهاء</label>
                        <input type="date" value={newDoc.end_date} onChange={e => setNewDoc(f => ({ ...f, end_date: e.target.value }))}
                          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                      </div>
                    </div>
                    <input value={newDoc.notes} onChange={e => setNewDoc(f => ({ ...f, notes: e.target.value }))}
                      placeholder="ملاحظات (اختياري)"
                      className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                    <button onClick={uploadNewDoc} disabled={!newDoc.doc_type.trim() || newDoc.uploading}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                      <Upload size={12} />{newDoc.uploading ? "جاري الرفع..." : "حفظ الوثيقة"}
                    </button>
                  </div>

                  {directVehicleAttachments.length > 0 && (
                    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                      <p className="text-xs font-bold text-gray-700">مرفقات محفوظة مباشرة في ملف السيارة</p>
                      {directVehicleAttachments.map(([field, url]) => {
                        const label = getVehicleAttachmentLabel(field);
                        return (
                          <div key={field} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                            <span className="text-sm font-medium text-gray-800">{label}</span>
                            <div className="flex items-center gap-3 shrink-0">
                              <a href={getVehicleAttachmentHref(url)} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                                <Eye size={12} />عرض
                              </a>
                              <button onClick={() => deleteDirectVehicleAttachment(field, label)} title="حذف المرفق"
                                aria-label={`حذف ${label}`} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─ Custom docs (non-standard types) ─ */}
                  {vehicleDocs.filter(d => !DOC_TYPES.some(dt => dt.key === d.doc_type)).map(d => (
                    <div key={d.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-gray-900 text-sm">{d.doc_type}</div>
                        {(d.start_date || d.end_date) && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {d.start_date ? `من: ${d.start_date}` : ""}{d.end_date ? ` — إلى: ${d.end_date}` : ""}
                          </div>
                        )}
                        {d.notes && <div className="text-xs text-gray-400 italic mt-0.5">{d.notes}</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {d.image_url && (
                          <a href={getVehicleAttachmentHref(d.image_url)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold">
                            <Eye size={11} />عرض
                          </a>
                        )}
                        <button onClick={() => deleteVehicleComplianceDocument(d, `وثيقة ${d.doc_type}`)}
                          title="حذف الوثيقة" aria-label={`حذف وثيقة ${d.doc_type}`}
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {DOC_TYPES.map(dt => {
                    const docsOfType = vehicleDocs
                      .filter(d => d.doc_type === dt.key)
                      .sort((a, b) => b.created_at.localeCompare(a.created_at));
                    const latestDoc = docsOfType[0];
                    const st  = getDocStatus(latestDoc);
                    const cfg = DOC_STATUS_CFG[st];
                    const form = docForms[dt.key] || EMPTY_DOC_FORM;
                    const Icon = dt.icon;
                    const canUpload = !!(form.file || form.start_date || form.end_date);

                    return (
                      <div key={dt.key} className={`rounded-xl border p-4 ${cfg.card} ${cfg.border}`}>
                        {/* Doc header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Icon size={16} className="text-gray-600" />
                            <span className="font-bold text-gray-900">{dt.label}</span>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                        </div>

                        {/* Current doc */}
                        {latestDoc && (
                          <div className="mb-3 bg-white rounded-lg px-3 py-2.5 border border-gray-100 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-gray-700">أحدث وثيقة</span>
                              <button onClick={() => deleteVehicleComplianceDocument(latestDoc, dt.label)}
                                title="حذف الوثيقة" aria-label={`حذف أحدث وثيقة ${dt.label}`}
                                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {latestDoc.start_date && <div className="text-gray-500">من: <span className="font-semibold text-gray-700">{latestDoc.start_date}</span></div>}
                            {latestDoc.end_date && (
                              <div className={`font-semibold ${st === "expired" ? "text-red-600" : st === "expiring" ? "text-orange-600" : "text-green-700"}`}>
                                إلى: {latestDoc.end_date}
                                {st !== "missing" && st !== "uploaded" && (() => {
                                  const d = Math.floor((new Date(latestDoc.end_date!).getTime() - Date.now()) / 86400000);
                                  return d >= 0 ? ` (${d} يوم متبقي)` : ` (انتهت منذ ${Math.abs(d)} يوم)`;
                                })()}
                              </div>
                            )}
                            {latestDoc.notes && <div className="text-gray-400 italic">{latestDoc.notes}</div>}
                            {latestDoc.image_url && (
                              <a href={getVehicleAttachmentHref(latestDoc.image_url)} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline font-semibold">
                                <Eye size={11} />عرض الوثيقة
                              </a>
                            )}
                          </div>
                        )}

                        {docsOfType.slice(1).map((doc, index) => (
                          <div key={doc.id} className="mb-2 rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-gray-600">نسخة سابقة {index + 1}</span>
                              <button onClick={() => deleteVehicleComplianceDocument(doc, `نسخة سابقة من ${dt.label}`)}
                                title="حذف النسخة السابقة" aria-label={`حذف نسخة سابقة من ${dt.label}`}
                                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700">
                                <Trash2 size={14} />
                              </button>
                            </div>
                            {doc.start_date && <div className="text-gray-500">من: <span className="font-semibold text-gray-700">{doc.start_date}</span></div>}
                            {doc.end_date && <div className="font-semibold text-gray-600">إلى: {doc.end_date}</div>}
                            {doc.notes && <div className="text-gray-400 italic">{doc.notes}</div>}
                            {doc.image_url && (
                              <a href={getVehicleAttachmentHref(doc.image_url)} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline font-semibold">
                                <Eye size={11} />عرض الوثيقة
                              </a>
                            )}
                          </div>
                        ))}

                        {/* Upload form */}
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-gray-500">{latestDoc ? "رفع وثيقة محدّثة:" : "رفع الوثيقة:"}</p>

                          <input type="file" accept="image/*,application/pdf"
                            ref={el => { fileRefs.current[dt.key] = el; }}
                            onChange={e => setDocField(dt.key, "file", e.target.files?.[0] || null)}
                            className="w-full text-xs text-gray-500 file:ml-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-xs file:font-semibold hover:file:bg-blue-700 cursor-pointer" />

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">تاريخ البداية</label>
                              <input type="date" value={form.start_date}
                                onChange={e => setDocField(dt.key, "start_date", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">تاريخ الانتهاء</label>
                              <input type="date" value={form.end_date}
                                onChange={e => setDocField(dt.key, "end_date", e.target.value)}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
                            </div>
                          </div>

                          <input value={form.notes} onChange={e => setDocField(dt.key, "notes", e.target.value)}
                            placeholder="ملاحظات (اختياري)"
                            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />

                          <button onClick={() => uploadDoc(dt.key)} disabled={!canUpload || form.uploading}
                            className="w-full flex items-center justify-center gap-1.5 py-2 bg-gray-800 text-white text-xs font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
                            <Upload size={12} />{form.uploading ? "جاري الرفع..." : "حفظ الوثيقة"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}


            </div>
          </div>
        </div>
      )}

      {/* ── Swap Vehicle Modal ── */}
      {swapOpen && activeOrder && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-black text-gray-900 flex items-center gap-2">
                <ArrowLeftRight size={16} className="text-orange-500" />تبديل السيارة
              </h2>
              <button onClick={() => setSwapOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-orange-50 rounded-xl px-4 py-3 text-xs text-orange-800 space-y-1 border border-orange-100">
                <div className="font-bold">الطلب: {activeOrder.order_number}</div>
                <div>{activeOrder.customer_name} — {activeOrder.product_name}</div>
                <div>السيارة الحالية: <span className="font-mono font-bold">{selected?.plate_number}</span></div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">السيارة الجديدة *</label>
                <select value={swapVehicleId} onChange={e => setSwapVehicleId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">— اختر سيارة —</option>
                  {vehicles
                    .filter(v => v.plate_number !== selected?.plate_number && (v.status === "available" || !v.status))
                    .map(v => (
                      <option key={v.plate_number} value={v.id}>
                        {v.plate_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ""}{v.vehicle_type ? ` (${v.vehicle_type})` : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">السائق الجديد (اختياري)</label>
                <select value={swapDriverPhone} onChange={e => setSwapDriverPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400">
                  <option value="">— نفس السائق أو بدون تغيير —</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.phone || ""}>{d.driver_name}{d.phone ? ` (${d.phone})` : ""}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3">
              <button onClick={() => setSwapOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
              <button onClick={doSwapVehicle} disabled={swapSaving || !swapVehicleId}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                <ArrowLeftRight size={14} />{swapSaving ? "جاري التبديل..." : "تأكيد التبديل"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Trip Modal ── */}
      {cancelOpen && activeOrder && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <div>
                <h2 className="font-black text-gray-900 text-lg mb-1">إلغاء الرحلة</h2>
                <p className="text-sm text-gray-500 font-mono font-bold text-[#103c68]">{activeOrder.order_number}</p>
                <p className="text-sm text-gray-600 mt-1">{activeOrder.customer_name} — {activeOrder.product_name}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 text-right">سبب الإلغاء (اختياري)</label>
                <input value={cancelReason} onChange={e => setCancelReason(e.target.value)}
                  placeholder="إلغاء الرحلة من قِبَل الإدارة"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <p className="text-xs text-gray-400">سيتم تحرير السيارة وإلغاء الطلب نهائياً وإشعار العميل.</p>
              <div className="flex gap-3">
                <button onClick={() => { setCancelOpen(false); setCancelReason(""); }}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">إلغاء</button>
                <button onClick={doCancelTrip} disabled={cancelSaving}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                  <OctagonX size={14} />{cancelSaving ? "جاري الإلغاء..." : "إلغاء الرحلة"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {vehiclePdfPreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3 sm:p-6"
          dir="rtl"
          onMouseDown={event => { if (event.target === event.currentTarget) setVehiclePdfPreview(null); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={vehiclePdfPreview.title}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
          >
            <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-gray-100">
              <div className="min-w-0">
                <h2 className="font-black text-gray-900 truncate">{vehiclePdfPreview.title}</h2>
                <p className="text-xs text-gray-500 mt-0.5">يمكنك معاينة الملف أو تنزيله أو مشاركته أو طباعته</p>
              </div>
              <button
                onClick={() => setVehiclePdfPreview(null)}
                aria-label="إغلاق معاينة PDF"
                className="shrink-0 p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex flex-wrap gap-2 px-4 sm:px-6 py-3 border-b border-gray-100">
              <a
                href={vehiclePdfPreview.url}
                download={vehiclePdfPreview.file.name}
                className="inline-flex items-center gap-2 rounded-lg bg-[#103c68] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0b2f54]"
              >
                <Download size={15} />تنزيل PDF
              </a>
              <button
                onClick={async () => {
                  const canShareFile = typeof navigator.share === "function"
                    && (typeof navigator.canShare !== "function" || navigator.canShare({ files: [vehiclePdfPreview.file] }));
                  if (!canShareFile) {
                    alert("المشاركة المباشرة غير مدعومة في هذا المتصفح. نزّل الملف ثم شاركه من جهازك.");
                    return;
                  }
                  try {
                    await navigator.share({
                      files: [vehiclePdfPreview.file],
                      title: vehiclePdfPreview.title,
                      text: vehiclePdfPreview.title,
                    });
                  } catch (error) {
                    if (!(error instanceof DOMException && error.name === "AbortError")) {
                      alert("تعذرت مشاركة الملف. يمكنك تنزيله ومشاركته من جهازك.");
                    }
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Share2 size={15} />مشاركة
              </button>
              <button
                onClick={() => {
                  const printWindow = window.open(vehiclePdfPreview.url, "_blank");
                  if (!printWindow) {
                    alert("اسمح بفتح نافذة جديدة لعرض الملف وطباعته.");
                    return;
                  }
                  window.setTimeout(() => {
                    try {
                      printWindow.focus();
                      printWindow.print();
                    } catch {
                      // The browser's PDF viewer remains available in the opened tab.
                    }
                  }, 900);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Printer size={15} />طباعة
              </button>
            </div>
            <iframe
              src={vehiclePdfPreview.url}
              title={vehiclePdfPreview.title}
              className="min-h-0 flex-1 w-full bg-gray-100"
            />
          </section>
        </div>
      )}
    </div>
  );
}
