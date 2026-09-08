import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { completePasswordReset, requestPasswordReset } from "@/lib/password";
import { noteLogin } from "@/lib/school";
import { Button, Field, Input } from "@/components/ui";
import { cleanEmail, cleanPassword, inAppBrowser, loginErrorMessage } from "@/lib/credentials";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "forgot" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [warnInApp] = useState(() => inAppBrowser());

  if (!isPending && user && mode !== "forgot" && mode !== "reset") return <Navigate to="/app" />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    setBusy(true);
    const emailClean = cleanEmail(email);
    const passwordClean = cleanPassword(password);
    setEmail(emailClean);
    setPassword(passwordClean);
    try {
      if (mode === "forgot") {
        const res = await requestPasswordReset({ data: { email: emailClean } });
        setToken(res.token);
        setMode("reset");
        setNote("Email matched the account. Set a new password now.");
        return;
      }
      if (mode === "reset") {
        await completePasswordReset({
          data: { email: emailClean, token, password: passwordClean, confirm: cleanPassword(confirm) },
        });
        setMode("in");
        setPassword("");
        setConfirm("");
        setToken("");
        setNote("Password updated. Sign in with that email and the new password.");
        return;
      }
      const res = await authClient.signIn.email({
        email: emailClean,
        password: passwordClean,
        callbackURL: "/app",
      });
      if (res.error) throw new Error(loginErrorMessage(res.error.message || "Could not sign in"));
      await noteLogin().catch(() => undefined);
      window.location.assign("/app");
    } catch (err) {
      setError(loginErrorMessage(err instanceof Error ? err.message : "Sign-in failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen lg:grid lg:grid-cols-2">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/school-pattern.jpg)" }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-navy/55" aria-hidden />
      <section className="relative z-10 hidden flex-col justify-end p-12 text-ink lg:flex">
        <img
          src="/school-crest.jpg"
          alt=""
          className="mb-6 h-20 w-20 rounded-full border border-ink/30 object-cover"
        />
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-foam">DIS ONLINE</p>
        <h1 className="mt-3 max-w-lg text-4xl font-semibold uppercase leading-tight tracking-wide text-ink">
          DOORBELL INTERNATIONAL SCHOOL
        </h1>
        <p className="mt-4 text-base text-foam">Christ is our light</p>
      </section>
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4 lg:bg-surface lg:p-12">
      <div className="w-full max-w-md space-y-6 rounded-[20px] border border-line bg-surface p-6 text-fg shadow-[0_12px_40px_rgba(13,33,55,0.18)] sm:p-8 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        <div className="flex items-start gap-3 lg:hidden">
          <img
            src="/school-crest.jpg"
            alt="School crest"
            className="h-14 w-14 rounded-full border border-ribbon object-cover"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-muted">DIS ONLINE</p>
            <h1 className="mt-1 text-lg font-semibold uppercase leading-snug tracking-wide text-navy">
              DOORBELL INTERNATIONAL SCHOOL
            </h1>
            <p className="mt-1 text-sm text-muted">
              {mode === "forgot" || mode === "reset"
                ? "Use the same email that was issued for this login."
                : "Christ is our light"}
            </p>
          </div>
        </div>
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Staff sign in</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">Issued emails only. No public sign-up.</p>
        </div>

        {warnInApp ? (
          <p className="rounded-[12px] border border-ribbon/60 bg-foam/40 px-3 py-3 text-sm text-navy">
            You opened this inside another app. Sign-in on a phone must be in Chrome or Safari — tap the menu
            (⋮ or AA) and choose <span className="font-medium">Open in browser</span>, then try again.
          </p>
        ) : null}

        {!authEnabled ? (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        ) : (
          <>
            <form className="space-y-3" onSubmit={submit} autoComplete="on">
              <Field label="Email used on the account">
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(cleanEmail(e.target.value))}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="next"
                  className="text-base"
                />
              </Field>
              {mode === "in" ? (
                <Field label="Password">
                  <div className="relative">
                    <Input
                      id="login-password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      className="pr-16 text-base"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-navy"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </Field>
              ) : null}
              {mode === "reset" ? (
                <>
                  <Field label="New password">
                    <Input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="text-base"
                    />
                  </Field>
                  <Field label="Confirm new password">
                    <Input
                      type={showPw ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="text-base"
                    />
                  </Field>
                  <button type="button" className="text-xs text-navy underline" onClick={() => setShowPw((v) => !v)}>
                    {showPw ? "Hide passwords" : "Show passwords"}
                  </button>
                </>
              ) : null}
              {error ? <p className="text-sm text-bad">{error}</p> : null}
              {note ? <p className="text-sm text-good">{note}</p> : null}
              <Button type="submit" className="w-full min-h-12 text-base" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : mode === "forgot"
                    ? "Continue with this email"
                    : mode === "reset"
                      ? "Save new password"
                      : "Sign in"}
              </Button>
            </form>

            {mode === "in" ? (
              <button
                type="button"
                className="w-full text-center text-sm text-navy underline"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setNote(null);
                }}
              >
                Forgot password
              </button>
            ) : (
              <button
                type="button"
                className="w-full text-center text-sm text-navy underline"
                onClick={() => {
                  setMode("in");
                  setError(null);
                  setNote(null);
                }}
              >
                Back to sign in
              </button>
            )}
          </>
        )}

        <Link to="/" className="block text-center text-sm text-navy underline">
          Back to school prospectus
        </Link>
      </div>
      </div>
    </main>
  );
}
