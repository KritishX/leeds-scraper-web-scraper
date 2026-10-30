import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  Box,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  Database,
  FileText,
  Globe2,
  LayoutDashboard,
  Leaf,
  Menu,
  MessageSquare,
  Play,
  Search,
  Settings,
  Sparkles,
  Store,
  Workflow,
} from "lucide-react";
import { api } from "../api/client";
import { Brand, Notice } from "../components/common";
import { Landing } from "../pages/Landing";
import { AppRoutes } from "../routes";
import { ErrorBoundary } from "../components/ErrorBoundary";

const nav = [
  ["Store", "/store", Store],
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Actors", "/actors", Box],
  ["Runs", "/runs", Play],
  ["Tasks", "/tasks", FileText],
  ["Integrations", "/integrations", Workflow],
  ["Schedules", "/schedules", CalendarDays],
] as const;

export function Shell() {
  const [workspace, setWorkspace] = useState<{ name: string } | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    api("/workspace")
      .then((d) => setWorkspace(d.workspace))
      .catch((e) => setWorkspaceError(e.message));
  }, []);
  useEffect(() => setMobile(false), [loc.pathname]);
  if (loc.pathname === "/")
    return (
      <ErrorBoundary>
        <Landing />
      </ErrorBoundary>
    );
  const initial = workspace?.name?.slice(0, 1) || "L";
  return (
    <div className="shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Brand small />
        <Link className="workspace" to="/settings">
          <span className="avatar">{initial}</span>
          <span>
            {workspace?.name || "Local workspace"}
            <small>Local workspace</small>
          </span>
          <ChevronDown size={15} />
        </Link>
        <Link to="/store" className="sidebar-search">
          <Search size={15} /> Search the store
        </Link>
        <NavLink className="get-started" to="/getting-started">
          <Sparkles size={16} /> Get started <span>3 steps</span>
        </NavLink>
        <nav>
          {nav.map(([name, path, Icon]) => (
            <NavLink key={path} to={path}>
              <Icon size={17} />
              {name}
              {name === "Store" && <span className="new-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="nav-label">DEVELOPMENT</div>
        <nav>
          {[
            ["My Actors", "/actors", Code2],
            ["Insights", "/insights", ChartNoAxesCombined],
            ["Messaging", "/messaging", MessageSquare],
            ["Proxy", "/proxy", Globe2],
            ["Storage", "/storage", Database],
            ["Billing", "/billing", CreditCard],
            ["Settings", "/settings", Settings],
          ].map(([name, path, Icon]: any) => (
            <NavLink key={path} to={path}>
              <Icon size={17} />
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span /> Local environment
          </div>
          <a
            href="https://developer.mozilla.org/en-US/docs/Web/HTTP"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={16} /> Web data guide <ArrowUpRight size={13} />
          </a>
          <Link to="/getting-started">
            <CircleHelp size={16} /> Help & getting started
          </Link>
          <div className="sidebar-footer">
            Leeds Harvester <span>v0.2</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />{" "}
            <span>{loc.pathname.split("/")[1].replace(/-/g, " ")}</span>
          </div>
          <div className="top-actions">
            <span className="environment">
              <span /> Local
            </span>
            <Link to="/getting-started" aria-label="Help and getting started">
              <CircleHelp size={17} />
            </Link>
            <Link
              className="user-circle"
              to="/settings"
              aria-label="Workspace settings"
            >
              {initial}
            </Link>
          </div>
        </header>
        <main>
          {workspaceError && (
            <Notice error>
              The workspace could not be loaded: {workspaceError}
            </Notice>
          )}
          <ErrorBoundary key={loc.pathname}>
            <AppRoutes workspace={workspace} setWorkspace={setWorkspace} />
          </ErrorBoundary>
        </main>
        <footer className="page-footer">
          <span>Leeds Harvester · Your web data workspace</span>
          <span>
            Built for the open web <Leaf size={13} />
          </span>
        </footer>
      </div>
    </div>
  );
}
