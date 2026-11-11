import { useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { ProjectPage, MemberProjects } from "./ProjectPages";
import CommunityFeed from "./CommunityFeed";
import {
  Editable,
  SiteTextProvider,
  Copy,
  EditButton,
  WebsiteEditToggle,
} from "./SiteText";
import "./CommunityFeed.css";
export default function App() {
  const [account, setAccount] = useState<{
    user: { name: string } | null;
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
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const page = path.startsWith("/projects/")
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
              <div className="nav-entry" key={id}>
                <a
                  aria-current={path === href ? "page" : undefined}
                  href={href}
                >
                  <Copy id={id} />
                </a>
                <EditButton id={id} />
              </div>
            ))}
          </nav>
          <a
            href="/projects?search=1"
            aria-label="Search projects"
            className="header-search"
          >
            <Search size={23} />
          </a>
          <a
            className="discord-invite"
            href="https://discord.gg/dSHMeZ4ETJ"
            target="_blank"
            rel="noreferrer"
          >
            <Copy id="discord.join" />
          </a>
          <WebsiteEditToggle />
          <div className="account-entry">
            <a
              className="showcase-login"
              href={
                account?.authorized
                  ? "/admin"
                  : account?.user
                    ? "/my-projects"
                    : "/api/auth/discord/login"
              }
            >
              {account?.authorized ? (
                <Copy id="account.admin" />
              ) : account?.user ? (
                <Copy id="account.projects" />
              ) : (
                <Copy id="login" />
              )}
              <ArrowRight size={16} />
            </a>
            <EditButton id={account?.authorized ? "account.admin" : "login"} />
          </div>
        </header>
        <main className="showcase-main">
          {page === "detail" ? (
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
          {page === "community" && (
            <section className="showcase-about">
              <span className="eyebrow">
                <Editable id="about.eyebrow" />
              </span>
              <h2>
                <Editable id="about.title" />
              </h2>
              <p>
                <Editable id="about.body" />
              </p>
              <p>
                <Editable id="about.beliefs" />
              </p>
              <div className="editable-link">
                <a href="/api/auth/discord/login">
                  <Copy id="about.login" />
                  <ArrowRight size={17} />
                </a>
                <EditButton id="about.login" />
              </div>
            </section>
          )}
          <footer>
            <Editable id="footer" />
          </footer>
        </main>
      </div>
    </SiteTextProvider>
  );
}
