import { useState, useRef, useEffect } from "react";
import { Bell, Globe, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { LANGUAGES } from "../i18n/translations";

const roleColors: Record<string, string> = {
  customer: "bg-blue-500",
  reviewer: "bg-green-500",
  supervisor: "bg-purple-500",
  driver: "bg-orange-500",
};

interface TopNavProps {
  title: string;
  onMenuToggle: () => void;
}

export default function TopNav({ title, onMenuToggle }: TopNavProps) {
  const { user } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === lang)!;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 lg:px-6 h-16 flex items-center gap-4 shadow-xs">
      {/* Mobile menu — hidden on desktop */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Title */}
      <h1 className="text-base font-semibold text-foreground truncate flex-1">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Notification */}
        <button className="relative p-2 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground hidden sm:flex">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#f97316] rounded-full" />
        </button>

        {/* Language switcher */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setLangOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/8 transition-colors text-muted-foreground hover:text-foreground border border-transparent hover:border-white/10"
            title="Change language"
          >
            <Globe className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs font-medium hidden sm:block max-w-[60px] truncate">{currentLang.name}</span>
            <span className="text-sm">{currentLang.flag}</span>
          </button>

          <AnimatePresence>
            {langOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-48 glass-card-elevated rounded-xl shadow-2xl border border-white/12 overflow-hidden z-50"
                dir="ltr"
              >
                <div className="px-3 pt-3 pb-1.5">
                  <p className="text-[10px] text-muted-foreground font-semibold tracking-widest uppercase flex items-center gap-1.5">
                    <Globe className="w-3 h-3" /> Language
                  </p>
                </div>
                <div className="pb-2">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLang(l.code); setLangOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/8 transition-colors ${lang === l.code ? "text-[#f97316]" : "text-foreground"}`}
                    >
                      <span className="text-base flex-shrink-0">{l.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-none">{l.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{l.nameEn}</p>
                      </div>
                      {lang === l.code && <Check className="w-3.5 h-3.5 text-[#f97316] flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User badge */}
        <div className="flex items-center gap-2.5 ps-2 border-s border-border ms-1">
          <div className="hidden sm:block text-end">
            <p className="text-xs font-medium text-foreground leading-tight">{user?.name}</p>
            <p className="text-[10px] text-muted-foreground">{t(user?.role ?? "customer")}</p>
          </div>
          <div className={`w-8 h-8 rounded-full ${roleColors[user?.role ?? "customer"]} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
            {user?.avatar}
          </div>
        </div>
      </div>
    </header>
  );
}
