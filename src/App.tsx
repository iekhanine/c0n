import {
  ArrowRight,
  ExternalLink,
  MessageCircle,
  Terminal,
} from 'lucide-react'
import './App.css'

type Project = {
  id: string
  name: string
  description: string
  status: string
  statusClass: string
  tags: string[]
  preview: 'terminal' | 'dashboard' | 'minimal'
}

const projects: Project[] = [
  {
    id: 'CON-0027',
    name: 'RetroTerm',
    description:
      'A modern web-based terminal inspired by classic BBS systems.',
    status: 'IN DEVELOPMENT',
    statusClass: 'development',
    tags: ['WEB', 'TERMINAL', 'REACT'],
    preview: 'terminal',
  },
  {
    id: 'CON-0026',
    name: 'PacketRat',
    description:
      'Network debugging utility for sysadmins and developers.',
    status: 'SHIPPED',
    statusClass: 'shipped',
    tags: ['DESKTOP', 'NETWORKING', 'RUST'],
    preview: 'dashboard',
  },
  {
    id: 'CON-0025',
    name: 'Void Notes',
    description:
      'Minimalist note taking with local-first storage.',
    status: 'EXPERIMENTAL',
    statusClass: 'experimental',
    tags: ['WEB', 'TYPESCRIPT', 'OFFLINE'],
    preview: 'minimal',
  },
]

function ProjectPreview({ type }: { type: Project['preview'] }) {
  if (type === 'terminal') {
    return (
      <div className="project-preview terminal-preview">
        <div className="preview-window-bar">
          <span />
          <span />
          <span />
        </div>

        <div className="terminal-preview-inner">
          <strong>RETROTERM</strong>

          <div className="terminal-line">
            <span>&gt;</span> INITIALIZING...
          </div>
          <div className="terminal-line">
            <span>&gt;</span> CONNECTION ESTABLISHED
          </div>
          <div className="terminal-line">
            <span>&gt;</span> _
          </div>
        </div>
      </div>
    )
  }

  if (type === 'dashboard') {
    return (
      <div className="project-preview dashboard-preview">
        <div className="preview-window-bar">
          <span />
          <span />
          <span />
        </div>

        <div className="dashboard-preview-inner">
          <div className="dash-sidebar">
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className="dash-main">
            <div className="dash-top">
              <span />
              <span />
            </div>

            <div className="dash-chart">
              <svg
                viewBox="0 0 400 120"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  points="0,82 35,76 70,86 110,51 145,62 185,43 220,54 260,25 300,38 340,16 400,31"
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>

            <div className="dash-boxes">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="project-preview minimal-preview">
      <div className="preview-window-bar">
        <span />
        <span />
        <span />
      </div>

      <div className="minimal-preview-inner">
        <div className="orb" />
        <strong>Void Notes</strong>
        <small>Capture the thought.</small>
      </div>
    </div>
  )
}

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
          <a href="#members">MEMBERS</a>
          <a href="#about">ABOUT</a>
          <a href="/admin">ADMIN</a>
        </nav>

        <a
          className="discord-button header-discord"
          href="#discord"
        >
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

        <section id="projects" className="projects-section">
          <div className="section-header">
            <h2>
              <Terminal size={23} />
              FEATURED PROJECTS
            </h2>

            <a href="#all-projects">
              VIEW ALL PROJECTS
              <ArrowRight size={16} />
            </a>
          </div>

          <div className="project-grid">
            {projects.map((project) => (
              <article className="project-card" key={project.id}>
                <div className="project-card-top">
                  <span className="project-id">{project.id}</span>

                  <span
                    className={`project-status ${project.statusClass}`}
                  >
                    {project.status}
                  </span>
                </div>

                <ProjectPreview type={project.preview} />

                <h3>{project.name}</h3>

                <p>{project.description}</p>

                <div className="tag-list">
                  {project.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="carousel-dots">
            <span className="active" />
            <span />
            <span />
          </div>

          <div id="submit" className="submit-banner">
            <div className="submit-copy">
              <Terminal size={27} />

              <div>
                <h3>BUILD SOMETHING?</h3>
                <p>
                  Showcase your project and get discovered
                  <br />
                  by other builders.
                </p>
              </div>
            </div>

            <button className="submit-button">
              SUBMIT YOUR PROJECT
              <ArrowRight size={19} />
            </button>
          </div>
        </section>
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
  )
}

export default App
