import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Box,
  ChartNoAxesCombined,
  Code2,
  Globe2,
  Leaf,
  MessageSquare,
  Search,
  Sparkles,
  X,
  ShoppingCart,
} from "lucide-react";
import { isRunnable, actorStatusLabel, useCatalog } from "../api/client";
import { ActorIcon, Notice, Empty, Loading } from "../components/common";

export function StorePage({ mine = false }: { mine?: boolean }) {
  const { actors, error } = useCatalog();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const categoryStyle: Record<string, [any, string]> = {
    "Web scraping": [Globe2, "blue"],
    "Lead generation": [Leaf, "green"],
    "Social media": [MessageSquare, "pink"],
    SEO: [ChartNoAxesCombined, "orange"],
    "E-commerce": [ShoppingCart, "green"],
    "AI & data": [Sparkles, "purple"],
  };
  const categories = [...new Set((actors ?? []).map((a) => a.category))].map(
    (name) => [name, ...(categoryStyle[name] ?? [Box, "blue"])] as const,
  );
  const filtered = (actors ?? []).filter(
    (a) =>
      (category === "All" || a.category === category) &&
      (!mine || isRunnable(a)) &&
      `${a.name} ${a.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="store-page">
      <div className="store-intro">
        <div className="eyebrow">EXTRACT. ORGANIZE. GROW.</div>
        <h1>{mine ? "Your Actors" : "Leeds Harvester Store"}</h1>
        <p>
          {mine
            ? "Your ready-to-run tools, all in one place."
            : "Find your next shortcut. Turn the web into data that works for you."}
        </p>
        <div className="store-search">
          <Search size={21} />
          <input
            aria-label="Search Actors"
            placeholder="Search for Actors, scrapers, and tools…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setQ("")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="search-hint">
          Start with a website. Leave with structured data.{" "}
          <Link to="/getting-started">
            See how it works <ArrowRight size={12} />
          </Link>
        </div>
      </div>
      <div className="categories">
        {categories.map(([name, Icon, color]) => (
          <button
            className={"category " + (category === name ? "selected" : "")}
            key={name}
            onClick={() => setCategory(category === name ? "All" : name)}
          >
            <span className={"category-icon " + color}>
              <Icon size={20} />
            </span>
            <span>{name}</span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      <div className="section-heading">
        <div>
          <h2>
            {q
              ? "Search results"
              : category === "All"
                ? "All Actors"
                : category}
          </h2>
          <span>
            {actors
              ? `${filtered.length} tools to make the web work for you`
              : !error && "Loading tools…"}
          </span>
        </div>
        <button
          className="text-button"
          onClick={() => {
            setCategory("All");
            setQ("");
          }}
        >
          View all Actors <ArrowRight size={16} />
        </button>
      </div>
      {error && <Notice error>The catalog could not be loaded: {error}</Notice>}
      <div className="actor-grid">
        {filtered.map((a) => (
          <Link key={a.id} className="actor-card" to={"/actors/" + a.id}>
            <div className="actor-card-head">
              <ActorIcon actor={a} />
              <div className="actor-card-title">
                <h3>{a.name}</h3>
                <div className="actor-slug">{a.slug || "leeds/" + a.id}</div>
              </div>
            </div>
            <p>{a.description}</p>
            <div className="card-footer">
              <span>
                <img src="/favicon.png" alt="" /> Leeds Harvester
              </span>
              <span
                className={
                  "status-pill " + (a.status === "ready" ? "ready" : "")
                }
              >
                {actorStatusLabel(a)}
              </span>
            </div>
          </Link>
        ))}
      </div>
      {!actors && !error && <Loading text="Loading the catalog…" />}
      {actors && !filtered.length && (
        <Empty
          icon={Search}
          title="No Actors found"
          text="Try another search or choose a different category."
        />
      )}
      <div className="build-banner">
        <div className="banner-icon">
          <Code2 size={26} />
        </div>
        <div>
          <h3>Your next workflow starts with a URL.</h3>
          <p>Run an Actor, save a task, and export the data you need.</p>
        </div>
        <Link className="btn" to="/getting-started">
          Get started <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}
