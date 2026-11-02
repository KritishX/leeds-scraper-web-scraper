import { Link } from "react-router-dom";
import { Code2 } from "lucide-react";
import type { Actor } from "../../api/client";

export function ActorReadme({
  actor,
  selectTab,
}: {
  actor: Actor;
  selectTab: (tab: string) => void;
}) {
  return (
    <div className="actor-doc-layout">
      <article className="panel prose actor-readme">
        <span className="guide-eyebrow">ACTOR DOCUMENTATION</span>
        <h2 id="overview">{actor.name}</h2>
        <p>{actor.documentation?.overview ?? actor.description}</p>
        <h3 id="quick-start">Quick start</h3>
        <ol>
          <li>Open Input and enter the required fields.</li>
          <li>Review the run options and select Start.</li>
          <li>
            Open the completed run to inspect and export the collected records.
          </li>
        </ol>
        <h3 id="parameters">Input parameters</h3>
        <div className="parameter-list">
          {actor.fields.map((field) => (
            <section key={field.name}>
              <div>
                <code>{field.name}</code>
                <span className="parameter-type">
                  {field.type}
                  {field.required ? " · required" : " · optional"}
                </span>
              </div>
              <h4>{field.label}</h4>
              <p>
                {field.help ??
                  field.placeholder ??
                  `Configure ${field.label.toLowerCase()}.`}
              </p>
              {field.options && (
                <p>
                  Options:{" "}
                  {field.options.map((option) => option.value).join(", ")}
                </p>
              )}
              {field.min !== undefined && (
                <small>
                  Range: {field.min}–{field.max}
                </small>
              )}
              {field.default !== undefined && (
                <small>Default: {String(field.default)}</small>
              )}
            </section>
          ))}
        </div>
        <h3 id="output-guide">Output</h3>
        <p>
          Records are available from each run as JSON, JSONL or CSV. See the
          Output tab for this Actor’s fields.
        </p>
        <h3 id="limitations">Limitations & responsible use</h3>
        <ul>
          {(
            actor.documentation?.limitations ?? [
              "Results depend on the target’s public data and availability.",
            ]
          ).map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
        <p>
          Only public resources are supported. Private network targets are
          blocked; website access rules and request limits apply.
        </p>
        <h3 id="api-guide">API access</h3>
        <p>
          Start this Actor with <code>POST /api/runs</code>, using its ID and
          input object. The API tab builds a request from your current input.
        </p>
        <button className="btn" onClick={() => selectTab("API")}>
          <Code2 size={14} /> Open API example
        </button>
      </article>
      <aside className="panel actor-toc">
        <h3>On this page</h3>
        {[
          ["overview", "Overview"],
          ["quick-start", "Quick start"],
          ["parameters", "Input parameters"],
          ["output-guide", "Output"],
          ["limitations", "Limitations"],
          ["api-guide", "API access"],
        ].map(([anchor, label]) => (
          <Link
            key={anchor}
            to={`?tab=readme#${anchor}`}
            onClick={() =>
              document
                .getElementById(anchor)
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            {label}
          </Link>
        ))}
      </aside>
    </div>
  );
}
