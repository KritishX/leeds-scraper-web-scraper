import { useEffect, useState } from "react";
import { CalendarDays, Plus, X } from "lucide-react";
import { api } from "../api/client";
import { useConfirm } from "../components/confirm";
import {
  Heading,
  Notice,
  Empty,
  Loading,
  usePageTitle,
} from "../components/common";

export function Schedules() {
  usePageTitle("Schedules");
  const [items, setItems] = useState<any[]>();
  const [dialog, confirm] = useConfirm();
  const [tasks, setTasks] = useState<any[]>();
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
      .catch((e) => setError("Saved tasks could not be loaded: " + e.message));
  }, []);
  return (
    <>
      {dialog}
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
              {tasks?.map((t) => (
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
          {tasks?.length === 0 && (
            <Notice>Create a saved task first from the Tasks page.</Notice>
          )}
          <button disabled={!tasks?.length} className="btn primary">
            Save schedule
          </button>
        </form>
      )}
      <section className="panel">
        {!items
          ? !error && <Loading text="Loading schedules…" />
          : items.length
            ? items.map((s) => (
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
                      if (
                        !(await confirm(
                          `Delete the schedule “${s.name}”?`,
                          "Its saved task is kept. This cannot be undone.",
                          "Delete schedule",
                        ))
                      )
                        return;
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
            : !error && (
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
