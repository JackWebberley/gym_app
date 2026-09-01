"use client";

import { useEffect, useState } from "react";

/// The design system ships light as `:root` and dark under `[data-theme="dark"]`.
/// Default to whatever the device asks for — a phone in dark mode is the common
/// case in a dimly lit gym — and let an explicit choice override it.

const STORAGE_KEY = "gym-tracker:theme";

/**
 * Runs before first paint so the page never flashes the wrong theme.
 * Kept as a raw string because it must execute ahead of React hydration.
 */
export function ThemeScript() {
  const js = `(function(){try{
var stored=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
var dark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;
if(dark)document.documentElement.setAttribute("data-theme","dark");
}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    setMounted(true);
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // Private browsing; the choice just will not persist.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-pill border border-hairline text-fg-muted transition-[color,background-color,border-color] duration-(--dur-fast) ease-(--ease-standard) hover:bg-sunken hover:text-fg-strong"
    >
      {/* Rendered blank until mounted so the icon cannot contradict the real theme. */}
      <span aria-hidden className="text-[15px] leading-none">
        {mounted ? (isDark ? "☀" : "☾") : ""}
      </span>
    </button>
  );
}
