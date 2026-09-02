import {
  ArrowUpRight,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import './App.css'

const DISCORD_INVITE = 'https://discord.gg/YOUR_INVITE'
const GITHUB_URL = 'https://github.com/iekhanine/c0n'

function App() {
  return (
    <div className="site-shell">
      <div className="scanlines" />

      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="CoN home">
          <img src="/con-logo.png" alt="CoN logo" />

          <div>
            <span className="brand-name">CoN</span>
            <span className="brand-subtitle">CULT OF nix0n</span>
          </div>
        </a>

        <a
          className="button button-small"
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
        >
          JOIN NODE
          <ArrowUpRight size={14} />
        </a>
      </header>

      <main id="top">
        <section className="hero section-frame">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="status-light" />
              NODE STATUS: ONLINE
            </div>

            <p className="command-line">
              root@c0n:~$ ./initialize-community
            </p>

            <h1>
              CULT OF
              <span>nix0n</span>
            </h1>

            <p className="hero-lead">
              A loose collective of developers, builders, sysadmins,
              tinkerers, hackers, designers and internet degenerates who like
              making things.
            </p>

            <p className="hero-secondary">
              No dogma. No gatekeeping. No permission required.
            </p>

            <div className="hero-actions">
              <a
                className="button button-primary"
                href={DISCORD_INVITE}
                target="_blank"
                rel="noreferrer"
              >
                <MessageSquare size={17} />
                ENTER DISCORD
              </a>

              <a
                className="button"
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={17} />
                VIEW SOURCE
              </a>
            </div>
          </div>

          <div className="hero-emblem">
            <div className="emblem-glow" />

            <img src="/con-logo.png" alt="Cult of nix0n emblem" />

            <div className="system-readout">
              <div>
                <span>ACCESS</span>
                <strong>PUBLIC</strong>
              </div>

              <div>
                <span>PROTOCOL</span>
                <strong>CoN/01</strong>
              </div>

              <div>
                <span>THREAT</span>
                <strong className="red-text">QUESTIONABLE</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App