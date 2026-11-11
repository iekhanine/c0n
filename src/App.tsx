import { useEffect, useState } from "react";
import { ArrowRight, Hash, Radio, ShieldCheck, Terminal } from "lucide-react";
import CommunityFeed from "./CommunityFeed";
import "./features/admin/Admin.css";
import "./features/admin/Publishing.css";
import "./CommunityFeed.css";

// HEADER 001: Public community feed shares the control-room shell, not a hero page.
export default function App() {
  const [account, setAccount] = useState<{
    user: { name: string } | null;
    authorized: boolean;
  } | null>(null);
  useEffect(() => {
    document.body.classList.add("con-admin-page", "con-public-page");
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setAccount(data))
      .catch(() => {});
    return () => {
      controller.abort();
      document.body.classList.remove("con-admin-page", "con-public-page");
    };
  }, []);
  return (
    <div className="con-admin con-public-shell">
      <header className="con-admin-header">
        <a className="con-admin-brand" href="/">
          <img src="/con-logo.png" alt="Cult of nix0n" />
          <span>
            CULT OF nix0n<small>BUILD. SHARE. SHIP.</small>
          </span>
        </a>
        <div className="con-header-actions">
          {account?.user && (
            <span className="con-public-account">{account.user.name}</span>
          )}
          <a
            className="con-primary"
            href={account?.user ? "/admin" : "/api/auth/discord/login"}
          >
            {account?.authorized
              ? "Open admin"
              : account?.user
                ? "Approval status"
                : "Log in with Discord"}
            <ArrowRight size={17} />
          </a>
        </div>
      </header>
      <nav className="con-tool-tabs" aria-label="Community navigation">
        <span className="con-sidebar-label">COMMUNITY</span>
        <a href="#transmissions">
          <Radio size={20} />
          <span>Latest posts</span>
        </a>
        <a href="#projects">
          <Terminal size={20} />
          <span>Featured projects</span>
        </a>
        <a href="#about">
          <Hash size={20} />
          <span>About the community</span>
        </a>
        <span className="con-sidebar-label">STAFF</span>
        <a href="/admin">
          <ShieldCheck size={20} />
          <span>Community control</span>
        </a>
        <div className="con-sidebar-footer">
          <span className="con-online-dot" />
          Cult of nix0n<small>CURIOUS PEOPLE. STRANGE IDEAS.</small>
        </div>
      </nav>
      <main className="con-admin-main">
        <CommunityFeed />
        <section id="about" className="con-public-about">
          <span className="con-label">YOU HAVE FOUND YOUR PEOPLE.</span>
          <h2>Our condolences.</h2>
          <p>
            A gathering of friends, gamers, professional lurkers, and people who
            were absolutely supposed to be doing something else.
          </p>
          <p>Build things. Share what you know. Preserve the weird internet.</p>
          <strong>No robes required.</strong>
        </section>
        <footer className="con-public-footer">
          CoN // BUILD. SHARE. PRESERVE. QUESTION. SHIP.
        </footer>
      </main>
    </div>
  );
}
