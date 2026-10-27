"use client";
import { BarChart3, ChevronRight } from "lucide-react";
import Research from "./Research";
export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="InsightPilot home">
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          InsightPilot<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">R</span>
          <div>
            <strong>Your browser workspace</strong>
            <small>Saved privately for this browser</small>
          </div>
          <span className="workspace-status" />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <strong>Web research</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-label">
              <span /> Free public edition
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PRODUCT RESEARCH</div>
              <h1>Start with a link. Follow the evidence.</h1>
              <p>
                Explore what the public web says about a product, with sources
                you can check.
              </p>
            </div>
          </div>
          <Research />
        </main>
        <footer className="footer">
          <span>Built for thoughtful product decisions.</span>
          <span>Linked sources · Clear access labels</span>
        </footer>
      </div>
    </div>
  );
}
