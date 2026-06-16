"use client";

import * as React from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** Runs before paint (injected in <head>) to set the class with no flash. */
export const themeInitScript = `(function(){try{var s=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=s? s==='dark':m;var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`;
export const compactInitScript = `(function(){try{document.documentElement.classList.toggle('compact',localStorage.getItem('compact')==='1');}catch(e){}})();`;

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(getInitialTheme);

  const apply = React.useCallback((t: Theme) => {
    const el = document.documentElement;
    el.classList.toggle("dark", t === "dark");
    el.style.colorScheme = t;
  }, []);

  const setTheme = React.useCallback(
    (t: Theme) => {
      setThemeState(t);
      apply(t);
      try {
        localStorage.setItem("theme", t);
      } catch {
        /* ignore */
      }
    },
    [apply]
  );

  const toggle = React.useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  // Follow the OS only while the user hasn't made an explicit choice.
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) setThemeState(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
