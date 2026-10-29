// Hostnames the app answers to. The server and the Vite dev server share this
// list, so the Host allowlist (DNS-rebinding protection) and the Origin
// allowlist (CSRF protection) always agree.
//
// `*.localhost` names resolve to this machine in browsers with no setup.
// LEEDS_HOSTS adds more names (comma-separated) that you point at 127.0.0.1
// yourself, for example in /etc/hosts.
export const DEFAULT_HOSTS = [
  "localhost",
  "127.0.0.1",
  "leedsharvester.localhost",
];
export const APP_PORTS = [4180, 4181];
const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function appHostnames(env = process.env) {
  const extra = (env.LEEDS_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const host of extra)
    if (!HOSTNAME.test(host))
      throw new Error(`LEEDS_HOSTS contains an invalid hostname: ${host}`);
  return [...new Set([...DEFAULT_HOSTS, ...extra])];
}
export const originsFor = (hosts, ports = APP_PORTS) =>
  hosts.flatMap((h) => ports.map((p) => `http://${h}:${p}`));
