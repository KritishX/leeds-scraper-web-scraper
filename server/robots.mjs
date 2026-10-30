// robots.txt parsing per RFC 9309: the most specific matching group applies,
// the longest matching rule wins, and Allow wins a tie.
export const ROBOTS_AGENT = "leedsharvester";

// Wildcard matching without regular expressions, so hostile patterns cannot
// trigger backtracking: each literal segment is located in order with indexOf.
export function robotsPatternMatches(pattern, path) {
  const anchored = pattern.endsWith("$");
  const parts = (anchored ? pattern.slice(0, -1) : pattern).split("*");
  if (!path.startsWith(parts[0])) return false;
  if (parts.length === 1) return anchored ? path === parts[0] : true;
  let position = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1 && anchored)
      return path.length - part.length >= position && path.endsWith(part);
    const found = path.indexOf(part, position);
    if (found < 0) return false;
    position = found + part.length;
  }
  return true;
}

export function parseRobots(text, agent = ROBOTS_AGENT) {
  const groups = [],
    sitemaps = [];
  let current = null,
    collectingAgents = false;
  for (const raw of String(text).split(/\r?\n/).slice(0, 10000)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!collectingAgents) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      collectingAgents = true;
      continue;
    }
    collectingAgents = false;
    if (field === "sitemap") {
      if (value && value.length <= 2048 && sitemaps.length < 50)
        sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if ((field === "allow" || field === "disallow") && value.length <= 500) {
      // An empty Disallow allows everything and adds no rule.
      if (value)
        current.rules.push({ allow: field === "allow", pattern: value });
    } else if (field === "crawl-delay" && current.crawlDelay === null) {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0)
        current.crawlDelay = seconds;
    }
  }
  const specific = groups.filter((g) =>
    g.agents.some((a) => a === agent.toLowerCase()),
  );
  const chosen = specific.length
    ? specific
    : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const crawlDelay =
    chosen.find((g) => g.crawlDelay !== null)?.crawlDelay ?? null;
  return {
    crawlDelay,
    sitemaps,
    allows(path) {
      let best = null;
      for (const rule of rules) {
        if (!robotsPatternMatches(rule.pattern, path)) continue;
        if (
          !best ||
          rule.pattern.length > best.pattern.length ||
          (rule.pattern.length === best.pattern.length && rule.allow)
        )
          best = rule;
      }
      return !best || best.allow;
    },
  };
}
