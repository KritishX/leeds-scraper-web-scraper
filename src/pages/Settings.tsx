import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { Heading, Notice } from "../components/common";

export function SettingsPage({
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
          <p className="muted">
            Everything in this workspace stays on this machine in the server’s
            data directory. Anyone who can reach the local server can use it.
          </p>
        </section>
      </div>
    </>
  );
}
