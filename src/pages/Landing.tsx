import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  Database,
  Globe2,
  LayoutDashboard,
  Play,
  Store,
  Workflow,
} from "lucide-react";
import { useCatalog } from "../api/client";
import { Brand, ActorIcon, usePageTitle } from "../components/common";

export function Landing() {
  usePageTitle("Self-hosted web scraping workspace");
  const { actors } = useCatalog();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <Link to="/store">Store</Link>
          <Link to="/getting-started">How it works</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
        <div>
          <Link className="text-button" to="/store">
            Open store
          </Link>
          <Link className="btn primary" to="/dashboard">
            Go to dashboard <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>
      <section className="landing-hero">
        <div className="hero-label">
          <span /> A little less busywork. A lot more possibility.
        </div>
        <h1>
          The web is full of leads.
          <br />
          <em>Make them yours.</em>
        </h1>
        <p>
          Turn public websites into structured, useful data.
          <br />
          Collect content, discover contacts, and build your next workflow.
        </p>
        <div className="hero-buttons">
          <Link className="btn primary" to="/store">
            Explore the Store <ArrowRight size={17} />
          </Link>
          <Link className="btn" to="/getting-started">
            See how it works
          </Link>
        </div>
        <span className="hero-note">
          Runs locally. Exports freely. Built around your workflow.
        </span>
        <div className="hero-preview">
          <div className="preview-top">
            <div>
              <i />
              <i />
              <i />
            </div>
            <span>Leeds Harvester workspace</span>
            <span className="environment">
              <span /> Local
            </span>
          </div>
          <div className="preview-body">
            <div className="preview-sidebar">
              <img src="/favicon.png" alt="" />
              {[Store, LayoutDashboard, Box, Play, Database].map((I, i) => (
                <I key={i} size={17} />
              ))}
            </div>
            <div className="preview-main">
              <div className="preview-heading">
                <div>
                  <span className="eyebrow">YOUR NEXT WORKFLOW</span>
                  <h2>A website. A wealth of data.</h2>
                </div>
                <span className="status-pill ready">Ready to run</span>
              </div>
              <div className="preview-input">
                <Globe2 size={17} />
                <span>https://your-next-opportunity.com</span>
                <span className="preview-run">
                  <Play size={13} /> Start run
                </span>
              </div>
              <div className="preview-cards">
                {(actors ?? []).slice(0, 3).map((a) => (
                  <Link to={"/actors/" + a.id} key={a.id}>
                    <ActorIcon actor={a} />
                    <h3>{a.name}</h3>
                    <p>{a.category}</p>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              </div>
              <div className="preview-data">
                <span>
                  <Database size={17} /> Your next dataset
                </span>
                <span>
                  Clear sources. Useful structure. Your choice of export.
                </span>
                <span className="data-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="landing-features">
        <div>
          <span className="eyebrow">FROM RAW WEB TO REAL WORK</span>
          <h2>
            Less collecting.
            <br />
            More connecting the dots.
          </h2>
        </div>
        {[
          [
            Globe2,
            "Start with any public website",
            "Collect text, links, metadata, and publicly listed contact details.",
          ],
          [
            Workflow,
            "Make a workflow of it",
            "Save repeatable tasks and schedule them for fresh data.",
          ],
          [
            Database,
            "Take your data with you",
            "Review every run and export structured JSON or CSV.",
          ],
        ].map(([Icon, title, text]: any) => (
          <article key={title}>
            <Icon size={25} />
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="landing-cta">
        <img src="/favicon.png" alt="" />
        <h2>Your next opportunity is out there.</h2>
        <p>Give your research a head start.</p>
        <Link className="btn primary" to="/store">
          Find your first Actor <ArrowRight size={16} />
        </Link>
      </section>
      <footer className="landing-footer">
        <Brand small />
        <span>Web data, ready to work.</span>
        <Link to="/getting-started">Getting started</Link>
        <Link to="/store">Explore Store</Link>
      </footer>
    </div>
  );
}
