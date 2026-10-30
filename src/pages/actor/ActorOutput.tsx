import { ArrowRight } from "lucide-react";
import type { Actor } from "../../api/client";

export function ActorOutput({
  actor,
  selectTab,
}: {
  actor: Actor;
  selectTab: (tab: string) => void;
}) {
  const output = actor.documentation?.output ?? [];
  return (
    <section className="panel prose">
      <h2>Output schema</h2>
      <p>
        {actor.name} returns the following record fields. Optional values can be
        empty when the source does not provide them. These are field
        definitions; collected records appear in Runs.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {output.map((field) => (
              <tr key={field.name}>
                <td>
                  <code>{field.name}</code>
                </td>
                <td>{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn" onClick={() => selectTab("Runs")}>
        View runs <ArrowRight size={14} />
      </button>
    </section>
  );
}
