import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, LogOut, ShieldCheck } from "lucide-react";
import { MemberProjects } from "../../ProjectPages";
import Publishing from "./Publishing";
import type { Access } from "./adminApi";
import "./Admin.css";
import { PERMISSIONS, presetPermissions } from "../../../shared/permissions.js";

type Session = {
  user: {
    id: string;
    name: string;
    username: string;
    avatar: string | null;
  } | null;
  authorized: boolean;
  access?: Access | "pending" | "denied";
  owner?: boolean;
  permissions?: string[];
  requestRegistered?: boolean;
  all_channels?: boolean;
  channel_ids?: string[];
};

// HEADER 001: Fixed identity bar. Login and logout remain in the top right.
export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.body.classList.add("con-admin-page");
    return () => document.body.classList.remove("con-admin-page");
  }, []);
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
  useEffect(() => {
    if (!session?.user || session.authorized || session.access !== "pending")
      return;
    const timer = window.setInterval(
      () => setAttempt((value) => value + 1),
      15000,
    );
    return () => window.clearInterval(timer);
  }, [session?.user?.id, session?.authorized, session?.access]);
  async function signOut() {
    if (!window.confirm("Sign out? Save any draft changes first.")) return;
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
  const user = session?.user;
  const loginError = new URLSearchParams(window.location.search).get("error");
  const avatar = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
    : null;
  const authorized =
    session?.authorized &&
    user &&
    ["admin", "moderator", "report"].includes(session.access || "");
  return (
    <div
      className={`con-admin ${authorized ? "con-has-workspace" : "con-signin-page"}`}
    >
      <header className="con-admin-header">
        <a className="con-admin-brand" href="/">
          <img src="/con-logo.png" alt="Cult of nix0n" />
          <span>
            CULT OF nix0n<small>COMMUNITY CONTROL</small>
          </span>
        </a>
        <div className="con-header-actions">
          <a
            className="con-view-site"
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            View site <ExternalLink size={15} />
          </a>
          {loading ? (
            <span className="con-header-loading" role="status">
              Connecting…
            </span>
          ) : user ? (
            <>
              <div className="con-header-identity">
                {avatar && <img src={avatar} alt="" />}
                <span>
                  {user.name}
                  <small>{session?.owner ? "Owner" : session?.access}</small>
                </span>
              </div>
              <button disabled={busy} onClick={() => void signOut()}>
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <a className="con-primary" href="/api/auth/discord/login">
              Log in with Discord <ArrowRight size={17} />
            </a>
          )}
        </div>
      </header>
      <main className="con-admin-main">
        {user && (
          <div className="member-workspace-link">
            <a href="/my-projects">My projects & submission reviews →</a>
          </div>
        )}
        {user && !authorized && <MemberProjects />}
        {error && (
          <div role="alert" className="con-tool-error">
            {error}{" "}
            <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
          </div>
        )}
        {authorized && user ? (
          <Publishing
            owner={session.owner === true}
            permissions={
              session.owner
                ? PERMISSIONS
                : (session.permissions ??
                  presetPermissions(session.access || ""))
            }
            authorName={user.name}
            currentId={user.id}
            allChannels={session.owner || session.all_channels || false}
            channelIds={session.channel_ids || []}
          />
        ) : user ? (
          <p className="member-workspace-link">
            Your project workspace is available above. Staff tools require
            separate approval from the owner.
          </p>
        ) : (
          <section className="con-login-card">
            <span className="con-label">CULT OF nix0n // STAFF ACCESS</span>
            <ShieldCheck className="con-login-icon" size={36} />
            <h1>
              {user
                ? session?.access === "denied"
                  ? "Access is not enabled."
                  : "Your staff access is pending approval."
                : "Welcome to the control room."}
            </h1>
            <p>
              {user
                ? session?.access === "denied"
                  ? "An administrator has not enabled access for this account. Contact the community team if you think this is a mistake."
                  : session?.requestRegistered
                    ? "Your Discord account is in the approval queue. An administrator will choose which tools you can use."
                    : "Staff approval is being set up. Check again shortly."
                : "One place for updates, featured projects, Discord channels, and your community team."}
            </p>
            {user ? (
              <div className="con-pending-status">
                <span className="con-pending-dot" />
                <p>
                  {session?.access === "pending"
                    ? "We check for approval automatically. You can leave this page open."
                    : "Your account remains signed in."}
                </p>
                <button
                  disabled={loading}
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  {loading ? "Checking…" : "Check status"}
                </button>
              </div>
            ) : (
              !loading && (
                <a className="con-primary" href="/api/auth/discord/login">
                  Continue with Discord <ArrowRight size={18} />
                </a>
              )
            )}
            {loginError && (
              <p role="alert" className="con-tool-error">
                {loginError === "configuration"
                  ? "Discord login is not configured. Contact the owner."
                  : "Sign-in did not complete. Please try again."}
              </p>
            )}
            {loading && <p role="status">Checking your session…</p>}
            <footer>BUILD. SHARE. PRESERVE. QUESTION. SHIP.</footer>
          </section>
        )}
      </main>
    </div>
  );
}
