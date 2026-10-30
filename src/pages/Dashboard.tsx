import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  Database,
  FileText,
  Play,
  Plus,
} from "lucide-react";
import { api } from "../api/client";
import { Heading, Notice, Empty, RunTable } from "../components/common";

export function Dashboard({ insights = false }: { insights?: boolean }) {
  const [data, setData] = useState<any>();
  const [error, setError] = useState("");
  useEffect(() => {
    api("/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Heading
        title={insights ? "Insights" : "Welcome to your workspace"}
        text={
          insights
            ? "A clear view of your collection activity."
            : "Make your next move with better web data."
        }
        action={
          <Link className="btn primary" to="/store">
            <Plus size={16} /> Start a new run
          </Link>
        }
      />
      {error && <Notice error>{error}</Notice>}
      <div className="stats-grid">
        {[
          ["Total runs", data?.stats?.totalRuns ?? 0, Play],
          ["Successful runs", data?.stats?.succeededRuns ?? 0, Check],
          ["Records collected", data?.stats?.totalResults ?? 0, Database],
          ["Saved tasks", data?.stats?.tasks ?? 0, FileText],
        ].map(([label, value, Icon]: any) => (
          <div className="stat panel" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>Your local workspace</small>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Recent runs</h2>
          <Link className="text-button" to="/runs">
            View all <ArrowRight size={15} />
          </Link>
        </div>
        {data?.recentRuns?.length ? (
          <RunTable runs={data.recentRuns} />
        ) : (
          <Empty
            icon={Play}
            title="Your first dataset is one run away"
            text="Choose an Actor from the Store and give it a website URL. Your results will appear here."
            action={
              <Link className="btn" to="/store">
                Explore the Store <ArrowRight size={15} />
              </Link>
            }
          />
        )}
      </section>
      <div className="quick-grid">
        <Link to="/tasks" className="panel">
          <FileText size={23} />
          <h3>Save your workflow</h3>
          <p>Keep your Actor input as a reusable task.</p>
          <span>
            Manage tasks <ArrowRight size={14} />
          </span>
        </Link>
        <Link to="/storage" className="panel">
          <Database size={23} />
          <h3>Your data, organized</h3>
          <p>Browse run datasets and export your results.</p>
          <span>
            Open storage <ArrowRight size={14} />
          </span>
        </Link>
        <Link to="/getting-started" className="panel">
          <BookOpen size={23} />
          <h3>A little guidance</h3>
          <p>Go from your first URL to your first dataset.</p>
          <span>
            Read the quick start <ArrowRight size={14} />
          </span>
        </Link>
      </div>
    </>
  );
}
