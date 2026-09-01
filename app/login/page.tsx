import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AUTH_COOKIE,
  BASE_PATH,
  COOKIE_MAX_AGE,
  createToken,
  isPasscodeCorrect,
} from "@/lib/auth";
import { Card, Eyebrow, Input, Note, SubmitButton } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Only ever relative paths inside the app — never an absolute URL. */
function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const destination = safeNext(next);

  async function signIn(formData: FormData) {
    "use server";

    const entered = String(formData.get("passcode") ?? "");
    const target = safeNext(String(formData.get("next") ?? "/"));

    if (!isPasscodeCorrect(entered, process.env.APP_PASSCODE)) {
      // A short pause makes automated guessing against a short code tedious
      // without being noticeable to a person who mistyped.
      await new Promise((resolve) => setTimeout(resolve, 600));
      redirect(`/login?error=1${target !== "/" ? `&next=${encodeURIComponent(target)}` : ""}`);
    }

    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is not set; cannot start a session.");

    (await cookies()).set(AUTH_COOKIE, await createToken(secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // Scoped to the app's own prefix so it is never sent to the rest of the site.
      path: BASE_PATH,
      maxAge: COOKIE_MAX_AGE,
    });

    redirect(target);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <Eyebrow>Gym tracker</Eyebrow>
        <h1 className="mt-2 font-serif-display text-h2 font-normal tracking-display text-fg-strong">
          Passcode
        </h1>

        <form action={signIn} className="mt-5">
          <input type="hidden" name="next" value={destination} />
          <Input
            name="passcode"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            required
            aria-label="Passcode"
            className="text-center font-mono text-h3 tracking-[0.3em]"
          />
          {error ? (
            <div className="mt-3">
              <Note tone="danger">That is not the passcode.</Note>
            </div>
          ) : null}
          <SubmitButton variant="accent" size="lg" fullWidth className="mt-4">
            Enter
          </SubmitButton>
        </form>
      </Card>
    </main>
  );
}
