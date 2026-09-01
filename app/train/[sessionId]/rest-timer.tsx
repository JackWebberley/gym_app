"use client";

import { useEffect, useState } from "react";

/// The rest timer must survive a screen lock, a backgrounded tab, and a reload
/// (spec §4.2). So the only thing stored is the timestamp it ends at — the
/// countdown is derived on every tick rather than decremented.

const STORAGE_KEY = "gym-tracker:rest-timer";

type RestState = { endsAt: number; label: string; durationSeconds: number };

function read(): RestState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestState;
    return typeof parsed?.endsAt === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export function startRest(durationSeconds: number, label: string) {
  const state: RestState = {
    endsAt: Date.now() + durationSeconds * 1000,
    label,
    durationSeconds,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("rest-timer-change"));
}

function clearRest() {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("rest-timer-change"));
}

export function RestTimerBar() {
  const [state, setState] = useState<RestState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener("rest-timer-change", sync);
    // A tab woken from background may have missed every interval tick.
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("rest-timer-change", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [state]);

  if (!state) return null;

  const remainingMs = state.endsAt - now;
  const remaining = Math.ceil(remainingMs / 1000);
  const isOver = remaining <= 0;
  const elapsedFraction = Math.min(
    1,
    Math.max(0, 1 - remainingMs / (state.durationSeconds * 1000)),
  );

  const minutes = Math.floor(Math.abs(remaining) / 60);
  const seconds = Math.abs(remaining) % 60;
  const display = `${isOver ? "+" : ""}${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-x-0 bottom-[3.15rem] z-10 border-t border-hairline"
      style={{ background: "var(--veil)", backdropFilter: "var(--blur-veil)" }}
    >
      <div
        className="h-0.5 bg-accent transition-[width] duration-(--dur-base) ease-(--ease-standard)"
        style={{ width: `${elapsedFraction * 100}%` }}
      />
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2">
        <span
          className={`font-mono text-body-lg tabular-nums ${isOver ? "text-fg-accent" : "text-fg-strong"}`}
        >
          {display}
        </span>
        <span className="min-w-0 flex-1 truncate text-caption text-fg-muted">
          {isOver ? `Rest over — ${state.label}` : `Resting · ${state.label}`}
        </span>
        <button
          type="button"
          onClick={() => startRest(state.durationSeconds, state.label)}
          className="rounded-pill border border-hairline px-2.5 py-1 text-micro text-fg-muted transition-colors hover:bg-sunken hover:text-fg-strong"
        >
          Restart
        </button>
        <button
          type="button"
          onClick={clearRest}
          className="rounded-pill border border-hairline px-2.5 py-1 text-micro text-fg-muted transition-colors hover:bg-sunken hover:text-fg-strong"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
