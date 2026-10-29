import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Code2,
  CreditCard,
  Database,
  FileText,
  Globe2,
  LayoutDashboard,
  Leaf,
  Link2,
  Mail,
  Menu,
  MessageSquare,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Workflow,
  X,
  Zap,
  MapPin,
  FileCode2,
  Braces,
  ShoppingCart,
  Table2,
  MousePointerClick,
  Rss,
  Bot,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import "./styles.css";
import { parseActorInput } from "./actor-input";
import {
  THEME_LABELS,
  THEME_ORDER,
  nextPreference,
  useTheme,
  type ThemePreference,
} from "./theme";
type Actor = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  color?: string;
  status: string;
  mode?: string;
  notice?: string | null;
  fields: Field[];
  documentation?: { overview: string; output: { name: string; description: string }[]; limitations: string[] };
};
const isRunnable = (actor: Actor) => ["ready", "access-limited"].includes(actor.status);
const actorStatusLabel = (actor: Actor) => actor.status === "access-limited" ? "Public access limited" : actor.status === "ready" ? "Ready to run" : "Provider required";
// Input fields are declared by the server catalog; forms render from them.
type Field = {
  name: string;
  type: "urls" | "number" | "boolean" | "select" | "text" | "textarea";
  label: string;
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
};
const splitUrls = (text: string) =>
  text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
const initialValues = (fields: Field[]) =>
  Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "urls"
        ? ""
        : (f.default ??
          (f.type === "boolean" ? false : f.type === "number" ? (f.min ?? 1) : "")),
    ]),
  );
// Converts form values to the run input the server validates.
function toInput(fields: Field[], values: Record<string, any>) {
  const input: Record<string, any> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === "urls") input[f.name] = splitUrls(v ?? "");
    else if (f.type === "number") input[f.name] = Number(v);
    else if (f.type === "boolean") input[f.name] = Boolean(v);
    else if (typeof v === "string" && v.trim()) input[f.name] = v;
  }
  if (input.category && input.category !== "custom") delete input.customTag;
  return input;
}
function useInputValues(fields: Field[] | undefined) {
  const [values, setValues] = useState<Record<string, any>>({});
  useEffect(() => {
    if (fields) setValues(initialValues(fields));
  }, [fields]);
  // Start URLs count toward the page limit, so it never drops below them.
  const urlCount = splitUrls(values.urls ?? "").length;
  useEffect(() => {
    if (fields?.some((f) => f.name === "maxPages") && (values.maxPages ?? 1) < urlCount)
      setValues((v) => ({ ...v, maxPages: Math.min(20, urlCount) }));
  }, [urlCount]);
  return [values, setValues] as const;
}
function InputFields({
  fields,
  values,
  onChange,
  urlLists = false,
}: {
  fields: Field[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  urlLists?: boolean;
}) {
  const set = (name: string, value: any) => onChange({ ...values, [name]: value });
  return (
    <>
      {fields.map((f) => {
        if (f.name === "customTag" && values.category !== "custom") return null;
        // One element, so the label's column layout keeps the asterisk inline.
        const label = (
          <span>
            {f.label} {f.required && <span className="required">*</span>}
          </span>
        );
        const help = f.help && <small>{f.help}</small>;
        if (f.type === "urls" && urlLists)
          return <UrlList key={f.name} field={f} value={values[f.name] ?? ""} onChange={(value) => set(f.name, value)} />;
        if (f.type === "boolean")
          return (
            <label className="check-field" key={f.name}>
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
              />
              <span>
                {f.label}
                {help}
              </span>
            </label>
          );
        return (
          <label key={f.name}>
            {label}
            {f.type === "urls" || f.type === "textarea" ? (
              <textarea
                rows={f.type === "urls" ? 4 : 6}
                className={f.name === "selectors" ? "mono" : undefined}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : f.type === "select" ? (
              <select
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "number" ? (
              <input
                type="number"
                min={
                  f.name === "maxPages"
                    ? Math.max(f.min ?? 1, splitUrls(values.urls ?? "").length)
                    : f.min
                }
                max={f.max}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, Number(e.target.value))}
              />
            ) : (
              <input
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {help}
          </label>
        );
      })}
    </>
  );
}
type Run = {
  id: string;
  actorId: string;
  status: string;
  createdAt: string;
  finishedAt?: string;
  resultCount: number;
  results: Record<string, unknown>[];
  error?: string;
  input?: any;
  [key: string]: any;
};
// The server catalog owns Actor identity and status; screens share one request.
let catalogRequest: Promise<Actor[]> | null = null;
function useCatalog() {
  const [actors, setActors] = useState<Actor[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    catalogRequest ??= api("/catalog")
      .then((d) => d.actors as Actor[])
      .catch((e) => {
        catalogRequest = null;
        throw e;
      });
    catalogRequest.then(setActors).catch((e) => setError(e.message));
  }, []);
  return { actors, error };
}
async function api(path: string, options: RequestInit = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("The server is unavailable. Please try again.");
  }
  if (!r.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message || data.message || "Request failed",
    );
  return data;
}
const nav = [
  ["Store", "/store", Store],
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Actors", "/actors", Box],
  ["Runs", "/runs", Play],
  ["Tasks", "/tasks", FileText],
  ["Integrations", "/integrations", Workflow],
  ["Schedules", "/schedules", CalendarDays],
] as const;
function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className={"brand " + (small ? "small" : "")}>
      <img src="/favicon.png" alt="" />
      <span>
        Leeds<span className="brand-light"> Harvester</span>
      </span>
    </Link>
  );
}
const THEME_ICONS: Record<ThemePreference, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const next = nextPreference(preference);
  const Icon = THEME_ICONS[preference];
  const label = `Theme: ${THEME_LABELS[preference]}. Switch to ${THEME_LABELS[next]}.`;
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setPreference(next)}
    >
      <Icon size={17} />
    </button>
  );
}
function App() {
  const [workspace, setWorkspace] = useState<{ name: string } | null>(null);
  const [mobile, setMobile] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    api("/workspace")
      .then((d) => setWorkspace(d.workspace))
      .catch(() => {});
  }, []);
  useEffect(() => setMobile(false), [loc.pathname]);
  if (loc.pathname === "/") return <Landing />;
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
            <ThemeToggle />
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
          <Routes>
            <Route path="/store" element={<StorePage />} />
            <Route path="/actors/:id" element={<ActorPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/actors" element={<StorePage mine />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  workspace={workspace}
                  setWorkspace={setWorkspace}
                />
              }
            />
            <Route path="/billing" element={<Billing />} />
            <Route path="/insights" element={<Dashboard insights />} />
            <Route path="/proxy" element={<Information kind="proxy" />} />
            <Route
              path="/messaging"
              element={<Information kind="messaging" />}
            />
            <Route path="/getting-started" element={<GettingStarted />} />
            {/* Former account pages: the workspace needs no sign-in. */}
            <Route path="/login" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/signup"
              element={<Navigate to="/dashboard" replace />}
            />
            <Route
              path="*"
              element={
                <Empty
                  icon={Search}
                  title="Page not found"
                  text="This page does not exist."
                  action={
                    <Link className="btn primary" to="/store">
                      Go to the store
                    </Link>
                  }
                />
              }
            />
          </Routes>
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
function ActorIcon({ actor }: { actor: Actor }) {
  const Icon = actorIcons[actor.id] ?? FileText;
  return (
    <span className={"actor-icon " + (actor.color || "green")}>
      <Icon size={24} />
    </span>
  );
}
function StorePage({ mine = false }: { mine?: boolean }) {
  const { actors = [], error } = useCatalog();
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
  const categories = [...new Set(actors.map((a) => a.category))].map(
    (name) => [name, ...(categoryStyle[name] ?? [Box, "blue"])] as const,
  );
  const filtered = actors.filter(
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
          <span>{filtered.length} tools to make the web work for you</span>
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
      {error && (
        <Notice error>The catalog could not be loaded: {error}</Notice>
      )}
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
      {!filtered.length && (
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
function Heading({
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
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return <div className={"notice " + (error ? "error" : "")}>{children}</div>;
}
function Empty({
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
function UrlList({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) {
  const [bulk, setBulk] = useState(false);
  // Keep blank rows while editing; splitUrls normalizes only at submission.
  const rows = value.split("\n");
  return <fieldset className="url-list">
    <legend>{field.label} {field.required && <span className="required">*</span>}</legend>
    <div className="url-list-heading"><small>{field.help}</small><button type="button" className="text-button" onClick={() => setBulk(!bulk)}>{bulk ? "Edit individual URLs" : "Bulk edit"}</button></div>
    {bulk ? <label><span className="sr-only">{field.label}, one URL per line</span><textarea rows={6} placeholder={field.placeholder} value={value} onChange={(e) => onChange(e.target.value)} /></label> : rows.map((url, index) => <div className="url-row" key={index}>
      <span className="url-index">{index + 1}</span><input aria-label={`${field.label} ${index + 1}`} placeholder={field.placeholder} value={url} onChange={(e) => onChange(rows.map((row, i) => i === index ? e.target.value : row).join("\n"))} />
      <button type="button" className="icon-button" aria-label={`Remove URL ${index + 1}`} onClick={() => onChange(rows.filter((_, i) => i !== index).join("\n"))}><X size={16} /></button>
    </div>)}
    {!bulk && <button type="button" className="btn" disabled={rows.length >= (field.max ?? 20)} onClick={() => onChange(value + "\n")}><Plus size={14} /> Add URL</button>}
    <small>{splitUrls(value).length} URLs · maximum {field.max ?? 20}</small>
  </fieldset>;
}

function ActorPage() {
  const { id } = useParams();
  const { actors, error: catalogError } = useCatalog();
  const actor = actors?.find((a) => a.id === id);
  const [values, setValues] = useInputValues(actor?.fields);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("Form");
  const [json, setJson] = useState("");
  const [showTask, setShowTask] = useState(false);
  const [taskName, setTaskName] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = ["Input", "README", "Output", "Runs", "API"];
  const requestedTab = new URLSearchParams(location.search).get("tab")?.toLowerCase() ?? location.hash.slice(1).toLowerCase();
  const tab = tabs.find((item) => item.toLowerCase() === requestedTab) ?? "Input";
  const selectTab = (next: string) => {
    const query = new URLSearchParams(location.search);
    query.set("tab", next.toLowerCase());
    navigate({ pathname: location.pathname, search: query.toString(), hash: "" }, { replace: true });
  };
  useEffect(() => { setMode("Form"); setJson(""); setError(""); setShowTask(false); setTaskName(""); }, [id]);
  function currentInput() {
    if (!actor) return {};
    if (mode === "Form") return toInput(actor.fields, values);
    return parseActorInput(json, actor.fields);
  }
  function changeMode(next: string) {
    if (!actor || next === mode) return;
    try {
      if (next === "JSON") setJson(JSON.stringify(toInput(actor.fields, values), null, 2));
      else {
        const input = parseActorInput(json, actor.fields);
        setValues(Object.fromEntries(actor.fields.map((field) => [field.name, field.type === "urls" ? (input[field.name] ?? []).join("\n") : (input[field.name] ?? initialValues(actor.fields)[field.name])])));
      }
      setError(""); setMode(next);
    } catch (e: any) { setError(e.message); }
  }
  async function start() {
    if (!actor) return;
    setBusy(true); setError("");
    try {
      const input = currentInput();
      const d = await api("/runs", { method: "POST", body: JSON.stringify({ actorId: id, input }) });
      navigate("/runs/" + (d.run?.id || d.id));
    } catch (e: any) { setError(e.message); selectTab("Input"); }
    finally { setBusy(false); }
  }
  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!actor) return;
    setBusy(true); setError("");
    try {
      await api("/tasks", { method: "POST", body: JSON.stringify({ name: taskName, actorId: id, input: currentInput() }) });
      navigate("/tasks");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  function reset() {
    if (!actor) return;
    const defaults = initialValues(actor.fields);
    setValues(defaults); setJson(JSON.stringify(toInput(actor.fields, defaults), null, 2)); setError("");
  }
  if (catalogError) return <Notice error>The catalog could not be loaded: {catalogError}</Notice>;
  if (!actors) return <Empty title="Loading Actor" text="Fetching Actor details…" />;
  if (!actor) return <Empty icon={Search} title="Actor not found" text="This Actor is not in the catalog." action={<Link className="btn primary" to="/store">Back to Store</Link>} />;
  const runOptions = actor.fields.filter((field) => field.type === "number" || field.type === "boolean");
  const inputFields = actor.fields.filter((field) => !runOptions.includes(field));
  const output = actor.documentation?.output ?? [];
  const inputExample = mode === "JSON" ? json : JSON.stringify(toInput(actor.fields, values), null, 2);
  let apiInput: Record<string, any> | undefined;
  let apiInputError = "";
  try { apiInput = currentInput(); } catch (e: any) { apiInputError = e.message; }
  const apiExample = apiInput ? [
    `curl -X POST '${window.location.origin}/api/runs'`,
    "  -H 'Content-Type: application/json'",
    `  -H 'Origin: ${window.location.origin}'`,
    `  --data '${JSON.stringify({ actorId: actor.id, input: apiInput }, null, 2).replace(/'/g, "'\\''")}'`,
  ].join(" \\\n") : "";
  return <div className="actor-workspace">
    <Link className="back-link" to="/store"><ChevronLeft size={15} /> Back to Store</Link>
    <div className="actor-detail-heading"><ActorIcon actor={actor} /><div className="actor-identity"><span className="actor-category">{actor.category}</span><h1>{actor.name}</h1><span className="actor-slug">{actor.slug}</span></div><span className={"status-pill " + (actor.status === "ready" ? "ready" : "")}>{actorStatusLabel(actor)}</span></div>
    <p className="detail-description">{actor.description}</p>
    <div className="actor-toolbar"><div className="actor-actions"><button className="btn primary" disabled={busy || !isRunnable(actor)} onClick={start}><Play size={15} />{busy ? "Working…" : "Start"}</button><button className="btn" disabled={busy || !isRunnable(actor)} onClick={() => { selectTab("Input"); setShowTask(!showTask); }}><FileText size={15} /> Save as task</button><button className="btn" onClick={() => selectTab("API")}><Code2 size={15} /> API</button></div><span className="local-execution"><ShieldCheck size={14} /> Local execution</span></div>
    <nav className="tabs actor-tabs" aria-label="Actor sections">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} aria-current={tab === item ? "page" : undefined} onClick={() => selectTab(item)}>{item}</button>)}</nav>
    {error && <div role="alert"><Notice error>{error}</Notice></div>}
    {actor.notice && <Notice>{actor.notice}</Notice>}
    {tab === "Input" ? <div className="two-column actor-input-layout"><div>
      {showTask && <form className="panel actor-task-form" onSubmit={saveTask}><div className="panel-header"><h2>Save this input as a task</h2><button type="button" className="icon-button" aria-label="Close save task" onClick={() => setShowTask(false)}><X size={16} /></button></div><label>Task name<input required maxLength={120} value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder={actor.name} /></label><button className="btn primary" disabled={busy}>Save task</button></form>}
      <section className="panel actor-input-panel"><div className="panel-header"><div><h2>Input</h2><p>Configure what this Actor collects.</p></div><div className="segmented" aria-label="Input editor">{["Form", "JSON"].map((item) => <button key={item} aria-pressed={mode === item} className={mode === item ? "active" : ""} onClick={() => changeMode(item)}>{item === "JSON" && <Braces size={13} />}{item}</button>)}</div></div>
      {mode === "JSON" ? <label>Input JSON<textarea className="mono json-input" rows={18} value={json} spellCheck={false} onChange={(e) => { setJson(e.target.value); setError(""); }} /><small>Use the field names and types in the README. Input is validated before a run or task is created.</small></label> : <><InputFields fields={inputFields} values={values} onChange={setValues} urlLists />{runOptions.length > 0 && <div className="run-options"><h3>Run options</h3><p>Collection limits and request behavior.</p><InputFields fields={runOptions} values={values} onChange={setValues} /></div>}</>}
      <div className="form-footer"><button className="text-button" onClick={reset}>Reset to defaults</button><button className="btn primary" disabled={busy || !isRunnable(actor)} onClick={start}><Play size={15} />{busy ? "Working…" : "Start run"}</button></div></section>
    </div><aside className="panel info-panel actor-guide"><span className="guide-eyebrow"><BookOpen size={15} /> BEFORE YOU START</span><h3>{actor.name}</h3><p>{actor.documentation?.overview ?? actor.description}</p><ol><li>Enter your targets and configure the input.</li><li>Set collection limits, then start your run.</li><li>Review the run output and export JSON, JSONL or CSV.</li></ol><hr /><h4>Collection boundaries</h4><p>Use public data you are authorized to collect. Target access rules and availability can limit results.</p><button className="text-button" onClick={() => selectTab("README")}>Read the documentation <ArrowRight size={14} /></button></aside></div>
    : tab === "README" ? <div className="actor-doc-layout"><article className="panel prose actor-readme"><span className="guide-eyebrow">ACTOR DOCUMENTATION</span><h2 id="overview">{actor.name}</h2><p>{actor.documentation?.overview ?? actor.description}</p><h3 id="quick-start">Quick start</h3><ol><li>Open Input and enter the required fields.</li><li>Review the run options and select Start.</li><li>Open the completed run to inspect and export the collected records.</li></ol><h3 id="parameters">Input parameters</h3><div className="parameter-list">{actor.fields.map((field) => <section key={field.name}><div><code>{field.name}</code><span className="parameter-type">{field.type}{field.required ? " · required" : " · optional"}</span></div><h4>{field.label}</h4><p>{field.help ?? field.placeholder ?? `Configure ${field.label.toLowerCase()}.`}</p>{field.options && <p>Options: {field.options.map((option) => option.value).join(", ")}</p>}{field.min !== undefined && <small>Range: {field.min}–{field.max}</small>}{field.default !== undefined && <small>Default: {String(field.default)}</small>}</section>)}</div><h3 id="output-guide">Output</h3><p>Records are available from each run as JSON, JSONL or CSV. See the Output tab for this Actor’s fields.</p><h3 id="limitations">Limitations & responsible use</h3><ul>{(actor.documentation?.limitations ?? ["Results depend on the target’s public data and availability."]).map((limit) => <li key={limit}>{limit}</li>)}</ul><p>Only public resources are supported. Private network targets are blocked; website access rules and request limits apply.</p><h3 id="api-guide">API access</h3><p>Start this Actor with <code>POST /api/runs</code>, using its ID and input object. The API tab builds a request from your current input.</p><button className="btn" onClick={() => selectTab("API")}><Code2 size={14} /> Open API example</button></article><aside className="panel actor-toc"><h3>On this page</h3>{[["overview", "Overview"], ["quick-start", "Quick start"], ["parameters", "Input parameters"], ["output-guide", "Output"], ["limitations", "Limitations"], ["api-guide", "API access"]].map(([anchor, label]) => <Link key={anchor} to={`?tab=readme#${anchor}`} onClick={() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" })}>{label}</Link>)}</aside></div>
    : tab === "Output" ? <section className="panel prose"><h2>Output schema</h2><p>{actor.name} returns the following record fields. Optional values can be empty when the source does not provide them. These are field definitions; collected records appear in Runs.</p><div className="table-wrap"><table><thead><tr><th>Field</th><th>Description</th></tr></thead><tbody>{output.map((field) => <tr key={field.name}><td><code>{field.name}</code></td><td>{field.description}</td></tr>)}</tbody></table></div><button className="btn" onClick={() => selectTab("Runs")}>View runs <ArrowRight size={14} /></button></section>
    : tab === "Runs" ? <Runs actorId={id} />
    : <section className="panel prose actor-api"><h2>Run this Actor through the API</h2><p>This request uses your current input. Fill required targets in the Input tab before sending it. Your local server must be running.</p><div className="api-endpoint"><span>POST</span><code>/api/runs</code></div><h3>cURL</h3>{apiInputError ? <Notice error>{apiInputError} Correct the input in the JSON editor to generate a request.</Notice> : <pre>{apiExample}</pre>}<h3>Input object</h3><pre>{inputExample}</pre><p>The response includes the run ID. Open <code>GET /api/runs/:id</code> to retrieve its status and records.</p></section>}
  </div>;
}
function Dashboard({ insights = false }: { insights?: boolean }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    api("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Heading
        title={insights ? "Insights" : "Welcome to your workspace"}
        text={
          insights
            ? "A clear view of your collection activity."
            : "Make your next move with better web data."
        }
        action={
          <Link className="btn primary" to="/store">
            <Plus size={16} /> Start a new run
          </Link>
        }
      />
      {error && <Notice error>{error}</Notice>}
      <div className="stats-grid">
        {[
          ["Total runs", data?.stats?.totalRuns ?? 0, Play],
          ["Successful runs", data?.stats?.succeededRuns ?? 0, Check],
          ["Records collected", data?.stats?.totalResults ?? 0, Database],
          ["Saved tasks", data?.stats?.tasks ?? 0, FileText],
        ].map(([label, value, Icon]: any) => (
          <div className="stat panel" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>Your local workspace</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Recent runs</h2>
          <Link className="text-button" to="/runs">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {data?.recentRuns?.length ? (
          <RunTable runs={data.recentRuns} />
        ) : (
          <Empty
            icon={Play}
            title="Your first dataset is one run away"
            text="Choose an Actor from the Store and give it a website URL. Your results will appear here."
            action={
              <Link className="btn" to="/store">
                Explore the Store <ArrowRight size={15} />
              </Link>
            }
          />
        )}
      </section>
      <div className="quick-grid">
        <Link to="/tasks" className="panel">
          <FileText size={23} />
          <h3>Save your workflow</h3>
          <p>Keep your Actor input as a reusable task.</p>
          <span>
            Manage tasks <ArrowRight size={14} />
          </span>
        </Link>
        <Link to="/storage" className="panel">
          <Database size={23} />
          <h3>Your data, organized</h3>
          <p>Browse run datasets and export your results.</p>
          <span>
            Open storage <ArrowRight size={14} />
          </span>
        </Link>
        <Link to="/getting-started" className="panel">
          <BookOpen size={23} />
          <h3>A little guidance</h3>
          <p>Go from your first URL to your first dataset.</p>
          <span>
            Read the quick start <ArrowRight size={14} />
          </span>
        </Link>
      </div>
    </>
  );
}
function RunTable({ runs }: { runs: Run[] }) {
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
function Runs({ actorId }: { actorId?: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api("/runs")
        .then((d) => {
          if (!active) return;
          setRuns(d.runs);
          setError("");
        })
        .catch((e) => active && setError(e.message));
    refresh();
    const t = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  const shown = actorId ? runs.filter((r) => r.actorId === actorId) : runs;
  return (
    <>
      {!actorId && (
        <Heading
          title="Runs"
          text="Track your Actors from start to finish."
          action={
            <Link className="btn primary" to="/store">
              <Plus size={16} /> New run
            </Link>
          }
        />
      )}{" "}
      {error && <Notice error>{error}</Notice>}
      <section className="panel">
        {shown.length ? (
          <RunTable runs={shown} />
        ) : (
          <Empty
            icon={Play}
            title="No runs yet"
            text="Your run history and results will appear here when you start an Actor."
            action={
              <Link className="btn" to="/store">
                Find an Actor <ArrowRight size={15} />
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
function RunDetail() {
  const { id } = useParams();
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Output");
  const path = "/runs/" + encodeURIComponent(id || "");
  // Polls only while the run can still change; finished runs carry their full
  // dataset, so they are fetched once.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = () =>
      api(path)
        .then((d) => {
          if (!active) return;
          setRun(d.run);
          setError("");
          if (["QUEUED", "RUNNING"].includes(d.run.status))
            timer = setTimeout(load, 2500);
        })
        .catch((e) => active && setError(e.message));
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path]);
  async function cancel() {
    try {
      await api(path + "/abort", { method: "POST" });
      setRun((await api(path)).run);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <>
      <Link to="/runs" className="back-link">
        <ChevronLeft size={15} /> All runs
      </Link>
      <Heading
        title={run?.actorName || run?.actorId || "Run details"}
        text={id}
        action={
          <div className="button-row">
            {run && ["RUNNING", "QUEUED"].includes(run.status) && (
              <button className="btn danger" onClick={cancel}>
                Cancel run
              </button>
            )}
            <a className="btn" href={"/api" + path + "/export?format=csv"}>
              <ArrowDownToLine size={15} /> CSV
            </a>
            <a className="btn" href={"/api" + path + "/export?format=json"}>
              <ArrowDownToLine size={15} /> JSON
            </a>
            <a className="btn" href={"/api" + path + "/export?format=jsonl"}>
              <ArrowDownToLine size={15} /> JSONL
            </a>
          </div>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {run && (
        <>
          <div className="run-summary panel">
            <div>
              <small>Status</small>
              <span className={"run-status " + run.status}>{run.status}</span>
            </div>
            <div>
              <small>Created</small>
              <span>{new Date(run.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <small>Records</small>
              <strong>{run.resultCount ?? 0}</strong>
            </div>
            <div>
              <small>Finished</small>
              <span>
                {run.finishedAt
                  ? new Date(run.finishedAt).toLocaleTimeString()
                  : "—"}
              </span>
            </div>
          </div>
          {run.error && <Notice error>{run.error}</Notice>}
          <div className="tabs">
            {["Output", "Input", "Details"].map((t) => (
              <button
                className={t === tab ? "active" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </button>
            ))}
          </div>
          <section className="panel">
            {tab === "Input" ? (
              <pre>{JSON.stringify(run.input, null, 2)}</pre>
            ) : tab === "Details" ? (
              <pre>
                {JSON.stringify(
                  {
                    ...run,
                    results: undefined,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : (
              <DataOutput run={run} />
            )}
          </section>
        </>
      )}
    </>
  );
}
function DataOutput({ run }: { run: Run }) {
  const records = (run.results || []) as any[];
  if (!records.length)
    return (
      <Empty
        icon={Database}
        title={
          ["RUNNING", "QUEUED"].includes(run.status)
            ? "Collecting your data…"
            : "No records collected"
        }
        text={
          ["RUNNING", "QUEUED"].includes(run.status)
            ? "This page refreshes automatically while your Actor works."
            : "Review the run details for request errors or try another website."
        }
      />
    );
  const keys = Array.from(
    new Set(records.flatMap((r) => Object.keys(r))),
  );
  return (
    <>
      <div className="panel-header">
        <h2>Dataset</h2>
        <span className="muted">{records.length} records</span>
      </div>
      <div className="table-wrap output-table">
        <table>
          <thead>
            <tr>
              {keys.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                {keys.map((k) => (
                  <td key={k}>
                    {r[k] == null
                      ? "—"
                      : typeof r[k] === "object"
                        ? JSON.stringify(r[k])
                        : String(r[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Tasks() {
  const { actors } = useCatalog();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [actorId, setActorId] = useState("website-content");
  const actor = actors?.find((a) => a.id === actorId);
  const [values, setValues] = useInputValues(actor?.fields);
  const nav = useNavigate();
  const load = () =>
    api("/tasks")
      .then((d) => setItems(d.tasks))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          name,
          actorId,
          input: actor ? toInput(actor.fields, values) : {},
        }),
      });
      setShow(false);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function start(t: any) {
    try {
      const d = await api("/runs", {
        method: "POST",
        body: JSON.stringify({ actorId: t.actorId, input: t.input }),
      });
      nav("/runs/" + (d.run?.id || d.id));
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <>
      <Heading
        title="Tasks"
        text="Save Actor inputs once. Run them whenever you need."
        action={
          <button className="btn primary" onClick={() => setShow(true)}>
            <Plus size={16} /> Create task
          </button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {show && (
        <section className="panel">
          <form onSubmit={save}>
            <div className="panel-header">
              <h2>Create a task</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close form"
                onClick={() => setShow(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label>
              Task name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My website research"
              />
            </label>
            <label>
              Actor
              <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
                {(actors ?? [])
                  .filter(isRunnable)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            {actor && (
              <InputFields
                fields={actor.fields}
                values={values}
                onChange={setValues}
              />
            )}
            <button className="btn primary">Save task</button>
          </form>
        </section>
      )}
      <section className="panel">
        {!items.length ? (
          <Empty
            icon={FileText}
            title="Keep your favorite workflows close"
            text="Create a task to save an Actor and its input for next time."
            action={
              <button className="btn" onClick={() => setShow(true)}>
                <Plus size={15} /> Create your first task
              </button>
            }
          />
        ) : (
          items.map((t) => (
            <div className="list-row" key={t.id}>
              <FileText size={20} />
              <div>
                <strong>{t.name}</strong>
                <small>
                  {actors?.find((a) => a.id === t.actorId)?.name ?? t.actorId}
                  {t.input?.urls?.[0]
                    ? ` · ${t.input.urls[0]}`
                    : t.input?.place
                      ? ` · ${t.input.place}`
                      : ""}
                </small>
              </div>
              <button className="btn" onClick={() => start(t)}>
                <Play size={14} /> Run
              </button>
              <button
                className="icon-button"
                aria-label="Delete task"
                onClick={async () => {
                  try {
                    await api("/tasks/" + t.id, { method: "DELETE" });
                    load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </section>
    </>
  );
}
function Schedules() {
  const [items, setItems] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState("");
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * *");
  const load = () =>
    api("/schedules")
      .then((d) => setItems(d.schedules))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api("/tasks")
      .then((d) => {
        setTasks(d.tasks);
        setTaskId(d.tasks[0]?.id || "");
      })
      .catch(() => {});
  }, []);
  return (
    <>
      <Heading
        title="Schedules"
        text="Put your saved tasks on a recurring schedule."
        action={
          <button className="btn primary" onClick={() => setShow(true)}>
            <Plus size={16} /> Create schedule
          </button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {show && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/schedules", {
                method: "POST",
                body: JSON.stringify({ name, taskId, cron, enabled: true }),
              });
              setShow(false);
              load();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <div className="panel-header">
            <h2>New schedule</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close form"
              onClick={() => setShow(false)}
            >
              <X size={18} />
            </button>
          </div>
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Saved task
            <select
              required
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            >
              <option value="">Choose a task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cron expression
            <input
              required
              value={cron}
              onChange={(e) => setCron(e.target.value)}
            />
            <small>
              UTC timezone. Example: 0 9 * * * runs daily at 09:00 UTC.
            </small>
          </label>
          {!tasks.length && (
            <Notice>Create a saved task first from the Tasks page.</Notice>
          )}
          <button disabled={!tasks.length} className="btn primary">
            Save schedule
          </button>
        </form>
      )}
      <section className="panel">
        {items.length ? (
          items.map((s) => (
            <div className="list-row" key={s.id}>
              <CalendarDays size={20} />
              <div>
                <strong>{s.name}</strong>
                <small className="mono">
                  {s.cron
                    ? `${s.cron} · UTC`
                    : `Every ${s.intervalMinutes} min`}
                </small>
                {s.lastError && (
                  <small className="error-text">{s.lastError}</small>
                )}
                <small>
                  Next run:{" "}
                  {s.enabled && s.nextRunAt
                    ? new Date(s.nextRunAt).toLocaleString()
                    : "Paused"}
                </small>
              </div>
              <span className="status-pill">
                {s.enabled ? "Enabled" : "Paused"}
              </span>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await api("/schedules/" + s.id, {
                      method: "PATCH",
                      body: JSON.stringify({ enabled: !s.enabled }),
                    });
                    load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                {s.enabled ? "Pause" : "Enable"}
              </button>
              <button
                className="icon-button"
                aria-label="Delete schedule"
                onClick={async () => {
                  try {
                    await api("/schedules/" + s.id, { method: "DELETE" });
                    load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <Empty
            icon={CalendarDays}
            title="Let your workflows run on time"
            text="Create a schedule from a saved task to collect fresh data automatically."
            action={
              <button className="btn" onClick={() => setShow(true)}>
                <Plus size={15} /> Create schedule
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
function Storage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/runs")
      .then((d) => setRuns(d.runs))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Heading
        title="Storage"
        text="Your datasets, with their source and run history preserved."
      />
      {error && <Notice error>{error}</Notice>}
      <section className="panel">
        <div className="panel-header">
          <h2>Datasets</h2>
          <span className="muted">{runs.length} run datasets</span>
        </div>
        {runs.length ? (
          runs.map((r) => (
            <Link to={"/runs/" + r.id} className="list-row" key={r.id}>
              <Database size={20} />
              <div>
                <strong>{r.actorId}</strong>
                <small className="mono">{r.id}</small>
              </div>
              <span className="muted">{r.resultCount ?? 0} records</span>
              <ChevronRight size={17} />
            </Link>
          ))
        ) : (
          <Empty
            icon={Database}
            title="A home for your collected data"
            text="Each Actor run creates a dataset. Browse results here and export them as JSON or CSV."
            action={
              <Link className="btn" to="/store">
                Run your first Actor <ArrowRight size={15} />
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
function Integrations() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const load = () =>
    api("/integrations")
      .then((d) => setItems(d.integrations))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <Heading
        title="Integrations"
        text="Save your integration preferences for future connections."
        action={
          <button className="btn primary" onClick={() => setShow(true)}>
            <Plus size={16} /> Save integration preference
          </button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {show && (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("/integrations", {
                method: "POST",
                body: JSON.stringify({
                  name,
                  type: "webhook",
                  url,
                }),
              });
              setShow(false);
              load();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          <div className="panel-header">
            <h2>Integration preference</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close form"
              onClick={() => setShow(false)}
            >
              <X size={18} />
            </button>
          </div>
          <label>
            Name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Endpoint URL
            <input
              required
              type="url"
              placeholder="https://your-service.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <p className="muted">
            Saved locally; webhook delivery is not connected. No events will be
            sent to this endpoint.
          </p>
          <button className="btn primary">Save preference</button>
        </form>
      )}
      <section className="panel">
        {items.length ? (
          items.map((i) => (
            <div className="list-row" key={i.id}>
              <Workflow size={20} />
              <div>
                <strong>{i.name}</strong>
                <small>{i.url}</small>
              </div>
              <span className="status-pill">
                {i.enabled ? "Enabled" : "Disabled"}
              </span>
              <button
                className="icon-button"
                aria-label="Delete integration"
                onClick={async () => {
                  try {
                    await api("/integrations/" + i.id, { method: "DELETE" });
                    load();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <Empty
            icon={Workflow}
            title="Plan your next connection"
            text="Save a destination you plan to connect. Leeds Harvester stores it locally and does not send data to it."
            action={
              <button className="btn" onClick={() => setShow(true)}>
                <Plus size={15} /> Save a preference
              </button>
            }
          />
        )}
      </section>
      <Notice>
        Social and maps provider integrations are not configured in this
        release. Store templates are labeled accordingly.
      </Notice>
    </>
  );
}
function SettingsPage({
  workspace,
  setWorkspace,
}: {
  workspace: { name: string } | null;
  setWorkspace: (workspace: { name: string }) => void;
}) {
  const [name, setName] = useState(workspace?.name || "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (workspace) setName(workspace.name);
  }, [workspace]);
  return (
    <>
      <Heading title="Settings" text="Manage your local workspace." />
      <div className="settings-layout">
        <div className="settings-menu">
          <span className="active">Workspace</span>
          <Link to="/integrations">Integrations</Link>
          <Link to="/billing">Billing</Link>
        </div>
        <section className="panel">
          <div className="panel-header">
            <h2>Workspace</h2>
            <span className="user-circle">{name.slice(0, 1) || "L"}</span>
          </div>
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setMessage("");
              try {
                const d = await api("/settings", {
                  method: "PATCH",
                  body: JSON.stringify({ name }),
                });
                setWorkspace(d.workspace);
                setMessage("Workspace saved.");
              } catch (e: any) {
                setError(e.message);
              }
            }}
          >
            <label>
              Workspace name
              <input
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <small>Shown in the sidebar. No sign-in is needed.</small>
            </label>
            <button className="btn primary">Save changes</button>
          </form>
          <hr />
          <Appearance />
          <hr />
          <p className="muted">
            Everything in this workspace stays on this machine in the server’s
            data directory. Anyone who can reach the local server can use it.
          </p>
        </section>
      </div>
    </>
  );
}
function Appearance() {
  const { preference, setPreference } = useTheme();
  return (
    <fieldset className="appearance">
      <legend>Appearance</legend>
      <div className="appearance-options">
        {THEME_ORDER.map((option) => {
          const Icon = THEME_ICONS[option];
          return (
            <label key={option} className={preference === option ? "selected" : ""}>
              <input
                type="radio"
                name="theme"
                value={option}
                checked={preference === option}
                onChange={() => setPreference(option)}
              />
              <Icon size={15} /> {THEME_LABELS[option]}
            </label>
          );
        })}
      </div>
      <small>System follows your device setting. Saved in this browser only.</small>
    </fieldset>
  );
}
function Billing() {
  return (
    <>
      <Heading
        title="Billing"
        text="Your workspace and usage, with no surprises."
      />
      <section className="panel billing-panel">
        <div className="eyebrow">CURRENT WORKSPACE</div>
        <h2>Local development</h2>
        <p>
          This workspace runs on your own infrastructure. No payment processing
          or paid subscriptions are connected.
        </p>
        <div className="billing-feature">
          <Check size={17} /> Four built-in web data Actors
        </div>
        <div className="billing-feature">
          <Check size={17} /> Local datasets with JSON and CSV exports
        </div>
        <div className="billing-feature">
          <Check size={17} /> Saved tasks and schedules
        </div>
        <hr />
        <p className="muted">
          Hosting, network, and any future provider costs are managed
          separately. No credit card is required.
        </p>
        <Link className="btn" to="/insights">
          View workspace activity <ArrowRight size={15} />
        </Link>
      </section>
    </>
  );
}
function Information({ kind }: { kind: string }) {
  const proxy = kind === "proxy";
  return (
    <>
      <Heading
        title={proxy ? "Proxy" : "Messaging"}
        text={
          proxy
            ? "Manage network access for your workflows."
            : "Stay connected to your workflow activity."
        }
      />
      <section className="panel">
        <Empty
          icon={proxy ? Globe2 : MessageSquare}
          title={
            proxy ? "Direct connection is active" : "Your workflow, connected"
          }
          text={
            proxy
              ? "Actors currently use your server’s direct network connection. A managed proxy service is not configured."
              : "Integration preferences can be saved locally. Webhook delivery, email, and team messaging providers are not connected."
          }
          action={
            <Link className="btn" to="/integrations">
              Manage integrations <ArrowRight size={15} />
            </Link>
          }
        />
      </section>
      <Notice>
        {proxy
          ? "Private and local network targets are blocked by the collector. Proxy rotation and residential proxies are not included."
          : "Saved locally; webhook delivery is not connected. No outbound email or chat messages are sent in this release."}
      </Notice>
    </>
  );
}
function GettingStarted() {
  return (
    <>
      <Heading
        title="A good place to start"
        text="Your first useful dataset is just a few steps away."
      />
      <div className="getting-started">
        {[
          [
            "01",
            "Find your Actor",
            "Browse the Store and choose a tool for your goal. Page Text Harvester is a good first choice.",
            "Explore the Store",
            "/store",
            Store,
          ],
          [
            "02",
            "Give it a website",
            "Open the Actor, add a public website URL, and choose how many pages to collect.",
            "Try Page Text Harvester",
            "/actors/website-content",
            Globe2,
          ],
          [
            "03",
            "Make the data yours",
            "Watch your run finish, review the collected records, and export the results as JSON or CSV.",
            "View your runs",
            "/runs",
            Database,
          ],
        ].map(([n, title, text, label, path, Icon]: any) => (
          <div className="panel start-step" key={n}>
            <span className="step-number">{n}</span>
            <Icon size={27} />
            <h2>{title}</h2>
            <p>{text}</p>
            <Link className="text-button" to={path}>
              {label} <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>
      <section className="panel prose">
        <h2>Built for clear, traceable results</h2>
        <p>
          Collected records retain their source URL. A failed request stays
          visible as a failure. A provider template stays unavailable until its
          provider is connected.
        </p>
        <p>
          Use websites you have permission to collect. Access controls, rate
          limits, and website terms still apply.
        </p>
      </section>
    </>
  );
}
function Landing() {
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
          <ThemeToggle />
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
