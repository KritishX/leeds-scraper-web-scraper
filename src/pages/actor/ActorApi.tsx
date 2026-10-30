import { Notice } from "../../components/common";

export function ActorApi({
  apiExample,
  apiInputError,
  inputExample,
}: {
  apiExample: string;
  apiInputError: string;
  inputExample: string;
}) {
  return (
    <section className="panel prose actor-api">
      <h2>Run this Actor through the API</h2>
      <p>
        This request uses your current input. Fill required targets in the Input
        tab before sending it. Your local server must be running.
      </p>
      <div className="api-endpoint">
        <span>POST</span>
        <code>/api/runs</code>
      </div>
      <h3>cURL</h3>
      {apiInputError ? (
        <Notice error>
          {apiInputError} Correct the input in the JSON editor to generate a
          request.
        </Notice>
      ) : (
        <pre>{apiExample}</pre>
      )}
      <h3>Input object</h3>
      <pre>{inputExample}</pre>
      <p>
        The response includes the run ID. Open <code>GET /api/runs/:id</code> to
        retrieve its status and records.
      </p>
    </section>
  );
}
