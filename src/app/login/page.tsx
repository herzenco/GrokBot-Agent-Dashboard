import { LogoMark, ThemeToggle } from "@/components/icons";
import { safeNextPath } from "@/lib/url";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const message =
    params.error === "rate"
      ? "Too many attempts. Wait a few minutes and try again."
      : params.error
        ? "Wrong password."
        : null;

  return (
    <main className="login-wrap">
      <div className="login-top">
        <ThemeToggle />
      </div>
      <form className="login-card" action="/api/login" method="post">
        <div className="brand">
          <LogoMark />
          <span className="brand-name">Agent HQ</span>
        </div>
        <h1>Welcome back, Tito.</h1>
        <p className="modal-lead">This board is private. Enter the dashboard password.</p>
        <label className="field">
          Password
          <input type="password" name="password" autoFocus required autoComplete="current-password" />
        </label>
        <input type="hidden" name="next" value={nextPath} />
        {message ? <p className="form-error">{message}</p> : null}
        <button type="submit" className="btn btn-primary">
          Enter
        </button>
      </form>
    </main>
  );
}
