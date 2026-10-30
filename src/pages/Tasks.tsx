import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Play, Plus, X } from "lucide-react";
import { isRunnable, useCatalog, api } from "../api/client";
import { Heading, Notice, Empty, Loading } from "../components/common";
import { toInput, useInputValues, InputFields } from "../components/inputs";

export function Tasks() {
  const { actors } = useCatalog();
  const [items, setItems] = useState<any[]>();
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
              <select
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
              >
                {(actors ?? []).filter(isRunnable).map((a) => (
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
            : !error && (
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
              )}
      </section>
    </>
  );
}
