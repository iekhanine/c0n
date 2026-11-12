import { StreamPage } from "./Social";
import {
  useDiscordCommunity,
  DiscordStatus,
  DiscordMembers,
  DiscordChannels,
  DiscordActivity,
  DiscordBuilders,
} from "./DiscordCommunity";
import { VoteButton, type Project } from "./ProjectPages";
import { Editable, Copy, EditButton, useSiteCopy } from "./SiteText";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  Users,
  Zap,
  Trophy,
  Search,
  Gamepad2,
} from "lucide-react";
type Post = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_url: string;
  image_url: string;
  git_url: string;
  featured: boolean;
  author_name: string;
  published_at: string;
  owner_id: string;
  category?: string;
  votes?: number;
  comments?: number;
  voted?: boolean;
};
const safe = (s: string) => {
  try {
    const u = new URL(s, window.location.origin);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
export default function CommunityFeed({
  page = "explore",
}: {
  page?: "explore" | "projects" | "members" | "community";
}) {
  const text = useSiteCopy();
  const discord = useDiscordCommunity();
  const [category, setCategory] = useState("All projects"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("featured");
  const [community, setCommunity] = useState<Post[]>([]);
  const [projectError, setProjectError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const r = await fetch("/api/projects", {
          signal: c.signal,
          cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setCommunity(d.projects);
        setProjectError("");
      } catch {
        if (!c.signal.aborted)
          setProjectError(
            "Projects are being set up. Please check back shortly.",
          );
      }
    }
    void load();
    window.addEventListener("con-projects-changed", load);
    return () => {
      c.abort();
      window.removeEventListener("con-projects-changed", load);
    };
  }, []);
  const real = community;
  const projects = [...real]
    .filter(
      (p) =>
        (category === "All projects" || p.category === category) &&
        `${p.title} ${p.body} ${p.author_name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? Date.parse(b.published_at) - Date.parse(a.published_at)
        : (b.votes || 0) - (a.votes || 0) ||
          Date.parse(b.published_at) - Date.parse(a.published_at),
    );
  return (
    <>
      <section className="page-introduction">
        <h1>
          <Editable id={page + ".title"} />
        </h1>
        <p>
          <Editable id={page + ".description"} />
        </p>
      </section>
      <div className="reference-layout">
        <div className="reference-main">
          <section className="showcase-intro">
            <span className="eyebrow">
              <Editable id="copy.1" />
              <i />
            </span>
            <p className="intro-overline">
              <Editable id="copy.2" />
            </p>
            <h1>
              <Editable id="copy.3" />
            </h1>
            <p>
              <Editable id="copy.4" />
            </p>
          </section>
          <a className="submission-cta" href="/my-projects">
            + Submit your project
          </a>
          <div className="showcase-toolbar" id="projects">
            <div className="showcase-filters">
              {["All projects", "Apps", "Websites", "Tools", "Experiments"].map(
                (c) => (
                  <span key={c}>
                    <button
                      aria-pressed={category === c}
                      onClick={() => setCategory(c)}
                    >
                      <Copy id={"category." + c} />
                    </button>
                    <EditButton id={"category." + c} />
                  </span>
                ),
              )}
            </div>
            <select
              aria-label="Sort projects"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="featured">{text("copy.5")}</option>
              <option value="newest">{text("copy.6")}</option>
            </select>
            <EditButton id={sort === "featured" ? "copy.5" : "copy.6"} />
          </div>
          <label className="compact-search" id="project-search">
            <Search size={16} />
            <input
              aria-label="Search projects"
              placeholder={text("search.placeholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <EditButton id="search.placeholder" />
            <span>
              <Editable id="copy.7" />
            </span>
          </label>
          {projectError && (
            <p role="status" className="muted">
              {projectError}
            </p>
          )}
          <section className="showcase-grid" aria-label="Community projects">
            {projects.map((p) => (
              <article className="project-card" key={p.id}>
                <div className="project-preview">
                  <a href={`/projects/${p.id}`} aria-label={`View ${p.title}`}>
                    <img
                      src={safe(p.image_url) || "/con-logo.png"}
                      alt={`${p.title} project preview`}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/con-logo.png";
                      }}
                    />
                  </a>
                </div>
                <div className="project-copy">
                  <div className="project-title">
                    <span className="project-tag">
                      {p.category || "Project"}
                    </span>
                    <h2>
                      <a href={`/projects/${p.id}`}>{p.title}</a>
                    </h2>
                  </div>
                  <p>{p.body}</p>
                  {safe(p.link_url) && (
                    <a
                      className="social-external"
                      href={safe(p.link_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Visit project <ArrowUpRight size={14} />
                    </a>
                  )}
                  <div className="project-meta">
                    <span className="member-initial">
                      {p.author_name.slice(0, 2).toUpperCase()}
                    </span>
                    <a
                      className="member-profile-link"
                      href={`/members/${p.owner_id}`}
                    >
                      <strong>@{p.author_name}</strong>
                    </a>
                    {
                      <>
                        <VoteButton
                          project={p as Project}
                          onChange={(votes, voted) =>
                            setCommunity((prev) =>
                              prev.map((item) =>
                                item.id === p.id
                                  ? { ...item, votes, voted }
                                  : item,
                              ),
                            )
                          }
                        />
                        <a
                          className="sample-comments"
                          href={`/projects/${p.id}#comments`}
                          aria-label={`Comments on ${p.title}`}
                        >
                          <MessageCircle size={17} />
                          {p.comments || 0}
                        </a>
                      </>
                    }
                    <a
                      className="project-arrow"
                      href={`/projects/${p.id}`}
                      aria-label={`View ${p.title}`}
                    >
                      <ArrowRight size={18} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </section>
          {!projects.length && (
            <p className="showcase-empty">
              <Editable id="copy.9" />
            </p>
          )}
        </div>
        <aside className="showcase-rail" aria-label="Community highlights">
          <section className="rail-card server-panel">
            <div className="server-heading">
              <Gamepad2 size={43} />
              <div>
                <h2>
                  <Editable id="copy.10" />
                </h2>
                <DiscordStatus data={discord} />
              </div>
            </div>
            <a
              className="rail-button"
              href="https://discord.gg/dSHMeZ4ETJ"
              target="_blank"
              rel="noreferrer"
            >
              <Copy id="discord.join" />
              <ArrowUpRight size={17} />
            </a>
          </section>
          <section className="rail-card">
            <h2>
              <Trophy size={23} />
              <Editable id="copy.12" />
            </h2>
            {[...real]
              .sort((a, b) => (b.votes || 0) - (a.votes || 0))
              .slice(0, 3)
              .map((p, i) => (
                <a
                  href={`/projects/${p.id}`}
                  className="spotlight-row"
                  key={p.id}
                >
                  <span>{i + 1}.</span>
                  <strong>{p.title}</strong>
                  <span className="sample-votes">↑ {p.votes || 0}</span>
                </a>
              ))}
            {!real.length && (
              <p>
                <Editable id="projects.empty" />
              </p>
            )}
          </section>
          <section className="rail-card">
            <h2>
              <MessageCircle size={23} />
              <Editable id="discord.channels.title" />
            </h2>
            <DiscordChannels data={discord} />
          </section>
          <section className="rail-card" id="members">
            <h2>
              <Zap size={25} />
              <Editable id="discord.members.title" />
            </h2>
            <DiscordBuilders data={discord} />
          </section>
          <section className="rail-card">
            <h2>
              <Users size={23} />
              <Editable id="copy.15" />
            </h2>
            <DiscordMembers data={discord} />
          </section>
          <section className="rail-card">
            <h2>
              <MessageCircle size={23} />
              <Editable id="copy.17" />
            </h2>
            <DiscordActivity data={discord} />
          </section>
        </aside>
        <StreamPage compact />
      </div>
    </>
  );
}
