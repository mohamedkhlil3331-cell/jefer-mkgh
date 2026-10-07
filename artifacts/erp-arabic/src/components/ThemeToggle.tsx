import { Sun, Moon, Eye } from "lucide-react";
import { useTheme, type Theme } from "@/context/ThemeContext";

const MODES: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: "light",    icon: Sun,  label: "وضع النهار"   },
  { value: "dark",     icon: Moon, label: "الوضع الليلي" },
  { value: "eye-care", icon: Eye,  label: "حفظ النظر"   },
];

export function ThemeToggleBar() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-slate-700 rounded-xl p-1">
      {MODES.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`p-1.5 rounded-lg transition-all ${
            theme === value
              ? "bg-white dark:bg-slate-600 text-[#103c68] shadow-sm"
              : "text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
          }`}>
          <Icon size={13} />
        </button>
      ))}
    </div>
  );
}

export function ThemeToggleCycle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const idx = MODES.findIndex(m => m.value === theme);
  const current = MODES[idx];
  const next = MODES[(idx + 1) % MODES.length];
  const Icon = current.icon;
  return (
    <button
      onClick={() => setTheme(next.value)}
      title={next.label}
      className={`p-2 rounded-xl hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors ${className}`}>
      <Icon size={16} />
    </button>
  );
}
