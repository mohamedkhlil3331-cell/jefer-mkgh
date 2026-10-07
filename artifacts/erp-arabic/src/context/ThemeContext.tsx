import { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "eye-care";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "light", setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try { return (localStorage.getItem("app-theme") as Theme) || "light"; }
    catch { return "light"; }
  });

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem("app-theme", t); } catch { /* noop */ }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "eye-care");
    if (theme === "dark") root.classList.add("dark");
    else if (theme === "eye-care") root.classList.add("eye-care");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
