import { useEffect, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import CommunityFeed from "./CommunityFeed";
import "./CommunityFeed.css";

// HEADER 001: Public discovery has its own layout and styles.
export default function App() {
  const [account, setAccount] = useState<{
    user: { name: string } | null;
    authorized: boolean;
  } | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    document.body.classList.add("showcase-page");
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setAccount)
      .catch(() => {});
    return () => {
      controller.abort();
      document.body.classList.remove("showcase-page");
    };
  }, []);
  return (
    <div className="showcase">
      <header className="showcase-header">
        <a className="showcase-brand" href="/" aria-label="Cult of nix0n home">
          <img src="/con-logo.png" alt="" />
          <span>CULT OF NIX0N</span>
        </a>
        <nav aria-label="Community">
          <a href="#projects">Explore</a>
          <a href="#transmissions">Updates</a>
          <a href="#community">Community</a>
        </nav>
        <a
          className="showcase-login"
          href={account?.user ? "/admin" : "/api/auth/discord/login"}
        >
          {account?.authorized
            ? "Open admin"
            : account?.user
              ? account.user.name
              : "Discord sign-in"}
          <ArrowRight size={16} />
        </a>
      </header>
      <main className="showcase-main">
        <section className="showcase-intro">
          <span className="eyebrow">
            COMMUNITY SHOWCASE <i />
          </span>
          <h1>Look what they’re building.</h1>
          <p>
            Apps, websites, and beautifully unnecessary experiments from our
            corner of the internet.
          </p>
        </section>
        <label className="showcase-search">
          <Search size={19} />
          <input
            aria-label="Search projects and updates"
            placeholder="Find your next rabbit hole…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && <button onClick={() => setSearch("")}>Clear</button>}
        </label>
        <CommunityFeed search={search} />
        <section className="showcase-about" id="community">
          <span className="eyebrow">YOU HAVE FOUND YOUR PEOPLE.</span>
          <h2>Our condolences.</h2>
          <p>
            A gathering of friends, gamers, professional lurkers, and people who
            were absolutely supposed to be doing something else.
          </p>
          <p>Build things. Share what you know. Preserve the weird internet.</p>
          <a href="/api/auth/discord/login">
            Sign in with Discord <ArrowRight size={17} />
          </a>
        </section>
        <footer>BUILD. SHARE. PRESERVE. QUESTION. SHIP.</footer>
      </main>
    </div>
  );
}
