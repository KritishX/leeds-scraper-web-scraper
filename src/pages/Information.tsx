import { Link } from "react-router-dom";
import { ArrowRight, Globe2, MessageSquare } from "lucide-react";
import { Heading, Notice, Empty } from "../components/common";

export function Information({ kind }: { kind: string }) {
  const proxy = kind === "proxy";
  return (
    <>
      <Heading
        title={proxy ? "Proxy" : "Messaging"}
        text={
          proxy
            ? "Manage network access for your workflows."
            : "Stay connected to your workflow activity."
        }
      />
      <section className="panel">
        <Empty
          icon={proxy ? Globe2 : MessageSquare}
          title={
            proxy ? "Direct connection is active" : "Your workflow, connected"
          }
          text={
            proxy
              ? "Actors currently use your server’s direct network connection. A managed proxy service is not configured."
              : "Integration preferences can be saved locally. Webhook delivery, email, and team messaging providers are not connected."
          }
          action={
            <Link className="btn" to="/integrations">
              Manage integrations <ArrowRight size={15} />
            </Link>
          }
        />
      </section>
      <Notice>
        {proxy
          ? "Private and local network targets are blocked by the collector. Proxy rotation and residential proxies are not included."
          : "Saved locally; webhook delivery is not connected. No outbound email or chat messages are sent in this release."}
      </Notice>
    </>
  );
}
