import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, LANGUAGES, type LangCode } from "../i18n/translations";

// ─────────────────────────────────────────────────────────────────────────────
// Language Context
// Provides `t(key)` translation helper + RTL document direction management.
// ─────────────────────────────────────────────────────────────────────────────

interface LanguageContextType {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: string, fallback?: string) => string;
  isRTL: boolean;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextType | null>(null);

const STORAGE_KEY = "mkgh_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    return stored && translations[stored] ? stored : "en";
  });

  const langMeta = LANGUAGES.find((l) => l.code === lang)!;
  const isRTL = langMeta.dir === "rtl";
  const dir = langMeta.dir;

  // Apply RTL to document when language changes
  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
    // Add/remove RTL font for Arabic and Urdu
    if (isRTL) {
      document.documentElement.classList.add("rtl");
    } else {
      document.documentElement.classList.remove("rtl");
    }
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang, dir, isRTL]);

  const setLang = (newLang: LangCode) => setLangState(newLang);

  const t = (key: string, fallback?: string): string => {
    return translations[lang]?.[key] ?? translations.en?.[key] ?? fallback ?? key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
