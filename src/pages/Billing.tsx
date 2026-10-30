import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { Heading } from "../components/common";

export function Billing() {
  return (
    <>
      <Heading
        title="Billing"
        text="Your workspace and usage, with no surprises."
      />
      <section className="panel billing-panel">
        <div className="eyebrow">CURRENT WORKSPACE</div>
        <h2>Local development</h2>
        <p>
          This workspace runs on your own infrastructure. No payment processing
          or paid subscriptions are connected.
        </p>
        <div className="billing-feature">
          <Check size={17} /> Four built-in web data Actors
        </div>
        <div className="billing-feature">
          <Check size={17} /> Local datasets with JSON and CSV exports
        </div>
        <div className="billing-feature">
          <Check size={17} /> Saved tasks and schedules
        </div>
        <hr />
        <p className="muted">
          Hosting, network, and any future provider costs are managed
          separately. No credit card is required.
        </p>
        <Link className="btn" to="/insights">
          View workspace activity <ArrowRight size={15} />
        </Link>
      </section>
    </>
  );
}
