import { Link } from "react-router-dom";
import { ArrowRight, Database, Globe2, Store } from "lucide-react";
import { Heading } from "../components/common";

export function GettingStarted() {
  return (
    <>
      <Heading
        title="A good place to start"
        text="Your first useful dataset is just a few steps away."
      />
      <div className="getting-started">
        {[
          [
            "01",
            "Find your Actor",
            "Browse the Store and choose a tool for your goal. Page Text Harvester is a good first choice.",
            "Explore the Store",
            "/store",
            Store,
          ],
          [
            "02",
            "Give it a website",
            "Open the Actor, add a public website URL, and choose how many pages to collect.",
            "Try Page Text Harvester",
            "/actors/website-content",
            Globe2,
          ],
          [
            "03",
            "Make the data yours",
            "Watch your run finish, review the collected records, and export the results as JSON or CSV.",
            "View your runs",
            "/runs",
            Database,
          ],
        ].map(([n, title, text, label, path, Icon]: any) => (
          <div className="panel start-step" key={n}>
            <span className="step-number">{n}</span>
            <Icon size={27} />
            <h2>{title}</h2>
            <p>{text}</p>
            <Link className="text-button" to={path}>
              {label} <ArrowRight size={16} />
            </Link>
          </div>
        ))}
      </div>
      <section className="panel prose">
        <h2>Built for clear, traceable results</h2>
        <p>
          Collected records retain their source URL. A failed request stays
          visible as a failure. A provider template stays unavailable until its
          provider is connected.
        </p>
        <p>
          Use websites you have permission to collect. Access controls, rate
          limits, and website terms still apply.
        </p>
      </section>
    </>
  );
}
