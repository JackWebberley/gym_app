"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

/// Five destinations, not ten. The original bar listed every screen in the app,
/// which put the things you open daily — today's food and the next workout —
/// beside setup screens you touch once a month. Groups, cycles, exercises, goals
/// and history live behind "More".
///
/// Meals earns a tab despite planning being a weekly job rather than a daily one,
/// because it is not one screen: it is a menu, a shop, a pantry and a recipe
/// library. Behind "More" they were a submenu of a submenu, which is a good way
/// to build something nobody can find.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-[22px] w-[22px]"
    >
      {children}
    </svg>
  );
}

const NAV = [
  {
    href: "/",
    label: "Today",
    icon: (
      <Icon>
        <path d="M3 10.4 12 3.2l9 7.2" />
        <path d="M5.6 9.2V20a.9.9 0 0 0 .9.9h11a.9.9 0 0 0 .9-.9V9.2" />
        <path d="M9.8 20.9v-6h4.4v6" />
      </Icon>
    ),
  },
  {
    href: "/train",
    label: "Train",
    icon: (
      <Icon>
        <path d="M6.6 8.2v7.6M4 10.3v3.4M17.4 8.2v7.6M20 10.3v3.4M6.6 12h10.8" />
      </Icon>
    ),
  },
  {
    href: "/food",
    label: "Food",
    icon: (
      <Icon>
        <path d="M3.6 11.4h16.8a8.4 8.4 0 0 1-16.8 0Z" />
        <path d="M2.6 20.4h18.8" />
        <path d="M9.4 7.6c0-1 1-1.5 1-2.5s-1-1.6-1-1.6M14.2 7.6c0-1 1-1.5 1-2.5s-1-1.6-1-1.6" />
      </Icon>
    ),
  },
  {
    href: "/meals",
    label: "Meals",
    // A basket, not another plate: this tab is the week's shop and what it
    // produces, where Food is the day in front of you.
    icon: (
      <Icon>
        <path d="M2.8 9.4h18.4" />
        <path d="M4.9 9.4 6.1 18.6a1.1 1.1 0 0 0 1.1 1h9.6a1.1 1.1 0 0 0 1.1-1l1.2-9.2" />
        <path d="M9.1 3.4 7.3 9.4M14.9 3.4l1.8 6" />
        <path d="M10 13v3.2M14 13v3.2" />
      </Icon>
    ),
  },
  {
    href: "/more",
    label: "More",
    icon: (
      <Icon>
        <rect x="3.6" y="3.6" width="7" height="7" rx="1.6" />
        <rect x="13.4" y="3.6" width="7" height="7" rx="1.6" />
        <rect x="3.6" y="13.4" width="7" height="7" rx="1.6" />
        <rect x="13.4" y="13.4" width="7" height="7" rx="1.6" />
      </Icon>
    ),
  },
];

/**
 * A session lives at /train/[id] but reads as its own mode, so it lights up the
 * Train tab; everything under /food including goals and the library lights up Food.
 */
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline pb-[env(safe-area-inset-bottom)]"
      style={{ background: "var(--veil)", backdropFilter: "var(--blur-veil)" }}
    >
      <div className="mx-auto flex max-w-2xl">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              // Deliberately NOT prefetched. Every route here is force-dynamic, so
              // a prefetch is a full server render against the database — and the
              // bar is on screen everywhere, so all five re-prefetch every time
              // anything invalidates the router cache. One tap of ✕ on a menu was
              // firing eleven renders and locking the main thread parsing them,
              // which is what made the button look dead. `loading.tsx` already
              // covers the wait with a skeleton.
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-micro font-medium tracking-wide no-underline transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:no-underline",
                active ? "text-fg-accent" : "text-fg-muted hover:text-fg-strong",
              )}
            >
              {active ? (
                <span aria-hidden className="absolute inset-x-[34%] top-0 h-0.5 rounded-pill bg-accent" />
              ) : null}
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
