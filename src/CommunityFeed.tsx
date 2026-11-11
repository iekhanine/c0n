import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Code2,
  Radio,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";
type PublicPost = {
  id: string;
  kind: "update" | "project";
  title: string;
  body: string;
  link_url: string;
  image_url: string;
  featured: boolean;
  author_name: string;
  published_at: string;
};
const safeUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
};
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export default function CommunityFeed({ search = "" }: { search?: string }) {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("All projects");
  const [sort, setSort] = useState("featured");
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    void fetch("/api/feed", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setPosts(data.posts);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [attempt]);
  const matches = (p: PublicPost) =>
    `${p.title} ${p.body} ${p.author_name}`
      .toLowerCase()
      .includes(search.toLowerCase());
  const projects = posts
    .filter(
      (p) =>
        p.kind === "project" &&
        matches(p) &&
        (filter !== "Featured" || p.featured),
    )
    .sort((a, b) =>
      sort === "featured"
        ? Number(b.featured) - Number(a.featured) ||
          Date.parse(b.published_at) - Date.parse(a.published_at)
        : Date.parse(b.published_at) - Date.parse(a.published_at),
    );
  const updates = posts.filter((p) => p.kind === "update" && matches(p));
  const featured = posts
    .filter((p) => p.kind === "project" && p.featured)
    .slice(0, 3);
  return (
    <div className="showcase-columns">
      <div className="showcase-content">
        <section id="projects" aria-label="Community projects">
          <div className="showcase-toolbar">
            <div className="showcase-filters">
              {["All projects", "Featured"].map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              aria-label="Sort projects"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="featured">Featured first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
          {state === "loading" ? (
            <div className="showcase-empty" role="status">
              Loading the good stuff…
            </div>
          ) : state === "error" ? (
            <div className="showcase-empty" role="alert">
              Projects are temporarily unavailable.{" "}
              <button onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </div>
          ) : projects.length ? (
            <div className="showcase-grid">
              {projects.map((p) => (
                <article className="project-card" key={p.id}>
                  <div className="project-preview">
                    {safeUrl(p.image_url) ? (
                      <img
                        src={safeUrl(p.image_url)}
                        alt={p.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <div className="project-preview-fallback">
                      <Terminal size={38} />
                      <span>{p.title || "Something worth building"}</span>
                      <small>MADE BY THE COMMUNITY</small>
                    </div>
                  </div>
                  <div className="project-copy">
                    <span className="project-tag">
                      {p.featured ? (
                        <>
                          <Sparkles size={12} /> Featured project
                        </>
                      ) : (
                        "Community project"
                      )}
                    </span>
                    <h2>{p.title || "Untitled project"}</h2>
                    <p>{p.body}</p>
                    <div className="project-meta">
                      <span className="member-initial">
                        {(p.author_name || "C").slice(0, 1).toUpperCase()}
                      </span>
                      <strong>{p.author_name || "Cult of nix0n"}</strong>
                      <time dateTime={p.published_at}>
                        {date(p.published_at)}
                      </time>
                    </div>
                    {safeUrl(p.link_url) && (
                      <a
                        className="project-action"
                        href={safeUrl(p.link_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Explore project <ArrowUpRight size={18} />
                      </a>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="showcase-empty">
              <Code2 size={30} />
              <h2>
                {search || filter === "Featured"
                  ? "No projects match yet."
                  : "Every project starts somewhere."}
              </h2>
              <p>
                {search
                  ? "Try another title, creator, or keyword."
                  : "Community projects will appear here as they’re published."}
              </p>
            </div>
          )}
        </section>
        <section id="transmissions" className="showcase-updates">
          <div className="section-title">
            <Radio size={20} />
            <h2>From the community</h2>
            <span>Latest transmissions</span>
          </div>
          {updates.map((p) => (
            <article className="transmission" key={p.id}>
              <header>
                <span className="member-initial">
                  {(p.author_name || "C").slice(0, 1)}
                </span>
                <strong>{p.author_name || "Cult of nix0n"}</strong>
                <time dateTime={p.published_at}>{date(p.published_at)}</time>
              </header>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
              {safeUrl(p.image_url) && (
                <img
                  src={safeUrl(p.image_url)}
                  alt={p.title || "Community update"}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              {safeUrl(p.link_url) && (
                <a href={safeUrl(p.link_url)} target="_blank" rel="noreferrer">
                  Read more <ArrowUpRight size={16} />
                </a>
              )}
            </article>
          ))}
          {state === "ready" && !updates.length && (
            <p className="muted">
              {search
                ? "No updates match this search."
                : "Quiet on this frequency. Check back for the next transmission."}
            </p>
          )}
        </section>
      </div>
      <aside className="showcase-rail" aria-label="Community highlights">
        <section className="rail-card discord-card">
          <span className="eyebrow">FIND YOUR PEOPLE</span>
          <h2>The conversation continues.</h2>
          <p>
            Strange discoveries. Multiplayer disasters. Someone else’s new
            rabbit hole.
          </p>
          <a className="rail-button" href="/api/auth/discord/login">
            Discord sign-in <ArrowUpRight size={17} />
          </a>
        </section>
        <section className="rail-card">
          <h2>
            <Sparkles size={20} /> In the spotlight
          </h2>
          {featured.length ? (
            featured.map((p, i) => (
              <a
                className="spotlight-row"
                key={p.id}
                href={safeUrl(p.link_url) || "#projects"}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{p.title}</strong>
                <ArrowUpRight size={16} />
              </a>
            ))
          ) : (
            <p>
              Featured community projects will get a little extra attention
              here.
            </p>
          )}
        </section>
        <section className="rail-card">
          <h2>
            <Users size={20} /> A place for curious people
          </h2>
          <p>
            Show us what THEY built. Celebrate the useful, the unfinished, and
            the beautifully odd.
          </p>
          <a className="rail-text-link" href="#community">
            Meet the community <ArrowUpRight size={16} />
          </a>
        </section>
        <section className="rail-note">
          <Terminal size={20} />
          <p>
            Ideas are cheap.
            <br />
            <strong>Make something.</strong>
          </p>
        </section>
      </aside>
    </div>
  );
}
