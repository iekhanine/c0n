import { useEffect, useState } from "react";
import { ArrowRight, Radio, Terminal } from "lucide-react";
import "./CommunityFeed.css";

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

// HEADER 001: Public feed consumes published rows only. No staff API or secrets.
export default function CommunityFeed() {
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState("loading");
      try {
        const response = await fetch("/api/feed", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Feed unavailable");
        const data = (await response.json()) as { posts: PublicPost[] };
        if (!controller.signal.aborted) {
          setPosts(data.posts);
          setState("ready");
        }
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  const updates = posts.filter((p) => p.kind === "update");
  const projects = posts.filter((p) => p.kind === "project");
  const featured = projects.filter((p) => p.featured);
  const otherProjects = projects.filter((p) => !p.featured);
  return (
    <div className="con-community-feed">
      <section id="transmissions" className="con-public-section">
        <div className="section-header">
          <h2>
            <Radio size={22} /> TRANSMISSIONS
          </h2>
          <span>THE LATEST FROM CoN</span>
        </div>
        {state === "loading" ? (
          <p className="con-public-empty" role="status">
            Tuning in…
          </p>
        ) : state === "error" ? (
          <div className="con-public-empty" role="status">
            Updates are temporarily unavailable.{" "}
            <button onClick={() => setAttempt((a) => a + 1)}>RETRY</button>
          </div>
        ) : !updates.length ? (
          <p className="con-public-empty">
            Quiet on this frequency. First transmission coming soon.
          </p>
        ) : (
          <div className="con-update-feed">
            {updates.map((p) => (
              <article className="con-public-update" key={p.id}>
                <div className="con-update-avatar">
                  <img src="/con-logo.png" alt="" />
                </div>
                <div>
                  <header>
                    <strong>{p.author_name}</strong>
                    <span>CULT OF nix0n</span>
                    <time dateTime={p.published_at}>
                      {new Date(p.published_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                  </header>
                  {p.title && <h3>{p.title}</h3>}
                  <p>{p.body}</p>
                  {safeUrl(p.image_url) && (
                    <img
                      className="con-public-image"
                      src={safeUrl(p.image_url)}
                      alt={p.title || "Transmission image"}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {safeUrl(p.link_url) && (
                    <a
                      className="con-public-link"
                      href={safeUrl(p.link_url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      READ MORE <ArrowRight size={14} />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section id="projects" className="con-public-section">
        <div className="section-header">
          <h2>
            <Terminal size={23} /> FEATURED PROJECTS
          </h2>
          <a href="/admin">
            SHARE YOUR WORK <ArrowRight size={16} />
          </a>
        </div>
        {state === "ready" && !featured.length && (
          <p className="con-public-empty">
            Built something worth sharing? Our next featured project could be
            yours.
          </p>
        )}
        <div className="con-real-project-grid">
          {featured.map((p) => (
            <ProjectCard post={p} key={p.id} />
          ))}
        </div>
        {otherProjects.length > 0 && (
          <>
            <h3 className="con-project-directory-title">
              MORE FROM THE COMMUNITY
            </h3>
            <div className="con-real-project-grid">
              {otherProjects.map((p) => (
                <ProjectCard post={p} key={p.id} />
              ))}
            </div>
          </>
        )}
        <div id="submit" className="submit-banner">
          <div className="submit-copy">
            <Terminal size={27} />
            <div>
              <h3>BUILD SOMETHING?</h3>
              <p>Share your work with the community.</p>
            </div>
          </div>
          <a className="submit-button" href="/admin">
            STAFF PUBLISHING <ArrowRight size={19} />
          </a>
        </div>
      </section>
    </div>
  );
}

function ProjectCard({ post }: { post: PublicPost }) {
  return (
    <article className="con-real-project">
      {safeUrl(post.image_url) ? (
        <img
          src={safeUrl(post.image_url)}
          alt={post.title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="con-project-placeholder">
          <Terminal size={38} />
          <span>BUILT BY THE COMMUNITY</span>
        </div>
      )}
      <div>
        <span className="con-project-author">BY {post.author_name}</span>
        <h3>{post.title}</h3>
        <p>{post.body}</p>
        {safeUrl(post.link_url) && (
          <a
            className="con-public-link"
            href={safeUrl(post.link_url)}
            target="_blank"
            rel="noreferrer"
          >
            EXPLORE PROJECT <ArrowRight size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
