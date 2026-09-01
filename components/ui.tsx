import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/// Primitives mirroring the Jack Webberley design system's component library
/// (Button, Card, Tag, Badge, Input, Select). Same variants, sizes and tokens;
/// expressed as Tailwind classes over the CSS variables rather than the inline
/// styles the original bundle uses.

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ── Button ──────────────────────────────────────────────────────────────── */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill font-sans font-medium tracking-tight leading-none whitespace-nowrap no-underline hover:no-underline cursor-pointer transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-(--dur-fast) ease-(--ease-standard) active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

const BUTTON_SIZES = {
  sm: "h-(--control-h-sm) px-3 text-caption",
  md: "h-(--control-h-md) px-4 text-body-sm",
  lg: "h-(--control-h-lg) px-6 text-body-md",
} as const;

const BUTTON_VARIANTS = {
  primary: "bg-inverse text-fg-inverse border border-inverse hover:brightness-125",
  accent: "bg-accent text-paper-0 border border-accent hover:brightness-115",
  secondary: "bg-card text-fg-strong border border-line hover:bg-sunken",
  ghost: "bg-transparent text-fg-strong border border-transparent hover:bg-sunken",
  // Not in the original library — the system supplies --status-danger but no
  // destructive button. Built from that token so it still reads as the same system.
  danger: "bg-transparent text-danger border border-tint-danger-border hover:bg-tint-danger",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

type ButtonStyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
};

function buttonClass({ variant = "secondary", size = "md", fullWidth }: ButtonStyleProps, extra?: string) {
  return cx(BUTTON_BASE, BUTTON_SIZES[size], BUTTON_VARIANTS[variant], fullWidth && "w-full", extra);
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return <button className={buttonClass({ variant, size, fullWidth }, className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={buttonClass({ variant, size, fullWidth }, className)} {...props} />;
}

/** For server-action `<form>` submits, where a plain button is the submitter. */
export function SubmitButton({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ComponentProps<"button"> & ButtonStyleProps) {
  return (
    <button type="submit" className={buttonClass({ variant, size, fullWidth }, className)} {...props} />
  );
}

/* ── Card ────────────────────────────────────────────────────────────────── */

const CARD_TONES = {
  default: "bg-card border-hairline text-fg",
  sunken: "bg-sunken border-transparent text-fg",
  accent: "bg-accent-soft border-pine-2 text-fg",
  inverse: "bg-inverse border-inverse text-fg-inverse",
} as const;

export type CardTone = keyof typeof CARD_TONES;

export function Card({
  tone = "default",
  interactive = false,
  className,
  ...props
}: ComponentProps<"div"> & { tone?: CardTone; interactive?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-lg border p-5 shadow-xs transition-[transform,box-shadow,border-color] duration-(--dur-base) ease-(--ease-out)",
        CARD_TONES[tone],
        interactive && "hover:-translate-y-0.5 hover:border-line hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

/** Card rendered as a link — same treatment, always interactive. */
export function CardLink({
  tone = "default",
  className,
  ...props
}: ComponentProps<typeof Link> & { tone?: CardTone }) {
  return (
    <Link
      className={cx(
        "block rounded-lg border p-5 no-underline shadow-xs transition-[transform,box-shadow,border-color] duration-(--dur-base) ease-(--ease-out) hover:-translate-y-0.5 hover:border-line hover:no-underline hover:shadow-md",
        CARD_TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ── Tag ─────────────────────────────────────────────────────────────────── */

export function Tag({
  selected = false,
  className,
  children,
}: {
  selected?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex h-[26px] items-center rounded-sm border px-2.5 font-mono text-micro tracking-wide whitespace-nowrap",
        selected
          ? "border-inverse bg-inverse text-fg-inverse"
          : "border-hairline bg-transparent text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Badge ───────────────────────────────────────────────────────────────── */

const BADGE_TONES = {
  neutral: "bg-sunken text-fg-muted border-hairline",
  accent: "bg-accent-soft text-fg-accent border-pine-2",
  success: "bg-accent-soft text-success border-pine-2",
  warning: "bg-tint-warning text-warning border-tint-warning-border",
  danger: "bg-tint-danger text-danger border-tint-danger-border",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-micro font-medium tracking-wide whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="h-1.5 w-1.5 rounded-pill bg-current" /> : null}
      {children}
    </span>
  );
}

/* ── Form controls ───────────────────────────────────────────────────────── */

const FIELD_BASE =
  "w-full rounded-md border border-line bg-card px-3 text-body-sm text-fg-strong outline-none transition-[border-color,box-shadow] duration-(--dur-fast) ease-(--ease-standard) placeholder:text-fg-faint focus:border-line-accent disabled:bg-sunken";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(FIELD_BASE, "h-(--control-h-md)", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(FIELD_BASE, "h-(--control-h-md)", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cx("mb-2 block text-caption font-medium text-fg-strong", className)}
      {...props}
    />
  );
}

export function Hint({ className, ...props }: ComponentProps<"p">) {
  return <p className={cx("mt-2 text-caption text-fg-muted", className)} {...props} />;
}

/** Small caps label used above sections. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cx("text-micro font-medium tracking-caps text-fg-muted uppercase", className)}
      {...props}
    />
  );
}

/* ── Page furniture ──────────────────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  action,
  display = false,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Use the display serif — reserved for the top of a screen. */
  display?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 pt-8 pb-5">
      <div className="min-w-0">
        <h1
          className={cx(
            "text-fg-strong",
            display
              ? "font-serif-display text-h1 font-normal tracking-display"
              : "text-h2 font-medium tracking-tight",
          )}
        >
          {title}
        </h1>
        {subtitle ? <p className="mt-1.5 text-body-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-4 rounded-lg border border-dashed border-line p-8 text-center">
      <p className="font-medium text-fg-strong">{title}</p>
      {children ? <div className="mt-2 text-body-sm text-fg-muted">{children}</div> : null}
    </div>
  );
}

export function Note({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-md border px-3 py-2 text-body-sm",
        tone === "danger"
          ? "border-tint-danger-border bg-tint-danger text-danger"
          : "border-hairline bg-sunken text-fg-muted",
      )}
    >
      {children}
    </div>
  );
}
