import React, { useEffect, useState } from "react";
import { Link, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Code2,
  FileText,
  Play,
  Search,
  ShieldCheck,
  X,
  Braces,
} from "lucide-react";
import { parseActorInput } from "../../actor-input";
import {
  isRunnable,
  actorStatusLabel,
  useCatalog,
  api,
} from "../../api/client";
import {
  usePageTitle,
  ActorIcon,
  Notice,
  Empty,
} from "../../components/common";
import {
  initialValues,
  toInput,
  toValues,
  useInputValues,
  InputFields,
} from "../../components/inputs";
import { Runs } from "../Runs";
import { Tabs, tabPanel } from "../../components/Tabs";
import { ActorReadme } from "./ActorReadme";
import { ActorOutput } from "./ActorOutput";
import { ActorApi } from "./ActorApi";

export function ActorPage() {
  const { id } = useParams();
  const { actors, error: catalogError } = useCatalog();
  const actor = actors?.find((a) => a.id === id);
  usePageTitle(actor?.name ?? "Actor");
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
  const requestedTab =
    new URLSearchParams(location.search).get("tab")?.toLowerCase() ??
    location.hash.slice(1).toLowerCase();
  const tab =
    tabs.find((item) => item.toLowerCase() === requestedTab) ?? "Input";
  const selectTab = (next: string) => {
    const query = new URLSearchParams(location.search);
    query.set("tab", next.toLowerCase());
    navigate(
      { pathname: location.pathname, search: query.toString(), hash: "" },
      { replace: true },
    );
  };
  useEffect(() => {
    setMode("Form");
    setJson("");
    setError("");
    setShowTask(false);
    setTaskName("");
  }, [id]);
  function currentInput() {
    if (!actor) return {};
    if (mode === "Form") return toInput(actor.fields, values);
    return parseActorInput(json, actor.fields);
  }
  function changeMode(next: string) {
    if (!actor || next === mode) return;
    try {
      if (next === "JSON")
        setJson(JSON.stringify(toInput(actor.fields, values), null, 2));
      else {
        setValues(toValues(actor.fields, parseActorInput(json, actor.fields)));
      }
      setError("");
      setMode(next);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function start() {
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      const input = currentInput();
      const d = await api("/runs", {
        method: "POST",
        body: JSON.stringify({ actorId: id, input }),
      });
      navigate("/runs/" + (d.run?.id || d.id));
    } catch (e: any) {
      setError(e.message);
      selectTab("Input");
    } finally {
      setBusy(false);
    }
  }
  async function saveTask(event: React.FormEvent) {
    event.preventDefault();
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      await api("/tasks", {
        method: "POST",
        body: JSON.stringify({
          name: taskName,
          actorId: id,
          input: currentInput(),
        }),
      });
      navigate("/tasks");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    if (!actor) return;
    const defaults = initialValues(actor.fields);
    setValues(defaults);
    setJson(JSON.stringify(toInput(actor.fields, defaults), null, 2));
    setError("");
  }
  if (catalogError)
    return (
      <Notice error>The catalog could not be loaded: {catalogError}</Notice>
    );
  if (!actors)
    return <Empty title="Loading Actor" text="Fetching Actor details…" />;
  if (!actor)
    return (
      <Empty
        icon={Search}
        title="Actor not found"
        text="This Actor is not in the catalog."
        action={
          <Link className="btn primary" to="/store">
            Back to Store
          </Link>
        }
      />
    );
  const runOptions = actor.fields.filter(
    (field) => field.type === "number" || field.type === "boolean",
  );
  const inputFields = actor.fields.filter(
    (field) => !runOptions.includes(field),
  );
  const inputExample =
    mode === "JSON"
      ? json
      : JSON.stringify(toInput(actor.fields, values), null, 2);
  let apiInput: Record<string, any> | undefined;
  let apiInputError = "";
  try {
    apiInput = currentInput();
  } catch (e: any) {
    apiInputError = e.message;
  }
  const apiExample = apiInput
    ? [
        `curl -X POST '${window.location.origin}/api/runs'`,
        "  -H 'Content-Type: application/json'",
        `  -H 'Origin: ${window.location.origin}'`,
        `  --data '${JSON.stringify({ actorId: actor.id, input: apiInput }, null, 2).replace(/'/g, "'\\''")}'`,
      ].join(" \\\n")
    : "";
  return (
    <div className="actor-workspace">
      <Link className="back-link" to="/store">
        <ChevronLeft size={15} /> Back to Store
      </Link>
      <div className="actor-detail-heading">
        <ActorIcon actor={actor} />
        <div className="actor-identity">
          <span className="actor-category">{actor.category}</span>
          <h1>{actor.name}</h1>
          <span className="actor-slug">{actor.slug}</span>
        </div>
        <span
          className={"status-pill " + (actor.status === "ready" ? "ready" : "")}
        >
          {actorStatusLabel(actor)}
        </span>
      </div>
      <p className="detail-description">{actor.description}</p>
      <div className="actor-toolbar">
        <div className="actor-actions">
          <button
            className="btn primary"
            disabled={busy || !isRunnable(actor)}
            onClick={start}
          >
            <Play size={15} />
            {busy ? "Working…" : "Start"}
          </button>
          <button
            className="btn"
            disabled={busy || !isRunnable(actor)}
            onClick={() => {
              selectTab("Input");
              setShowTask(!showTask);
            }}
          >
            <FileText size={15} /> Save as task
          </button>
          <button className="btn" onClick={() => selectTab("API")}>
            <Code2 size={15} /> API
          </button>
        </div>
        <span className="local-execution">
          <ShieldCheck size={14} /> Local execution
        </span>
      </div>
      <Tabs
        id="actor"
        label="Actor sections"
        tabs={tabs}
        selected={tab}
        onSelect={selectTab}
        className="tabs actor-tabs"
      />
      {error && (
        <div role="alert">
          <Notice error>{error}</Notice>
        </div>
      )}
      {actor.notice && <Notice>{actor.notice}</Notice>}
      <div {...tabPanel("actor", tab)}>
        {tab === "Input" ? (
          <div className="two-column actor-input-layout">
            <div>
              {showTask && (
                <form className="panel actor-task-form" onSubmit={saveTask}>
                  <div className="panel-header">
                    <h2>Save this input as a task</h2>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Close save task"
                      onClick={() => setShowTask(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <label>
                    Task name
                    <input
                      required
                      maxLength={120}
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      placeholder={actor.name}
                    />
                  </label>
                  <button className="btn primary" disabled={busy}>
                    Save task
                  </button>
                </form>
              )}
              <section className="panel actor-input-panel">
                <div className="panel-header">
                  <div>
                    <h2>Input</h2>
                    <p>Configure what this Actor collects.</p>
                  </div>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Input editor"
                  >
                    {["Form", "JSON"].map((item) => (
                      <button
                        key={item}
                        aria-pressed={mode === item}
                        className={mode === item ? "active" : ""}
                        onClick={() => changeMode(item)}
                      >
                        {item === "JSON" && <Braces size={13} />}
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === "JSON" ? (
                  <label>
                    Input JSON
                    <textarea
                      className="mono json-input"
                      rows={18}
                      value={json}
                      spellCheck={false}
                      onChange={(e) => {
                        setJson(e.target.value);
                        setError("");
                      }}
                    />
                    <small>
                      Use the field names and types in the README. Input is
                      validated before a run or task is created.
                    </small>
                  </label>
                ) : (
                  <>
                    <InputFields
                      fields={inputFields}
                      values={values}
                      onChange={setValues}
                      urlLists
                    />
                    {runOptions.length > 0 && (
                      <div className="run-options">
                        <h3>Run options</h3>
                        <p>Collection limits and request behavior.</p>
                        <InputFields
                          fields={runOptions}
                          values={values}
                          onChange={setValues}
                        />
                      </div>
                    )}
                  </>
                )}
                <div className="form-footer">
                  <button className="text-button" onClick={reset}>
                    Reset to defaults
                  </button>
                  <button
                    className="btn primary"
                    disabled={busy || !isRunnable(actor)}
                    onClick={start}
                  >
                    <Play size={15} />
                    {busy ? "Working…" : "Start run"}
                  </button>
                </div>
              </section>
            </div>
            <aside className="panel info-panel actor-guide">
              <span className="guide-eyebrow">
                <BookOpen size={15} /> BEFORE YOU START
              </span>
              <h3>{actor.name}</h3>
              <p>{actor.documentation?.overview ?? actor.description}</p>
              <ol>
                <li>Enter your targets and configure the input.</li>
                <li>Set collection limits, then start your run.</li>
                <li>Review the run output and export JSON, JSONL or CSV.</li>
              </ol>
              <hr />
              <h4>Collection boundaries</h4>
              <p>
                Use public data you are authorized to collect. Target access
                rules and availability can limit results.
              </p>
              <button
                className="text-button"
                onClick={() => selectTab("README")}
              >
                Read the documentation <ArrowRight size={14} />
              </button>
            </aside>
          </div>
        ) : tab === "README" ? (
          <ActorReadme actor={actor} selectTab={selectTab} />
        ) : tab === "Output" ? (
          <ActorOutput actor={actor} selectTab={selectTab} />
        ) : tab === "Runs" ? (
          <Runs actorId={id} />
        ) : (
          <ActorApi
            apiExample={apiExample}
            apiInputError={apiInputError}
            inputExample={inputExample}
          />
        )}
      </div>
    </div>
  );
}
