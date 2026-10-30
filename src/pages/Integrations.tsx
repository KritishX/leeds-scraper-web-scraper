import { useEffect, useState } from "react";
import { Plus, Workflow, X } from "lucide-react";
import { api } from "../api/client";
import { Heading, Notice, Empty, Loading } from "../components/common";

export function Integrations() {
  const [items, setItems] = useState<any[]>();
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
        {!items
          ? !error && <Loading text="Loading integrations…" />
          : items.length
            ? items.map((i) => (
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
                        await api("/integrations/" + i.id, {
                          method: "DELETE",
                        });
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
