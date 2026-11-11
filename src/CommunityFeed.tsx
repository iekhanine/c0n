import { samples } from "./sampleProjects";
import { VoteButton, type Project } from "./ProjectPages";
import { Editable, Copy, EditButton, useSiteCopy } from "./SiteText";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  MessageCircle,
  Users,
  Zap,
  Trophy,
  Search,
  Gamepad2,
  Radio,
} from "lucide-react";
type Post = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link_url: string;
  image_url: string;
  featured: boolean;
  author_name: string;
  published_at: string;
  category?: string;
  votes?: number;
  comments?: number;
  demo?: boolean;
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
  const [posts, setPosts] = useState<Post[]>([]),
    [error, setError] = useState(false),
    [category, setCategory] = useState("All projects"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("featured");
  const [community, setCommunity] = useState<Post[]>([]);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/projects", { signal: c.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((d) => setCommunity(d.projects))
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/feed", { signal: c.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setPosts(d.posts))
      .catch(() => {
        if (!c.signal.aborted) setError(true);
      });
    return () => c.abort();
  }, []);
  const real = community.length
    ? community
    : posts.filter((p) => p.kind === "project");
  const projects = [...real, ...samples.slice(0, Math.max(0, 6 - real.length))]
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
        : Number(Boolean(a.demo)) - Number(Boolean(b.demo)) ||
          (b.votes || 0) - (a.votes || 0) ||
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
          {error && (
            <p role="alert" className="muted">
              <Editable id="copy.8" />
            </p>
          )}
          <section className="showcase-grid" aria-label="Community projects">
            {projects.map((p) => (
              <article className="project-card" key={p.id}>
                <div className="project-preview">
                  <img
                    src={safe(p.image_url) || "/placeholders/otles.svg"}
                    alt={`${p.title} project preview`}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/placeholders/otles.svg";
                    }}
                  />
                </div>
                <div className="project-copy">
                  <div className="project-title">
                    <span className="project-tag">
                      {p.category || "Project"}
                    </span>
                    <h2>{p.title}</h2>
                    {p.demo && <small className="demo-mark">DEMO</small>}
                  </div>
                  <p>{p.body}</p>
                  <div className="project-meta">
                    <span className="member-initial">
                      {p.author_name.slice(0, 2).toUpperCase()}
                    </span>
                    <strong>@{p.author_name}</strong>
                    {p.demo ? (
                      <>
                        <span className="sample-votes">
                          <ArrowUp size={17} />
                          {p.votes}
                        </span>
                        <span className="sample-comments">
                          <MessageCircle size={17} />
                          {p.comments}
                        </span>
                      </>
                    ) : (
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
                    )}
                    <a
                      className="project-arrow"
                      href={`/projects/${p.demo ? "demo-" : ""}${p.id}`}
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
        <aside
          className="showcase-rail"
          aria-label="Community activity preview"
        >
          <section className="rail-card server-panel">
            <div className="server-heading">
              <Gamepad2 size={43} />
              <div>
                <h2>
                  <Editable id="copy.10" />
                </h2>
                <p>
                  <span className="presence-dot" />
                  42 members online <small>DEMO</small>
                </p>
              </div>
            </div>
            <div className="server-bottom">
              <div className="presence-avatars">
                ● ● ● ● <span>+37</span>
              </div>
              <div className="editable-link">
                <a className="rail-button" href="https://discord.gg/dSHMeZ4ETJ">
                  <Copy id="discord.join" />
                  <ArrowUpRight size={17} />
                </a>
                <EditButton id="discord.join" />
              </div>
            </div>
          </section>
          <section className="rail-card">
            <h2>
              <Trophy size={23} />
              <Editable id="copy.12" />
              {!real.length && <small>DEMO</small>}
            </h2>
            {(real.length
              ? [...real]
                  .sort((a, b) => (b.votes || 0) - (a.votes || 0))
                  .slice(0, 3)
              : [samples[3], samples[0], samples[5]]
            ).map((p, i) => (
              <a
                href={`/projects/${p.demo ? "demo-" : ""}${p.id}`}
                className="spotlight-row"
                key={p.id}
              >
                <span>{i + 1}.</span>
                <strong>{p.title}</strong>
                <span className="sample-votes">
                  <ArrowUp size={17} />
                  {p.votes}
                </span>
              </a>
            ))}
          </section>
          <section className="rail-card" id="members">
            <h2>
              <Zap size={25} />
              <Editable id="copy.14" />
              <small>DEMO</small>
            </h2>
            {[
              ["AL", "alexturner", "Polishing v0.3 of Loopboard"],
              ["MK", "mariok", "Adding new recipes to Pixel Pantry"],
              ["SY", "sylvie", "Prototyping a map editor for Tiny Worlds"],
            ].map(([a, n, b]) => (
              <div className="activity-member" key={n}>
                <span className="member-initial">{a}</span>
                <strong>@{n}</strong>
                <span>{b}</span>
              </div>
            ))}
          </section>
          <section className="rail-card">
            <h2>
              <Users size={23} />
              <Editable id="copy.15" />
              <small>DEMO</small>
            </h2>
            <p>
              <Editable id="copy.16" />
            </p>
            <div className="fresh-members">
              {[
                ["JD", "jdx"],
                ["ER", "erinn"],
                ["KC", "kcasey"],
              ].map(([a, n]) => (
                <div key={n}>
                  <span className="member-initial">{a}</span>
                  <span>@{n}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="rail-card">
            <h2>
              <MessageCircle size={23} />
              <Editable id="copy.17" />
              <small>DEMO</small>
            </h2>
            {[
              [
                "projects",
                "otlesdev",
                "shared a new update for OTLES v0.4.",
                "16m",
              ],
              [
                "show-and-tell",
                "sylvie",
                "posted a terrain preview from Tiny Worlds.",
                "28m",
              ],
              [
                "tools",
                "retroterm",
                "shared their task setup and dotfiles.",
                "41m",
              ],
            ].map(([c, n, b, time]) => (
              <div className="server-activity" key={c}>
                <span className="project-tag"># {c}</span>
                <p>
                  <strong>@{n}</strong> {b}
                  <small>{time} ago</small>
                </p>
              </div>
            ))}
          </section>
        </aside>
        <section
          id="transmissions"
          className="showcase-updates reference-updates"
        >
          <div className="section-title">
            <Radio size={21} />
            <h2>
              <Editable id="copy.18" />
            </h2>
          </div>
          {posts
            .filter((p) => p.kind === "update")
            .map((p) => (
              <article className="transmission" key={p.id}>
                <header>
                  <strong>{p.author_name}</strong>
                  <time dateTime={p.published_at}>
                    {new Date(p.published_at).toLocaleDateString()}
                  </time>
                </header>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                {safe(p.link_url) && (
                  <a href={safe(p.link_url)} target="_blank" rel="noreferrer">
                    <Copy id="copy.19" />
                    <ArrowUpRight size={16} />
                  </a>
                )}
                <EditButton id="copy.19" />
              </article>
            ))}
        </section>
        <p className="demo-explanation" id="demo-explanation">
          <Editable id="copy.20" />
        </p>
      </div>
    </>
  );
}
