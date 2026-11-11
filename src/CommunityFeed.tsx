import { useEffect, useState } from "react";
import { ArrowUpRight, Radio, Terminal } from "lucide-react";
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
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export default function CommunityFeed() {
  const [posts, setPosts] = useState<PublicPost[]>([]),
    [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [attempt, setAttempt] = useState(0);
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
  const updates = posts.filter((p) => p.kind === "update"),
    projects = posts
      .filter((p) => p.kind === "project")
      .sort((a, b) => Number(b.featured) - Number(a.featured));
  return (
    <div className="con-community-feed">
      <section id="transmissions" className="con-public-section">
        <header className="con-feed-heading">
          <span className="con-label">CULT OF nix0n / COMMUNITY FEED</span>
          <h1>
            <Radio size={27} />
            Latest posts
          </h1>
          <p>Updates, strange discoveries, and things worth sharing.</p>
        </header>
        {state === "loading" ? (
          <p role="status" className="con-tool-empty">
            Loading transmissions…
          </p>
        ) : state === "error" ? (
          <div className="con-tool-error">
            Posts are temporarily unavailable.{" "}
            <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
          </div>
        ) : updates.length ? (
          <div className="con-timeline">
            {updates.map((p) => (
              <FeedPost key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <div className="con-public-empty">
            Quiet on this frequency. The first transmission is coming soon.
          </div>
        )}
      </section>
      <section id="projects" className="con-public-section con-public-projects">
        <header className="con-feed-heading">
          <span className="con-label">COMMUNITY SHOWCASE</span>
          <h2>
            <Terminal size={24} />
            Featured projects
          </h2>
          <p>Tell us what THEY built…</p>
        </header>
        {projects.length ? (
          <div className="con-timeline">
            {projects.map((p) => (
              <FeedPost key={p.id} post={p} />
            ))}
          </div>
        ) : (
          state === "ready" && (
            <div className="con-public-empty">
              Community projects will appear here.
            </div>
          )
        )}
      </section>
    </div>
  );
}
function FeedPost({ post: p }: { post: PublicPost }) {
  return (
    <article className={`con-feed-post ${p.kind}`}>
      <img className="con-feed-avatar" src="/con-logo.png" alt="" />
      <div className="con-feed-post-main">
        <header>
          <strong>{p.author_name}</strong>
          <span>
            {p.kind === "project" ? "PROJECT SPOTLIGHT" : "TRANSMISSION"}
          </span>
          <time dateTime={p.published_at}>{date(p.published_at)}</time>
        </header>
        {p.title && <h3>{p.title}</h3>}
        <p>{p.body}</p>
        {safeUrl(p.image_url) && (
          <img
            className="con-feed-media"
            src={safeUrl(p.image_url)}
            alt={p.title || "Community post"}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        {safeUrl(p.link_url) && (
          <a
            className="con-feed-link"
            href={safeUrl(p.link_url)}
            target="_blank"
            rel="noreferrer"
          >
            {p.kind === "project" ? "Explore their project" : "Read more"}
            <ArrowUpRight size={17} />
          </a>
        )}
      </div>
    </article>
  );
}
