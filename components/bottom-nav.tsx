"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Train" },
  { href: "/food", label: "Food" },
  { href: "/groups", label: "Groups" },
  { href: "/cycles", label: "Cycles" },
  { href: "/exercises", label: "Exercises" },
  { href: "/history", label: "History" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline"
      style={{ background: "var(--veil)", backdropFilter: "var(--blur-veil)" }}
    >
      <div className="mx-auto flex max-w-2xl">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex-1 py-3 text-center text-caption font-medium no-underline transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:no-underline",
                active ? "text-fg-strong" : "text-fg-muted hover:text-fg-strong",
              )}
            >
              {item.label}
              {active ? (
                <span className="absolute inset-x-[30%] -top-px h-0.5 rounded-pill bg-accent" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
