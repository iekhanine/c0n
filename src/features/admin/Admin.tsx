import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  Radio,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import "./Admin.css";
import Publishing from "./Publishing";

type Session = {
  user: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  } | null;
  authorized: boolean;
  access?: "admin" | "moderator" | "pending" | "denied";
};

// HEADER 001: Session state comes from the server, never local storage.
export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/auth/session", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Could not verify your session. Try again shortly.");
        setSession((await response.json()) as Session);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Connection failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  async function signOut() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed. Please try again.");
      setSession({ user: null, authorized: false });
      window.history.replaceState(null, "", "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign out failed.");
    } finally {
      setBusy(false);
    }
  }

  const loginError = new URLSearchParams(window.location.search).get("error");
  const user = session?.user;
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : null;

  return (
    <div className="con-admin">
      <header className="con-admin-header">
        <a className="con-admin-brand" href="/">
          <img src="/con-logo.png" alt="Cult of nix0n" />
          <span>
            CULT OF nix0n<small>COMMUNITY CONTROL</small>
          </span>
        </a>
        <a className="con-admin-back" href="/">
          <ArrowLeft size={15} /> PUBLIC SITE
        </a>
      </header>
      <main>
        <div className="con-admin-eyebrow">
          <span /> STAFF ACCESS // 001
        </div>
        <h1>
          CONTROL ROOM<span>_</span>
        </h1>
        <p className="con-admin-intro">
          Good things start with a questionable idea.
          <br />
          This is where we share them.
        </p>

        <section
          className="con-access-card"
          aria-labelledby="access-heading"
          aria-busy={loading}
        >
          <div className="con-card-bar">
            <Terminal size={16} />
            <span>root@c0n:~/admin</span>
            <span className="con-card-status">
              {loading ? "CONNECTING" : user ? "CONNECTED" : "AUTHENTICATION"}
            </span>
          </div>
          <div className="con-card-body">
            {loading ? (
              <p role="status">Checking your session…</p>
            ) : error ? (
              <>
                <p role="alert" className="con-notice">
                  {error}
                </p>
                <button onClick={() => setAttempt((a) => a + 1)}>
                  RETRY CONNECTION
                </button>
              </>
            ) : !user ? (
              <>
                <ShieldCheck size={32} className="con-access-icon" />
                <h2 id="access-heading">YOUR DISCORD. YOUR ACCESS.</h2>
                <p>
                  Sign in with Discord to access community administration.
                  Publishing and settings are reserved for approved staff.
                </p>
                {loginError && (
                  <p className="con-notice" role="alert">
                    {loginError === "configuration"
                      ? "Discord login is not configured yet. Contact the site owner."
                      : "Sign-in did not complete. Please try again; allow cookies and finish within ten minutes."}
                  </p>
                )}
                <a className="con-primary" href="/api/auth/discord/login">
                  CONTINUE WITH DISCORD <ArrowRight size={17} />
                </a>
                <small>
                  We request your profile and server membership. No email
                  access.
                </small>
              </>
            ) : (
              <>
                <div className="con-identity">
                  {avatar ? (
                    <img src={avatar} alt="" />
                  ) : (
                    <span className="con-avatar">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <h2 id="access-heading">{user.name}</h2>
                    <p>@{user.username}</p>
                  </div>
                  <span className="con-access-badge">
                    {session?.authorized
                      ? session.access?.toUpperCase()
                      : "ACCESS PENDING"}
                  </span>
                </div>
                <div className="con-account-id">
                  <span>YOUR DISCORD USER ID</span>
                  <code>{user.id}</code>
                </div>
                <p className="con-notice">
                  {session?.authorized
                    ? "Staff access verified. Your publishing tools are below."
                    : session?.access === "denied"
                      ? "You are signed in, but your account does not have an approved staff role."
                      : "You are signed in. Staff permissions still need to be configured. Send the user ID above to the site owner to enable your account."}
                </p>
                <button onClick={() => void signOut()} disabled={busy}>
                  <LogOut size={15} /> {busy ? "SIGNING OUT…" : "SIGN OUT"}
                </button>
              </>
            )}
          </div>
        </section>

        {session?.authorized && user ? (
          <Publishing
            isAdmin={session.access === "admin"}
            authorName={user.name}
          />
        ) : (
          <section
            className="con-admin-roadmap"
            aria-label="Community publishing tools"
          >
            <div>
              <Radio size={19} />
              <h2>TRANSMISSIONS</h2>
              <p>
                Short updates. Project launches.
                <br />
                Something worth sharing.
              </p>
            </div>
            <div>
              <Terminal size={19} />
              <h2>FEATURED PROJECTS</h2>
              <p>
                Put your builders and their
                <br />
                work in the spotlight.
              </p>
            </div>
            <div>
              <ShieldCheck size={19} />
              <h2>CHANNEL CONNECTIONS</h2>
              <p>
                Manage webhooks and choose
                <br />
                where each post goes.
              </p>
            </div>
          </section>
        )}
      </main>
      <footer>CoN // BUILD. SHARE. PRESERVE. QUESTION. SHIP.</footer>
    </div>
  );
}
