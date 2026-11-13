import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, LogOut, UserRound, Settings } from "lucide-react";
import { ProjectPage, MemberProjects, projectApi } from "./ProjectPages";
import { ProfilePage, PostPage, StreamPage, MemberDirectory } from "./Social";
import CommunityFeed from "./CommunityFeed";
import {
  CopyRegion,
  Editable,
  SiteTextProvider,
  Copy,
  EditButton,
  WebsiteEditToggle,
} from "./SiteText";
import "./CommunityFeed.css";
export default function App() {
  const [account, setAccount] = useState<{
    user: { id: string; name: string; avatar?: string | null } | null;
    authorized: boolean;
    owner?: boolean;
  } | null>(null);
  useEffect(() => {
    document.body.classList.add("showcase-page");
    const c = new AbortController();
    void fetch("/api/auth/session", { cache: "no-store", signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then(setAccount)
      .catch(() => {});
    return () => {
      c.abort();
      document.body.classList.remove("showcase-page");
    };
  }, []);
  const [seedError, setSeedError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw Error("Sign-out failed");
      window.location.assign("/");
    } catch { setSigningOut(false); }
  }
  async function prepareProjects() {
    try {
      await projectApi("seed", "POST", {});
      setSeedError("");
      window.dispatchEvent(new Event("con-projects-changed"));
    } catch (e) {
      setSeedError(
        e instanceof Error ? e.message : "Could not create starter projects.",
      );
    }
  }
  useEffect(() => {
    if (account?.owner) void prepareProjects();
  }, [account?.owner]);
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const page = path.startsWith("/members/")
    ? "profile"
    : path.startsWith("/posts/")
      ? "post"
      : path.startsWith("/projects/")
        ? "detail"
        : path === "/my-projects"
          ? "workspace"
          : path === "/projects"
            ? "projects"
            : path === "/members"
              ? "members"
              : path === "/community"
                ? "community"
                : path === "/"
                  ? "explore"
                  : "missing";
  return (
    <SiteTextProvider owner={account?.owner === true}>
      <div className={`showcase page-${page}`}>
        <header className="showcase-header">
          <div className="brand-group">
            <a
              className="showcase-brand"
              href="/"
              aria-label="Cult of nix0n home"
            >
              <img src="/con-logo.png" alt="Cult of nix0n" />
            </a>
            <span className="brand-name">
              <Editable id="brand" />
            </span>
          </div>
          <nav aria-label="Community">
            {[
              ["/", "nav.explore"],
              ["/projects", "nav.projects"],
              ["/members", "nav.members"],
              ["/community", "nav.community"],
            ].map(([href, id]) => (
              <CopyRegion ids={[id]} key={id}>
                <div className="nav-entry">
                  <a
                    aria-current={path === href ? "page" : undefined}
                    href={href}
                  >
                    <Copy id={id} />
                  </a>
                  <EditButton id={id} />
                </div>
              </CopyRegion>
            ))}
          </nav>
          <a
            className="discord-invite"
            href="https://discord.gg/dSHMeZ4ETJ"
            target="_blank"
            rel="noreferrer"
          >
            <Copy id="discord.join" />
          </a>
          <WebsiteEditToggle />
          {!account?.user ? (
            <a className="showcase-login" href="/api/auth/discord/login">
              Login <ArrowRight size={16} />
            </a>
          ) : (
            <div className="con-account-menu">
              <button type="button" className="con-account-trigger" aria-expanded={accountOpen}
                aria-label="Open account menu" onClick={() => setAccountOpen(open => !open)}>
                {account.user.avatar ? (
                  <img src={`https://cdn.discordapp.com/avatars/${account.user.id}/${account.user.avatar}.png?size=64`}
                    alt="" className="con-account-avatar"/>
                ) : (
                  <span className="con-account-avatar con-avatar-fallback">
                    {account.user.name.slice(0,2).toUpperCase()}
                  </span>
                )}
                <span>{account.authorized ? "Admin" : account.user.name}</span>
                <ChevronDown size={15}/>
              </button>
              {accountOpen && <>
                <button type="button" className="con-account-scrim" aria-label="Close account menu"
                  onClick={() => setAccountOpen(false)}/>
                <div className="con-account-dropdown">
                  <strong>{account.user.name}</strong>
                  {account.authorized && <a href="/admin"><Settings size={16}/> Admin dashboard</a>}
                  <a href={`/members/${account.user.id}`}><UserRound size={16}/> View profile</a>
                  <a href={`/members/${account.user.id}?edit=1`}><Settings size={16}/> Edit profile</a>
                  <a href="/my-projects">My projects</a>
                  <button type="button" disabled={signingOut} onClick={() => void signOut()}>
                    <LogOut size={16}/> {signingOut ? "Signing out…" : "Log out"}
                  </button>
                </div>
              </>}
            </div>
          )}
        </header>
        <main className="showcase-main">
          {account?.owner && seedError && (
            <p role="alert" className="workspace-error">
              {seedError}{" "}
              <button onClick={() => void prepareProjects()}>
                Retry starter project setup
              </button>
            </p>
          )}
          {page === "profile" ? (
            <ProfilePage id={path.split("/")[2]} />
          ) : page === "post" ? (
            <PostPage id={path.split("/")[2]} />
          ) : page === "community" ? (
            <StreamPage />
          ) : page === "members" ? (
            <MemberDirectory />
          ) : page === "detail" ? (
            <ProjectPage id={path.split("/")[2]} />
          ) : page === "workspace" ? (
            <MemberProjects />
          ) : page === "missing" ? (
            <section className="showcase-about">
              <h1>
                <Editable id="notfound.title" />
              </h1>
              <a href="/">
                <Copy id="notfound.back" />
              </a>
              <EditButton id="notfound.back" />
            </section>
          ) : (
            <CommunityFeed page={page} />
          )}
          <CopyRegion ids={["footer"]}>
            <footer>
              <Editable id="footer" />
            </footer>
          </CopyRegion>
        </main>
      </div>
    </SiteTextProvider>
  );
}
