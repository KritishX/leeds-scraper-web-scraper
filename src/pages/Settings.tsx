import { ThemeRadios } from "../theme";
import type { Workspace } from "../api/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Heading, Notice, usePageTitle } from "../components/common";

export function SettingsPage({
  workspace,
  setWorkspace,
}: {
  workspace: Workspace | null;
  setWorkspace: (workspace: Workspace) => void;
}) {
  usePageTitle("Settings");
  const [name, setName] = useState(workspace?.name || "");
  const [retainDays, setRetainDays] = useState("");
  const [maxStorageMB, setMaxStorageMB] = useState("1024");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setRetainDays(workspace.retainDays ? String(workspace.retainDays) : "");
    setMaxStorageMB(String(workspace.maxStorageMB ?? 1024));
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
                  body: JSON.stringify({
                    name,
                    retainDays: retainDays ? Number(retainDays) : null,
                    maxStorageMB: Number(maxStorageMB),
                  }),
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
            <label>
              Keep finished runs for (days)
              <input
                type="number"
                min={1}
                max={3650}
                placeholder="No age limit"
                value={retainDays}
                onChange={(e) => setRetainDays(e.target.value)}
              />
              <small>
                Older finished runs are deleted after the next run ends. Leave
                empty to keep them (the newest 200 runs are always the limit).
              </small>
            </label>
            <label>
              Maximum database size (MB)
              <input
                type="number"
                required
                min={1}
                max={1048576}
                value={maxStorageMB}
                onChange={(e) => setMaxStorageMB(e.target.value)}
              />
              <small>
                When the stored data grows past this, the oldest finished runs
                are deleted. Running and queued runs are never deleted.
              </small>
            </label>
            <button className="btn primary">Save changes</button>
          </form>
          <hr />
          <h2>Appearance</h2>
          <ThemeRadios />
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
