import { STATUS_LABELS } from "@/lib/api";

interface Props { status: string; }

export default function Badge({ status }: Props) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium status-${status}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
