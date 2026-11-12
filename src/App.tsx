import { useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
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
    user: { id: string; name: string } | null;
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
          {account?.user && (
            <a className="showcase-login" href={"/members/" + account.user.id}>
              My profile
            </a>
          )}
          <CopyRegion
            ids={[
              account?.authorized
                ? "account.admin"
                : account?.user
                  ? "account.projects"
                  : "login",
            ]}
          >
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
              <EditButton
                id={
                  account?.authorized
                    ? "account.admin"
                    : account?.user
                      ? "account.projects"
                      : "login"
                }
              />
            </div>
          </CopyRegion>
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
