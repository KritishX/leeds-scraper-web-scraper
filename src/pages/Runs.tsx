import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Play, Plus } from "lucide-react";
import { api } from "../api/client";
import type { Run } from "../api/client";
import {
  Heading,
  Notice,
  Empty,
  Loading,
  RunTable,
} from "../components/common";

export function Runs({ actorId }: { actorId?: string }) {
  const [runs, setRuns] = useState<Run[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    // A background tab does not poll; it refreshes once when shown again.
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      api("/runs")
        .then((d) => {
          if (!active) return;
          setRuns(d.runs);
          setError("");
        })
        .catch((e) => active && setError(e.message));
    };
    refresh();
    const t = setInterval(refresh, 4000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const shown = actorId ? runs?.filter((r) => r.actorId === actorId) : runs;
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
        {!shown ? (
          !error && <Loading text="Loading runs…" />
        ) : shown.length ? (
          <RunTable runs={shown} />
        ) : (
          !error && (
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
          )
        )}
      </section>
    </>
  );
}
