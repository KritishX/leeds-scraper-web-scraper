import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDownToLine, ChevronLeft, Database } from "lucide-react";
import { api } from "../api/client";
import type { Run } from "../api/client";
import { Heading, Notice, Empty, Loading } from "../components/common";

export function RunDetail() {
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
      {!run && !error && <Loading text="Loading run…" />}
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

export function DataOutput({ run }: { run: Run }) {
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
  const keys = Array.from(new Set(records.flatMap((r) => Object.keys(r))));
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
