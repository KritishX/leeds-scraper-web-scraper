import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Pencil, Play, Plus, X } from "lucide-react";
import { isRunnable, useCatalog, api } from "../api/client";
import { useConfirm } from "../components/confirm";
import {
  Heading,
  Notice,
  Empty,
  Loading,
  usePageTitle,
} from "../components/common";
import {
  toInput,
  toValues,
  useInputValues,
  InputFields,
} from "../components/inputs";
import type { Actor } from "../api/client";

export function Tasks() {
  usePageTitle("Tasks");
  const { actors } = useCatalog();
  const [items, setItems] = useState<any[]>();
  const [dialog, confirm] = useConfirm();
  const [error, setError] = useState("");
  // null: no form; {}: create; { task }: edit that task.
  const [form, setForm] = useState<{ task?: any } | null>(null);
  const nav = useNavigate();
  const load = () =>
    api("/tasks")
      .then((d) => setItems(d.tasks))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
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
      {dialog}
      <Heading
        title="Tasks"
        text="Save Actor inputs once. Run them whenever you need."
        action={
          <button className="btn primary" onClick={() => setForm({})}>
            <Plus size={16} /> Create task
          </button>
        }
      />
      {error && <Notice error>{error}</Notice>}
      {form && actors && (
        <TaskForm
          key={form.task?.id ?? "new"}
          actors={actors}
          task={form.task}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            load();
          }}
        />
      )}
      <section className="panel">
        {!items
          ? !error && <Loading text="Loading tasks…" />
          : items.length
            ? items.map((t) => (
                <div className="list-row" key={t.id}>
                  <FileText size={20} />
                  <div>
                    <strong>{t.name}</strong>
                    <small>
                      {actors?.find((a) => a.id === t.actorId)?.name ??
                        t.actorId}
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
                    aria-label={`Edit task ${t.name}`}
                    onClick={() => setForm({ task: t })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Delete task"
                    onClick={async () => {
                      if (
                        !(await confirm(
                          `Delete the task “${t.name}”?`,
                          "Schedules that run this task are deleted with it. This cannot be undone.",
                          "Delete task",
                        ))
                      )
                        return;
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
            : !error && (
                <Empty
                  icon={FileText}
                  title="Keep your favorite workflows close"
                  text="Create a task to save an Actor and its input for next time."
                  action={
                    <button className="btn" onClick={() => setForm({})}>
                      <Plus size={15} /> Create your first task
                    </button>
                  }
                />
              )}
      </section>
    </>
  );
}

// Creates a task, or edits one: its name and input change, its Actor does not.
function TaskForm({
  actors,
  task,
  onClose,
  onSaved,
}: {
  actors: Actor[];
  task?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(task?.name ?? "");
  const [actorId, setActorId] = useState(task?.actorId ?? "website-content");
  const [error, setError] = useState("");
  const actor = actors.find((a) => a.id === actorId);
  const [values, setValues] = useInputValues(actor?.fields);
  // Runs after useInputValues has applied the defaults.
  useEffect(() => {
    if (task && actor) setValues(toValues(actor.fields, task.input ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per task
  }, [task]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const input = actor ? toInput(actor.fields, values) : {};
    try {
      await api(task ? "/tasks/" + task.id : "/tasks", {
        method: task ? "PATCH" : "POST",
        body: JSON.stringify(task ? { name, input } : { name, actorId, input }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <section className="panel">
      <form onSubmit={save}>
        <div className="panel-header">
          <h2>{task ? `Edit “${task.name}”` : "Create a task"}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close form"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        {error && <Notice error>{error}</Notice>}
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
          <select
            value={actorId}
            disabled={Boolean(task)}
            onChange={(e) => setActorId(e.target.value)}
          >
            {actors
              .filter((a) => isRunnable(a) || a.id === actorId)
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
        <button className="btn primary">
          {task ? "Save changes" : "Save task"}
        </button>
      </form>
    </section>
  );
}
