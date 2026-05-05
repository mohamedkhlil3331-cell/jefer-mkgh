interface Column<T> {
  key: keyof T | string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  emptyMessage?: string;
  loading?: boolean;
}

export default function Table<T extends Record<string, unknown>>({
  columns, data, keyField, emptyMessage = "لا توجد بيانات", loading
}: Props<T>) {
  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {columns.map(col => (
              <th key={col.key as string} className={`text-right font-semibold text-muted-foreground px-4 py-3 whitespace-nowrap ${col.className || ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="text-center py-16 text-muted-foreground">{emptyMessage}</td>
            </tr>
          ) : (
            data.map(row => (
              <tr key={String(row[keyField])} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                {columns.map(col => (
                  <td key={col.key as string} className={`px-4 py-3 whitespace-nowrap ${col.className || ""}`}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
