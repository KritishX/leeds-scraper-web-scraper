import React from "react";
import { Link } from "react-router-dom";
import {
  Box,
  ChevronRight,
  Code2,
  FileText,
  Link2,
  Mail,
  MessageSquare,
  Play,
  Search,
  MapPin,
  FileCode2,
  Braces,
  ShoppingCart,
  Table2,
  MousePointerClick,
  Rss,
  Bot,
} from "lucide-react";
import type { Actor, Run } from "../api/client";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className={"brand " + (small ? "small" : "")}>
      <img src="/favicon.png" alt="" />
      <span>
        Leeds<span className="brand-light"> Harvester</span>
      </span>
    </Link>
  );
}

const actorIcons: Record<string, any> = {
  "website-content": FileText,
  "page-markdown": FileCode2,
  "contact-extractor": Mail,
  "local-business-leads": MapPin,
  "website-links": Link2,
  "metadata-extractor": Code2,
  "structured-data": Braces,
  "product-data": ShoppingCart,
  "table-extractor": Table2,
  "custom-selectors": MousePointerClick,
  "feed-reader": Rss,
  "social-embeds": MessageSquare,
  "tiktok-scraper": Play,
  "instagram-scraper": MessageSquare,
  "instagram-profile": Box,
  "instagram-reel": Play,
  "facebook-search-posts": Search,
  "tiktok-search": Search,
  "google-maps-scraper": MapPin,
  "google-search-scraper": Search,
  "youtube-scraper": Play,
  "ai-extract": Bot,
};

export function ActorIcon({ actor }: { actor: Actor }) {
  const Icon = actorIcons[actor.id] ?? FileText;
  return (
    <span className={"actor-icon " + (actor.color || "green")}>
      <Icon size={24} />
    </span>
  );
}

export function Heading({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}

export function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return <div className={"notice " + (error ? "error" : "")}>{children}</div>;
}

export function Empty({
  icon: Icon = Box,
  title,
  text,
  action,
}: {
  icon?: any;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={26} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function RunTable({ runs }: { runs: Run[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Actor / Run ID</th>
            <th>Status</th>
            <th>Created</th>
            <th>Records</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>
                <Link to={"/runs/" + r.id}>
                  <strong>{r.actorName || r.actorId}</strong>
                  <small className="mono">{r.id}</small>
                </Link>
              </td>
              <td>
                <span className={"run-status " + r.status}>{r.status}</span>
              </td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.resultCount ?? "—"}</td>
              <td>
                <Link to={"/runs/" + r.id} aria-label="Open run details">
                  <ChevronRight size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
