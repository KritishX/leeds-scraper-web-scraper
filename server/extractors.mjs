import * as cheerio from "cheerio";
import { htmlToMarkdown, ownRows } from "./markdown.mjs";

// Bounded quantifiers keep matching linear; an unbounded `+@` scan is quadratic
// on long runs of address characters.
const EMAIL =
  /[A-Z0-9._%+-]{1,64}@[A-Z0-9-]{1,63}(?:\.[A-Z0-9-]{1,63}){0,8}\.[A-Z]{2,24}/gi;
const EMAIL_ONLY = new RegExp(`^${EMAIL.source}$`, "i");
// Malformed percent-encoding in a mailto link yields nothing rather than throwing.
const decoded = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
};
// Every extracted string is capped so stored results stay proportional to the page.
export const clip = (value, max = 2048) =>
  typeof value === "string" ? value.trim().slice(0, max) : null;
const now = () => new Date().toISOString();
const SOCIAL_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "github.com",
  "t.me",
  "pinterest.com",
  "wa.me",
  "threads.net",
  "mastodon.social",
];
const MAX_RECORDS_PER_PAGE = 2000;
// A sitemap file may list up to 50,000 URLs; one file yields at most 10,000.
const MAX_SITEMAP_ENTRIES = 10000;

function absoluteUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const u = new URL(value.trim(), base);
    u.hash = "";
    return ["http:", "https:"].includes(u.protocol) && u.href.length <= 2048
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const isSocial = (href) => {
  try {
    const u = new URL(href);
    const host = u.hostname.replace(/^www\./, "");
    return (
      u.pathname.length > 1 &&
      SOCIAL_HOSTS.some((h) => host === h || host.endsWith("." + h))
    );
  } catch {
    return false;
  }
};
const unique = (values, max = 100) =>
  [...new Set(values.filter(Boolean))].slice(0, max);
const schemaType = (t) => String(t).replace(/^https?:\/\/schema\.org\//i, "");
const typesOf = (entity) =>
  []
    .concat(entity?.["@type"] ?? [])
    .map(schemaType)
    .filter(Boolean);

// JSON-LD is read before scripts are stripped from the document.
function readJsonLd($) {
  const entities = [];
  const visit = (value, depth = 0) => {
    if (
      !value ||
      typeof value !== "object" ||
      depth > 3 ||
      entities.length >= 200
    )
      return;
    if (Array.isArray(value)) return value.forEach((v) => visit(v, depth));
    if (Array.isArray(value["@graph"])) visit(value["@graph"], depth + 1);
    if (value["@type"]) entities.push(value);
  };
  $("script").each((_, el) => {
    if (!/ld\+json/i.test($(el).attr("type") || "")) return;
    const text = $(el)
      .text()
      .replace(/^\s*<!--|-->\s*$/g, "")
      .trim();
    if (!text || text.length > 1024 * 1024) return;
    try {
      visit(JSON.parse(text));
    } catch {
      /* Malformed JSON-LD is skipped; the rest of the page still extracts. */
    }
  });
  return entities;
}
// Microdata items become JSON-LD-shaped objects so one normalizer serves both.
// One walk over the document assigns each property to its nearest item; the
// walk uses an explicit stack and caps properties and text work, so deeply
// nested or property-dense pages stay linear.
const MICRODATA_MAX_PROPS = 5000;
const MICRODATA_TEXT_NODES = 500;
function boundedText(el, max) {
  let text = "",
    visited = 0;
  const stack = [el];
  while (stack.length && text.length < max && visited < MICRODATA_TEXT_NODES) {
    const node = stack.pop();
    visited++;
    if (node.type === "text") text += node.data;
    else if (node.children)
      for (let i = node.children.length - 1; i >= 0; i--)
        stack.push(node.children[i]);
  }
  return clip(text.replace(/\s+/g, " "), max);
}
function readMicrodata($, base) {
  const attr = (el, name) => el.attribs?.[name];
  const valueOf = (el) => {
    switch (el.name) {
      case "meta":
        return attr(el, "content") ?? null;
      case "a":
      case "link":
      case "area":
        return absoluteUrl(attr(el, "href"), base);
      case "img":
      case "audio":
      case "video":
      case "source":
      case "iframe":
      case "embed":
        return absoluteUrl(attr(el, "src"), base);
      case "time":
        return attr(el, "datetime") ?? boundedText(el, 200);
      case "data":
      case "meter":
        return attr(el, "value") ?? boundedText(el, 200);
      default:
        return attr(el, "content") ?? boundedText(el, 1000);
    }
  };
  const items = [];
  let props = 0;
  const root = $.root().get(0);
  const stack = [...(root.children || [])]
    .reverse()
    .map((node) => ({ node, owner: null, depth: 0 }));
  while (stack.length) {
    const { node, owner, depth } = stack.pop();
    if (node.type !== "tag") continue;
    let scope = owner,
      scopeDepth = depth;
    const isItem = attr(node, "itemscope") !== undefined && depth < 5;
    let item = null;
    if (isItem) {
      item = {};
      const type = attr(node, "itemtype");
      if (type)
        item["@type"] = type.split(/\s+/).filter(Boolean).map(schemaType);
      scope = item;
      scopeDepth = depth + 1;
    }
    const names = (attr(node, "itemprop") || "").split(/\s+/).filter(Boolean);
    if (names.length && owner && props < MICRODATA_MAX_PROPS) {
      props++;
      const value = item ?? valueOf(node);
      for (const name of names) {
        if (owner[name] === undefined) owner[name] = value;
        else owner[name] = [].concat(owner[name], value).slice(0, 50);
      }
    } else if (item && !names.length && items.length < 100) items.push(item);
    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i--)
      stack.push({ node: children[i], owner: scope, depth: scopeDepth });
  }
  return items;
}
function metaGroup($, prefix) {
  const out = {};
  $(`meta[property^="${prefix}"], meta[name^="${prefix}"]`)
    .slice(0, 60)
    .each((_, m) => {
      const key = clip($(m).attr("property") || $(m).attr("name"), 100);
      if (key && out[key] === undefined)
        out[key] = clip($(m).attr("content")) ?? "";
    });
  return out;
}
function pageLinks($, url) {
  return unique(
    $("a[href]")
      .map((_, a) => absoluteUrl($(a).attr("href"), url))
      .get(),
    500,
  );
}
function contactsFrom($, url, links, entities) {
  const text = $("body").text();
  const fromLd = (key) =>
    entities.flatMap((e) =>
      [].concat(e[key] ?? [], e.contactPoint?.[key] ?? []),
    );
  const emails = unique(
    [
      ...$('a[href^="mailto:" i]')
        .map((_, a) =>
          clip(decoded($(a).attr("href").slice(7).split("?")[0]), 254),
        )
        .get()
        .filter((e) => EMAIL_ONLY.test(e)),
      ...(text.match(EMAIL) || []),
      ...fromLd("email").map((e) =>
        clip(String(e).replace(/^mailto:/i, ""), 254),
      ),
    ].map((e) => e?.toLowerCase()),
  );
  const phones = unique([
    ...$('a[href^="tel:"]')
      .map((_, a) => clip($(a).attr("href").slice(4), 64))
      .get(),
    ...fromLd("telephone").map((p) => clip(String(p), 64)),
  ]);
  const socialLinks = unique(
    [
      ...links,
      ...fromLd("sameAs").map((s) => absoluteUrl(String(s), url)),
    ].filter((l) => l && isSocial(l)),
  );
  const contactPages = unique(
    $("a[href]")
      .filter((_, a) =>
        /contact|about|impressum|team/i.test(
          `${$(a).attr("href")} ${$(a).text()}`,
        ),
      )
      .map((_, a) => absoluteUrl($(a).attr("href"), url))
      .get(),
    10,
  );
  return { emails, phones, socialLinks, contactPages };
}

// --- Products ------------------------------------------------------------------
const numeric = (v) =>
  typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())
    ? Number(v)
    : (v ?? null);
const first = (v) => (Array.isArray(v) ? v[0] : v);
const nameOf = (v) => {
  const value = first(v);
  return clip(typeof value === "object" && value ? value.name : value, 300);
};
function normalizeProduct(entity, url, source) {
  const offers = []
    .concat(entity.offers ?? [])
    .filter((o) => o && typeof o === "object");
  const offer = offers[0] ?? {};
  const rating = first(entity.aggregateRating) ?? {};
  const images = []
    .concat(entity.image ?? [])
    .map((i) => absoluteUrl(typeof i === "object" ? i?.url : i, url))
    .filter(Boolean)
    .slice(0, 10);
  return {
    sourceUrl: url,
    collectedAt: now(),
    source,
    name: nameOf(entity.name),
    brand: nameOf(entity.brand),
    sku: clip(String(entity.sku ?? ""), 100) || null,
    mpn: clip(String(entity.mpn ?? ""), 100) || null,
    gtin:
      clip(
        String(
          entity.gtin13 ??
            entity.gtin ??
            entity.gtin12 ??
            entity.gtin14 ??
            entity.gtin8 ??
            "",
        ),
        40,
      ) || null,
    price: numeric(first(offer.price) ?? offer.lowPrice),
    priceCurrency: clip(first(offer.priceCurrency), 10),
    lowPrice: numeric(offer.lowPrice),
    highPrice: numeric(offer.highPrice),
    availability: clip(schemaType(first(offer.availability) ?? ""), 60) || null,
    condition: clip(schemaType(first(offer.itemCondition) ?? ""), 60) || null,
    seller: nameOf(offer.seller),
    offerCount:
      offers.length > 1 ? offers.length : (numeric(offer.offerCount) ?? null),
    ratingValue: numeric(rating.ratingValue),
    reviewCount: numeric(rating.reviewCount ?? rating.ratingCount),
    description: clip(first(entity.description), 1000),
    images,
    url: absoluteUrl(first(entity.url), url) ?? url,
  };
}
function products(entities, microdata, $, url) {
  const isProduct = (e) =>
    typesOf(e).some((t) =>
      /^(Product|ProductGroup|IndividualProduct|SomeProducts|Vehicle|Book)$/i.test(
        t,
      ),
    );
  const fromList = (e) =>
    typesOf(e).includes("ItemList")
      ? []
          .concat(e.itemListElement ?? [])
          .map((li) => li?.item ?? li)
          .filter((i) => i && isProduct(i))
      : [];
  const found = [
    ...entities
      .flatMap((e) => (isProduct(e) ? [e] : fromList(e)))
      .map((e) => normalizeProduct(e, url, "json-ld")),
    ...microdata
      .filter(isProduct)
      .map((e) => normalizeProduct(e, url, "microdata")),
  ];
  if (found.length) return found.slice(0, MAX_RECORDS_PER_PAGE);
  // Open Graph product tags are the fallback for shops without structured data.
  const og = { ...metaGroup($, "og:"), ...metaGroup($, "product:") };
  if (
    !/product/i.test(og["og:type"] ?? "") &&
    og["product:price:amount"] === undefined
  )
    return [];
  return [
    normalizeProduct(
      {
        name: og["og:title"],
        brand: og["product:brand"],
        description: og["og:description"],
        image: og["og:image"],
        url: og["og:url"],
        offers: {
          price: og["product:price:amount"],
          priceCurrency: og["product:price:currency"],
          availability: og["product:availability"],
          itemCondition: og["product:condition"],
        },
      },
      url,
      "open-graph",
    ),
  ];
}

// --- Tables --------------------------------------------------------------------
function tables($, url) {
  const records = [];
  $("table")
    .toArray()
    .slice(0, 25)
    .forEach((table, tableIndex) => {
      const rows = ownRows($, table)
        .slice(0, 2001)
        .map((tr) => ({
          header:
            $(tr).children("td").length === 0 || $(tr).parent().is("thead"),
          cells: $(tr)
            .children("th,td")
            .toArray()
            .slice(0, 50)
            .map((c) => clip($(c).text().replace(/\s+/g, " "), 1000) ?? ""),
        }))
        .filter((r) => r.cells.length);
      if (rows.length < 2 || Math.max(...rows.map((r) => r.cells.length)) < 2)
        return;
      const headerRow = rows[0].header ? rows.shift().cells : null;
      const width = Math.max(
        ...rows.map((r) => r.cells.length),
        headerRow?.length ?? 0,
      );
      const reserved = new Set([
        "sourceUrl",
        "collectedAt",
        "tableIndex",
        "caption",
      ]);
      const seen = new Map();
      const keys = Array.from({ length: width }, (_, i) => {
        let key = headerRow?.[i] || `column${i + 1}`;
        if (reserved.has(key)) key += "_";
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return n > 1 ? `${key}_${n}` : key;
      });
      const caption =
        clip($(table).children("caption").text().replace(/\s+/g, " "), 300) ||
        null;
      for (const row of rows) {
        if (records.length >= MAX_RECORDS_PER_PAGE) return;
        const record = {
          sourceUrl: url,
          collectedAt: now(),
          tableIndex,
          caption,
        };
        keys.forEach((key, i) => (record[key] = row.cells[i] ?? null));
        records.push(record);
      }
    });
  return records;
}

// --- Custom selectors ------------------------------------------------------------
// One field per line: `name: css selector`, optionally ending in ` @attribute`.
// A name ending in `[]` collects every match instead of the first.
export function parseSelectorSpec(spec) {
  if (typeof spec !== "string" || !spec.trim())
    throw new Error("Add at least one field, e.g. `title: h1`");
  const probe = cheerio.load("<div></div>");
  const lines = spec
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length > 30) throw new Error("Use at most 30 fields");
  const names = new Set();
  return lines.map((line) => {
    const m =
      /^([A-Za-z_][A-Za-z0-9_]{0,40})(\[\])?\s*:\s*(.+?)(?:\s+@([A-Za-z_:][A-Za-z0-9_:.-]{0,40}))?$/.exec(
        line,
      );
    if (!m) throw new Error(`Cannot read field line: ${line.slice(0, 80)}`);
    const [, name, all, selector, attr] = m;
    if (names.has(name)) throw new Error(`Field "${name}" is defined twice`);
    names.add(name);
    if (selector.length > 300)
      throw new Error(`Selector for "${name}" is too long`);
    try {
      probe(selector);
    } catch {
      throw new Error(
        `Invalid CSS selector for "${name}": ${selector.slice(0, 80)}`,
      );
    }
    return { name, selector, attr: attr ?? null, multiple: Boolean(all) };
  });
}
export function validateSelector(selector) {
  try {
    cheerio.load("<div></div>")(selector);
  } catch {
    throw new Error(`Invalid CSS selector: ${selector.slice(0, 80)}`);
  }
}
function selected($, url, input) {
  const fields = parseSelectorSpec(input.selectors);
  const read = (scope, field) => {
    const matches = scope
      .find(field.selector)
      .toArray()
      .slice(0, field.multiple ? 200 : 1);
    const values = matches.map((el) => {
      if (!field.attr) return clip($(el).text().replace(/\s+/g, " "), 5000);
      const raw = $(el).attr(field.attr);
      return /^(href|src|action|poster|data-src)$/i.test(field.attr)
        ? (absoluteUrl(raw, url) ?? clip(raw, 2048))
        : clip(raw, 5000);
    });
    return field.multiple ? values : (values[0] ?? null);
  };
  const scopes = input.itemSelector
    ? $(input.itemSelector)
        .toArray()
        .slice(0, MAX_RECORDS_PER_PAGE)
        .map((el) => $(el))
    : [$.root()];
  return scopes.map((scope) => {
    const record = { sourceUrl: url, collectedAt: now() };
    for (const field of fields) record[field.name] = read(scope, field);
    return record;
  });
}

// --- Feeds and sitemaps --------------------------------------------------------
const local = (name) => String(name).toLowerCase().replace(/^.*:/, "");
function childNodes(el, name) {
  return (el.children || []).filter(
    (c) => c.type === "tag" && local(c.name) === name,
  );
}
export function extractFeed(body, url) {
  const $ = cheerio.load(body, { xml: true });
  const root = $.root()
    .children()
    .toArray()
    .find((n) => n.type === "tag");
  if (!root) throw new Error("Response is not a feed or sitemap");
  const text = (el, ...names) => {
    for (const name of names) {
      const node = childNodes(el, name)[0];
      if (node) {
        const value = $(node).text().trim();
        if (value) return value;
      }
    }
    return null;
  };
  const plain = (html) =>
    html
      ? clip(cheerio.load(html).root().text().replace(/\s+/g, " "), 1000)
      : null;
  const kind = local(root.name);
  const records = [],
    links = [];
  if (kind === "urlset" || kind === "sitemapindex") {
    const entries = childNodes(
      root,
      kind === "urlset" ? "url" : "sitemap",
    ).slice(0, MAX_SITEMAP_ENTRIES);
    for (const entry of entries) {
      const loc = absoluteUrl(text(entry, "loc"), url);
      if (!loc) continue;
      if (kind === "sitemapindex") links.push(loc);
      records.push({
        sourceUrl: url,
        collectedAt: now(),
        kind: kind === "urlset" ? "sitemap-url" : "sitemap",
        loc,
        lastmod: clip(text(entry, "lastmod"), 40),
        changefreq: clip(text(entry, "changefreq"), 20),
        priority: numeric(text(entry, "priority")),
      });
    }
    return { records, links };
  }
  let channel = root,
    items;
  if (kind === "rss") {
    channel = childNodes(root, "channel")[0] ?? root;
    items = childNodes(channel, "item");
  } else if (kind === "rdf") {
    channel = childNodes(root, "channel")[0] ?? root;
    items = childNodes(root, "item");
  } else if (kind === "feed") {
    items = childNodes(root, "entry");
  } else throw new Error(`Unsupported XML document <${clip(root.name, 40)}>`);
  const feedTitle = clip(text(channel, "title"), 300);
  for (const item of items.slice(0, MAX_RECORDS_PER_PAGE)) {
    let link = text(item, "link");
    if (kind === "feed") {
      const linkNodes = childNodes(item, "link");
      const alternate =
        linkNodes.find(
          (l) => ($(l).attr("rel") ?? "alternate") === "alternate",
        ) ?? linkNodes[0];
      link = alternate ? $(alternate).attr("href") : null;
    }
    records.push({
      sourceUrl: url,
      collectedAt: now(),
      kind: "feed-item",
      feedTitle,
      title: clip(plain(text(item, "title")), 500),
      link: absoluteUrl(link, url),
      published: clip(text(item, "pubdate", "published", "date", "issued"), 60),
      updated: clip(text(item, "updated", "modified"), 60),
      author: clip(
        (kind === "feed"
          ? childNodes(item, "author")
              .map((a) => text(a, "name"))
              .find(Boolean)
          : null) ?? text(item, "creator", "author"),
        200,
      ),
      summary: plain(
        text(item, "description", "summary", "content", "encoded"),
      ),
      categories: unique(
        childNodes(item, "category").map((c) =>
          clip($(c).attr("term") ?? $(c).text(), 100),
        ),
        20,
      ),
      guid: clip(text(item, "guid", "id"), 500),
    });
  }
  return { records, links };
}

// --- Dispatcher -----------------------------------------------------------------
// HTML extractors share one parse. `links` feeds same-site crawling.
export function extractHtml(actorId, body, url, input = {}) {
  const $ = cheerio.load(body);
  const entities = readJsonLd($);
  $("script,style,noscript,iframe,template").remove();
  const title = clip($("title").first().text(), 1000) ?? "";
  const links = pageLinks($, url);
  const page = { sourceUrl: url, title, collectedAt: now() };
  const single = (record) => ({ records: [record], links });
  switch (actorId) {
    case "website-content":
      return single({
        ...page,
        text: $("body").text().replace(/\s+/g, " ").trim().slice(0, 100000),
      });
    case "page-markdown": {
      const main = $("main, article, [role=main]").first();
      const root =
        main.length && main.text().trim().length > 200
          ? main.get(0)
          : ($("body").get(0) ?? $.root().get(0));
      const markdown = htmlToMarkdown($, root, url);
      return single({
        ...page,
        markdown,
        wordCount: markdown.split(/\s+/).filter(Boolean).length,
      });
    }
    case "contact-extractor":
      return single({ ...page, ...contactsFrom($, url, links, entities) });
    case "website-links":
      return single({ ...page, linkCount: links.length, links });
    case "metadata-extractor":
      return single({
        ...page,
        description:
          clip($('meta[name="description"]').attr("content")) || null,
        canonical: absoluteUrl($('link[rel="canonical"]').attr("href"), url),
        language: clip($("html").attr("lang"), 20) || null,
        robots: clip($('meta[name="robots"]').attr("content"), 200) || null,
        h1: clip($("h1").first().text().replace(/\s+/g, " "), 500) || null,
        icon: absoluteUrl($('link[rel~="icon"]').first().attr("href"), url),
        openGraph: metaGroup($, "og:"),
        twitter: metaGroup($, "twitter:"),
      });
    case "structured-data": {
      const microdata = readMicrodata($, url);
      const entity = (syntax, data) => {
        const serialized = JSON.stringify(data);
        return {
          sourceUrl: url,
          collectedAt: now(),
          syntax,
          type: typesOf(data).join(", ") || null,
          name: nameOf(data.name),
          data:
            serialized.length > 100000
              ? { truncated: true, size: serialized.length }
              : data,
        };
      };
      const records = [
        ...entities.map((e) => entity("json-ld", e)),
        ...microdata.map((e) => entity("microdata", e)),
      ];
      const og = metaGroup($, "og:"),
        twitter = metaGroup($, "twitter:");
      if (Object.keys(og).length)
        records.push(
          entity("open-graph", { "@type": og["og:type"] ?? "og", ...og }),
        );
      if (Object.keys(twitter).length)
        records.push(
          entity("twitter-card", { "@type": "twitter-card", ...twitter }),
        );
      return { records: records.slice(0, MAX_RECORDS_PER_PAGE), links };
    }
    case "product-data":
      return {
        records: products(entities, readMicrodata($, url), $, url),
        links,
      };
    case "table-extractor":
      return { records: tables($, url), links };
    case "custom-selectors":
      return { records: selected($, url, input), links };
    default:
      throw new Error(`No HTML extractor for ${actorId}`);
  }
}
// Page text for AI extraction: Markdown of the main content, capped.
export function pageMarkdown(body, url, maxLength) {
  const $ = cheerio.load(body);
  const title = clip($("title").first().text(), 1000) ?? "";
  const main = $("main, article, [role=main]").first();
  const root =
    main.length && main.text().trim().length > 200
      ? main.get(0)
      : ($("body").get(0) ?? $.root().get(0));
  return {
    title,
    markdown: htmlToMarkdown($, root, url, maxLength),
    links: pageLinks($, url),
  };
}
export function contactDetails(body, url) {
  const $ = cheerio.load(body);
  const entities = readJsonLd($);
  $("script,style,noscript,iframe,template").remove();
  return contactsFrom($, url, pageLinks($, url), entities);
}
