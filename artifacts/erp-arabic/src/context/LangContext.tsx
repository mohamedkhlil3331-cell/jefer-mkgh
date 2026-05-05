import { createContext, useContext, useEffect, useState } from "react";
import { type Lang, LANGUAGES, getT } from "@/i18n/translations";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const Ctx = createContext<LangCtx>({
  lang: "ar",
  setLang: () => {},
  t: (key: string) => key,
  dir: "rtl",
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("mkgh_lang") as Lang) || "ar"
  );

  const setLang = (l: Lang) => {
    localStorage.setItem("mkgh_lang", l);
    setLangState(l);
  };

  const langInfo = LANGUAGES.find(x => x.code === lang)!;
  const dir = langInfo?.dir ?? "rtl";

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [lang, dir]);

  const t = getT(lang);

  return <Ctx.Provider value={{ lang, setLang, t, dir }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
