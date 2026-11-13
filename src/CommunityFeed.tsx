import ProjectCardMenu from "./ProjectCardMenu";
import DiscordSidebar from "./DiscordSidebar";
import { StreamPage } from "./Social";
import { VoteButton, type Project } from "./ProjectPages";
import { Editable, Copy, useSiteCopy } from "./SiteText";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  MessageCircle,
  SlidersHorizontal,
  ChevronDown,
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
  avatar_url?: string;
  published_at: string;
  owner_id: string;
  owner_slug?: string;
  homepage_pinned?: boolean;
  homepage_hidden?: boolean;
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
function ProjectAuthorAvatar({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url?.startsWith("https://") && !failed ? (
    <img className="member-initial project-author-avatar" src={url}
      loading="lazy" alt="" onError={() => setFailed(true)} />
  ) : <span className="member-initial">{name.slice(0, 2).toUpperCase()}</span>;
}
export default function CommunityFeed({
  page = "explore",
}: {
  page?: "explore" | "projects" | "members" | "community";
}) {
  const text = useSiteCopy();
  const [category, setCategory] = useState("All projects"),
    [sort, setSort] = useState("featured");
  const [canManage, setCanManage] = useState(false);
  const [categories, setCategories] = useState<string[]>(["Apps","Websites","Tools","Experiments"]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [community, setCommunity] = useState<Post[]>([]);
  const [projectError, setProjectError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const r = await fetch(
          "/api/projects" + (page === "explore" ? "?showcase=1" : ""),
          {
            signal: c.signal,
            cache: "no-store",
          },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setCommunity(d.projects);
        const categoryResponse = await fetch("/api/projects?action=categories", {signal:c.signal,cache:"no-store"});
        if (categoryResponse.ok) {
          const categoryData=await categoryResponse.json();
          setCategories(categoryData.categories.filter((item:{active:boolean})=>item.active).map((item:{name:string})=>item.name));
        }
        setCanManage(d.canManage === true);
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
  }, [page, refresh]);
  const real = community;
  const ranked = [...real]
    .filter(
      (p) =>
        category === "All projects" || p.category === category,
    )
    .sort(
      (a, b) =>
        (page === "explore"
          ? Number(Boolean(b.homepage_pinned)) -
            Number(Boolean(a.homepage_pinned))
          : 0) ||
        (sort === "newest" && page !== "explore"
          ? Date.parse(b.published_at) - Date.parse(a.published_at)
          : (b.votes || 0) - (a.votes || 0) ||
            Date.parse(b.published_at) - Date.parse(a.published_at)),
    );
  const projects =
    page === "explore"
      ? ranked.filter((p) => !p.homepage_hidden).slice(0, 15)
      : ranked;
  return (
    <>
      <section className="page-introduction">
        <div className="con-page-intro-heading">
          <h1><Editable id={page + ".title"} /></h1>
          <div className="con-filter-menu">
            <button type="button" className="con-filter-trigger"
              aria-expanded={filterOpen} aria-controls="con-project-filter-options"
              onClick={() => setFilterOpen(v => !v)}>
              <SlidersHorizontal size={16} />
              <span>{category === "All projects" ? "Filter" : category}</span>
              <ChevronDown size={14} />
            </button>
            {filterOpen && <>
              <button type="button" className="con-filter-backdrop"
                aria-label="Close project filters" onClick={() => setFilterOpen(false)}/>
              <div id="con-project-filter-options" className="con-filter-options" role="group" aria-label="Project categories">
                {["All projects", ...new Set([...categories, ...community.map(p=>p.category).filter((c):c is string=>Boolean(c))])].map(c => (
                  <button type="button" key={c} aria-pressed={category === c}
                    onClick={() => { setCategory(c); setFilterOpen(false); }}>
                    <Copy id={"category." + c} />
                  </button>
                ))}
                {page !== "explore" && <label className="con-filter-sort">
                  Sort by
                  <select aria-label="Sort projects" value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="featured">{text("copy.5")}</option>
                    <option value="newest">{text("copy.6")}</option>
                  </select>
                </label>}
              </div>
            </>}
          </div>
        </div>
        <p><Editable id={page + ".description"} /></p>
      </section>
      <div className="reference-layout">
        <div className="reference-main">
          {projectError && (
            <p role="status" className="muted">
              {projectError}
            </p>
          )}
          {page === "explore" && <div className="con-featured-heading">
            <div><span className="con-featured-eyebrow">FROM THE COMMUNITY</span><h2>Featured projects</h2></div>
            <a href="/projects">View all projects →</a>
          </div>}
          <section className="showcase-grid" aria-label="Community projects">
            {projects.map((p) => (
              <article
                className={`project-card ${page === "explore" && p.homepage_pinned ? "project-card-pinned" : ""}`}
                key={p.id}
              >
                <ProjectCardMenu
                  project={p}
                  canManage={canManage}
                  onChange={() => setRefresh((n) => n + 1)}
                />
                {page === "explore" && p.homepage_pinned && (
                  <span className="project-pinned-label">PINNED</span>
                )}
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
                    <ProjectAuthorAvatar name={p.author_name} url={p.avatar_url} />
                    <a
                      className="member-profile-link"
                      href={`/c/${p.owner_slug || p.owner_id}`}
                    >
                      <strong>@{p.author_name}</strong>
                    </a>
                    {
                      <>
                        <VoteButton
                          project={p as Project}
                          onChange={(votes, voted) => {
                            setCommunity((prev) =>
                              prev.map((item) =>
                                item.id === p.id
                                  ? { ...item, votes, voted }
                                  : item,
                              ),
                            );
                            setRefresh((n) => n + 1);
                          }}
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
          {page === "explore" && (
            <section className="con-home-blog" aria-label="Community blog posts">
              <StreamPage compact />
            </section>
          )}
        </div>
        <DiscordSidebar />
      </div>
    </>
  );
}
