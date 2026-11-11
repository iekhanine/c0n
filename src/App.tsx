import { ArrowRight, ExternalLink, MessageCircle } from "lucide-react";
import "./App.css";
import CommunityFeed from "./CommunityFeed";

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a href="#top" className="brand">
          <img src="/con-logo.png" alt="CoN logo" />

          <div className="brand-copy">
            <strong>CoN</strong>
            <span>CULT OF NIX0N</span>
          </div>
        </a>

        <nav className="main-nav">
          <a className="active" href="#top">
            HOME
          </a>
          <a href="#projects">PROJECTS</a>
          <a href="#submit">SUBMIT</a>
          <a href="#transmissions">UPDATES</a>
          <a href="#about">ABOUT</a>
          <a href="/admin">ADMIN</a>
        </nav>

        <a className="discord-button header-discord" href="#discord">
          <MessageCircle size={18} />
          JOIN DISCORD
        </a>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="terminal-prompt">
              root@c0n:~# <span className="terminal-cursor">_</span>
            </div>

            <h1>
              DEVELOPERS.
              <br />
              PROJECTS.
              <br />
              <span>SHOWCASE.</span>
            </h1>

            <div className="hero-rule" />

            <p>
              CoN is a developer project showcase.
              <br />
              Share what you&apos;re building.
              <br />
              Discover what others are creating.
              <br />
              Collaborate in our Discord community.
            </p>

            <div className="hero-actions">
              <a className="discord-button" href="#discord">
                <MessageCircle size={18} />
                JOIN DISCORD
              </a>

              <a className="secondary-button" href="#projects">
                BROWSE PROJECTS
                <ArrowRight size={18} />
              </a>
            </div>
          </div>

          <div className="hero-logo">
            <div className="logo-glow" />
            <img src="/con-logo_large.png" alt="Cult of nix0n" />
          </div>
        </section>

        <CommunityFeed />
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <strong>CoN</strong>
          <span>CULT OF NIX0N</span>

          <small>© 2026 CoN. All rights reserved.</small>
        </div>

        <div className="footer-column">
          <strong>EXPLORE</strong>
          <a href="#projects">Projects</a>
          <a href="#members">Members</a>
          <a href="#about">About</a>
        </div>

        <div className="footer-column">
          <strong>RESOURCES</strong>
          <a href="#submit">Submission Guidelines</a>
          <a href="#assets">Brand Assets</a>
          <span>API (Soon)</span>
        </div>

        <div id="discord" className="footer-column">
          <strong>CONNECT</strong>
          <a href="#discord">
            <MessageCircle size={15} />
            Discord
          </a>

          <a
            href="https://github.com/iekhanine/c0n"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
