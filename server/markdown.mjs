// HTML to Markdown for readable page capture. Output is capped, nesting depth
// is bounded, and only http(s), mailto and tel links are kept.
const MAX_DEPTH = 150;
const SKIP = new Set([
  "script",
  "style",
  "noscript",
  "iframe",
  "template",
  "svg",
  "canvas",
  "form",
  "button",
  "select",
  "input",
  "textarea",
  "nav",
  "footer",
  "aside",
  "head",
  "object",
  "embed",
]);
const BLOCK = new Set([
  "div",
  "section",
  "article",
  "main",
  "header",
  "figure",
  "figcaption",
  "details",
  "summary",
  "address",
  "dl",
  "dt",
  "dd",
  "body",
  "html",
]);

function absolute(
  href,
  base,
  schemes = ["http:", "https:", "mailto:", "tel:"],
) {
  try {
    const u = new URL(href, base);
    return schemes.includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
const inlineText = (s) => s.replace(/\s+/g, " ");
const cell = (s) => inlineText(s).trim().replaceAll("|", "\\|");
// Rows that belong to this table, not to tables nested in its cells.
export const ownRows = ($, table) =>
  $(table)
    .children("tr,thead,tbody,tfoot")
    .toArray()
    .flatMap((el) =>
      el.name === "tr" ? [el] : $(el).children("tr").toArray(),
    );

export function htmlToMarkdown($, root, baseUrl, maxLength = 200000) {
  let length = 0;
  // All emitted text is counted, so the cap bounds work as well as output.
  const counted = (text) => {
    const kept = text.slice(0, Math.max(0, maxLength - length));
    length += kept.length;
    return kept;
  };
  function children(node, ctx) {
    let out = "";
    for (const child of node.children || []) {
      if (length > maxLength) break;
      out += render(child, ctx);
    }
    return out;
  }
  function list(node, ctx, ordered) {
    let out = "\n",
      n = 1;
    for (const item of node.children || []) {
      if (item.type !== "tag" || item.name !== "li") continue;
      const indent = "  ".repeat(ctx.listDepth);
      const marker = ordered ? `${n++}.` : "-";
      const body = children(item, { ...ctx, listDepth: ctx.listDepth + 1 })
        .trim()
        .replace(/\n{2,}/g, "\n");
      out += `${indent}${marker} ${body}\n`;
    }
    return out + "\n";
  }
  function table(node, ctx) {
    const rows = ownRows($, node)
      .slice(0, 500)
      .map((tr) =>
        $(tr)
          .children("th,td")
          .toArray()
          .slice(0, 30)
          .map((c) => cell(children(c, { ...ctx, inTable: true }))),
      )
      .filter((r) => r.length);
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r) =>
      "| " +
      Array.from({ length: width }, (_, i) => r[i] ?? "").join(" | ") +
      " |";
    return (
      "\n\n" +
      [
        line(rows[0]),
        line(Array(width).fill("---")),
        ...rows.slice(1).map(line),
      ].join("\n") +
      "\n\n"
    );
  }
  function render(node, ctx) {
    if (length > maxLength) return "";
    if (node.type === "text")
      return counted(ctx.pre ? node.data : inlineText(node.data));
    if (node.type !== "tag" || SKIP.has(node.name)) return "";
    if (ctx.depth > MAX_DEPTH) return counted(inlineText($(node).text()));
    const next = { ...ctx, depth: ctx.depth + 1 };
    const name = node.name;
    if (/^h[1-6]$/.test(name))
      return `\n\n${"#".repeat(Number(name[1]))} ${children(node, next).trim()}\n\n`;
    switch (name) {
      case "p":
        return `\n\n${children(node, next).trim()}\n\n`;
      case "br":
        return ctx.inTable ? " " : "\\\n";
      case "hr":
        return "\n\n---\n\n";
      case "strong":
      case "b": {
        const t = children(node, next).trim();
        return t ? `**${t}**` : "";
      }
      case "em":
      case "i": {
        const t = children(node, next).trim();
        return t ? `*${t}*` : "";
      }
      case "code":
        return ctx.pre
          ? children(node, next)
          : "`" + counted($(node).text().trim()) + "`";
      case "pre":
        return (
          "\n\n```\n" +
          children(node, { ...next, pre: true }).replace(/\n+$/, "") +
          "\n```\n\n"
        );
      case "blockquote":
        return (
          "\n\n" +
          children(node, next)
            .trim()
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n") +
          "\n\n"
        );
      case "ul":
        return list(node, next, false);
      case "ol":
        return list(node, next, true);
      case "table":
        // A table inside a cell is flattened to its (counted) text.
        return ctx.inTable ? children(node, next) : table(node, next);
      case "a": {
        const text = children(node, next).trim();
        const href = absolute($(node).attr("href") || "", baseUrl);
        return href && text ? `[${text}](${href})` : text;
      }
      case "img": {
        const src = absolute($(node).attr("src") || "", baseUrl, [
          "http:",
          "https:",
        ]);
        return src ? `![${cell($(node).attr("alt") || "")}](${src})` : "";
      }
      default:
        return BLOCK.has(name)
          ? `\n${children(node, next)}\n`
          : children(node, next);
    }
  }
  const markdown = render(root, {
    depth: 0,
    listDepth: 0,
    pre: false,
    inTable: false,
  })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return markdown.length > maxLength ? markdown.slice(0, maxLength) : markdown;
}
