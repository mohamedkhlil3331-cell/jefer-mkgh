interface Props {
  onSelect: (from: string, to: string) => void;
  className?: string;
}

export function MonthShortcuts({ onSelect, className = '' }: Props) {
  const months: { label: string; from: string; to: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    const mm = String(m + 1).padStart(2, '0');
    const last = new Date(y, m + 1, 0).getDate();
    months.push({
      label: `ش${m + 1}`,
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(last).padStart(2, '0')}`,
    });
  }
  return (
    <div className={`flex gap-1 flex-wrap ${className}`}>
      {months.map(m => (
        <button
          key={m.from}
          type="button"
          onClick={() => onSelect(m.from, m.to)}
          className="px-2 py-0.5 text-xs font-bold rounded-lg bg-gray-100 hover:bg-[#103c68] hover:text-white text-gray-600 transition-colors border border-gray-200 cursor-pointer"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
