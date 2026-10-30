import { useEffect, useState } from "react";

export type Actor = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  color?: string;
  status: string;
  mode?: string;
  notice?: string | null;
  fields: Field[];
  documentation?: {
    overview: string;
    output: { name: string; description: string }[];
    limitations: string[];
  };
};

export const isRunnable = (actor: Actor) =>
  ["ready", "access-limited"].includes(actor.status);

export const actorStatusLabel = (actor: Actor) =>
  actor.status === "access-limited"
    ? "Public access limited"
    : actor.status === "ready"
      ? "Ready to run"
      : "Provider required";

// Input fields are declared by the server catalog; forms render from them.
export type Field = {
  name: string;
  type: "urls" | "number" | "boolean" | "select" | "text" | "textarea";
  label: string;
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  maxLength?: number;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
};

export type Run = {
  id: string;
  actorId: string;
  status: string;
  createdAt: string;
  finishedAt?: string;
  resultCount: number;
  results: Record<string, unknown>[];
  error?: string;
  input?: any;
  [key: string]: any;
};

// The server catalog owns Actor identity and status; screens share one request.
let catalogRequest: Promise<Actor[]> | null = null;

export function useCatalog() {
  const [actors, setActors] = useState<Actor[]>();
  const [error, setError] = useState("");
  useEffect(() => {
    catalogRequest ??= api("/catalog")
      .then((d) => d.actors as Actor[])
      .catch((e) => {
        catalogRequest = null;
        throw e;
      });
    catalogRequest.then(setActors).catch((e) => setError(e.message));
  }, []);
  return { actors, error };
}

export async function api(path: string, options: RequestInit = {}) {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (r.status === 204) return null;
  let data;
  try {
    data = await r.json();
  } catch {
    throw new Error("The server is unavailable. Please try again.");
  }
  if (!r.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : data.error?.message || data.message || "Request failed",
    );
  return data;
}
