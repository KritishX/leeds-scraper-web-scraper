import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, Database } from "lucide-react";
import { api } from "../api/client";
import type { Run } from "../api/client";
import {
  Heading,
  Notice,
  Empty,
  Loading,
  usePageTitle,
} from "../components/common";

export function Storage() {
  usePageTitle("Storage");
  const [runs, setRuns] = useState<Run[]>();
  const [database, setDatabase] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    api("/storage")
      .then((d) => {
        setRuns(d.datasets);
        setDatabase(d.database);
      })
      .catch((e) => setError(e.message));
  }, []);
  const mb = (bytes: number) =>
    bytes < 1024 * 1024
      ? `${Math.ceil(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <>
      <Heading
        title="Storage"
        text="Your datasets, with their source and run history preserved."
      />
      {error && <Notice error>{error}</Notice>}
      {database && (
        <Notice>
          Database: {mb(database.usedBytes)} in use of{" "}
          {database.maxStorageMB.toLocaleString()} MB allowed (file{" "}
          {mb(database.fileBytes)}).{" "}
          {database.retainDays
            ? `Finished runs are kept for ${database.retainDays} days.`
            : "Finished runs have no age limit."}{" "}
          <Link to="/settings">Change retention</Link>
        </Notice>
      )}
      <section className="panel">
        <div className="panel-header">
          <h2>Datasets</h2>
          {runs && <span className="muted">{runs.length} run datasets</span>}
        </div>
        {!runs
          ? !error && <Loading text="Loading datasets…" />
          : runs.length
            ? runs.map((r) => (
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
            : !error && (
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
