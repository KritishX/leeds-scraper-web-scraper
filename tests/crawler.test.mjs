import test from "node:test";
import assert from "node:assert/strict";
import { validateUrl, isPublicIPv4, decodeBody } from "../server/crawler.mjs";
import {
  extractHtml,
  extractFeed,
  parseSelectorSpec,
  pageMarkdown,
} from "../server/extractors.mjs";
import { parseRobots, robotsPatternMatches } from "../server/robots.mjs";
import { normalizeInput } from "../server/input.mjs";
import { buildCatalog } from "../server/catalog.mjs";
import { parseModelJson, readLlmConfig } from "../server/sources.mjs";

const html =
  '<!doctype html><html lang="en"><head><title>Test business</title><meta name="description" content="Independent fixture"><meta name="robots" content="index,follow"><meta property="og:title" content="Source title"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://example.com/canonical"><link rel="icon" href="/favicon.ico"></head><body><h1>Business directory</h1><a href="/contact#section">Contact</a><a href="mailto:hello@example.com">Email</a><a href="tel:+977123456789">Call</a><a href="https://www.linkedin.com/company/fixture">LinkedIn</a><a href="https://x.com/">X home</a><script>unsafe script text</script><p>Information from a fixture.</p></body></html>';
const catalog = buildCatalog();
const actor = (id) => catalog.find((a) => a.id === id);

test("page extractors keep source identity and collect their fields", () => {
  for (const id of [
    "website-content",
    "website-links",
    "contact-extractor",
    "metadata-extractor",
    "page-markdown",
  ]) {
    const { records, links } = extractHtml(
      id,
      html,
      "https://example.com/start",
    );
    const [record] = records;
    assert.equal(record.sourceUrl, "https://example.com/start");
    assert.equal(record.title, "Test business");
    assert.ok(Number.isFinite(Date.parse(record.collectedAt)));
    assert.ok(links.includes("https://example.com/contact"));
    if (id === "website-content") {
      assert.match(record.text, /Business directory/);
      assert.doesNotMatch(record.text, /unsafe script/);
    }
    if (id === "website-links")
      assert.equal(record.linkCount, record.links.length);
    if (id === "contact-extractor") {
      assert.deepEqual(record.emails, ["hello@example.com"]);
      assert.deepEqual(record.phones, ["+977123456789"]);
      // Profile links count as social; a bare site root does not.
      assert.deepEqual(record.socialLinks, [
        "https://www.linkedin.com/company/fixture",
      ]);
      assert.deepEqual(record.contactPages, ["https://example.com/contact"]);
    }
    if (id === "metadata-extractor") {
      assert.equal(record.description, "Independent fixture");
      assert.equal(record.language, "en");
      assert.equal(record.h1, "Business directory");
      assert.equal(record.icon, "https://example.com/favicon.ico");
      assert.equal(record.openGraph["og:title"], "Source title");
      assert.equal(record.twitter["twitter:card"], "summary");
    }
    if (id === "page-markdown") {
      assert.match(record.markdown, /^# Business directory/m);
      assert.match(
        record.markdown,
        /\[Contact\]\(https:\/\/example\.com\/contact#section\)/,
      );
      assert.doesNotMatch(record.markdown, /unsafe script/);
    }
  }
});

test("markdown keeps headings, lists, tables, code and safe links only", () => {
  const page =
    '<html><body><main><h2>Plans</h2><p>Some <strong>bold</strong> and <em>soft</em> text with <code>npm ci</code>.</p><ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul><ol><li>First</li></ol><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic | cheap</td><td>$5</td></tr></table><pre><code>line 1\n  line 2</code></pre><blockquote>Quoted</blockquote><a href="javascript:alert(1)">bad link</a><img src="/a.png" alt="Chart"></main></body></html>';
  const {
    records: [{ markdown }],
  } = extractHtml("page-markdown", page, "https://example.com/");
  for (const expected of [
    "## Plans",
    "**bold**",
    "*soft*",
    "`npm ci`",
    "- One",
    "  - Nested",
    "1. First",
    "| Plan | Price |",
    "| --- | --- |",
    "| Basic \\| cheap | $5 |",
    "```\nline 1\n  line 2\n```",
    "> Quoted",
    "![Chart](https://example.com/a.png)",
  ])
    assert.ok(markdown.includes(expected), `missing ${expected}\n${markdown}`);
  assert.doesNotMatch(markdown, /javascript:/);
  assert.match(markdown, /bad link/);
});

test("structured data and products come from JSON-LD, microdata and Open Graph", () => {
  const ld = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Fixture Co",
        email: "sales@fixture.test",
        telephone: "+44 113 000",
      },
      {
        "@type": "Product",
        name: "Trail Shoe",
        brand: { "@type": "Brand", name: "Fixture" },
        sku: "TS-1",
        gtin13: "0000000000001",
        image: ["/shoe.jpg"],
        offers: {
          "@type": "Offer",
          price: "89.50",
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
        },
        aggregateRating: { ratingValue: "4.6", reviewCount: "12" },
      },
    ],
  });
  const page = `<html><head><title>Shop</title><script type="application/ld+json">${ld}</script><script type="application/ld+json">{not json</script><meta property="og:type" content="product"></head><body><div itemscope itemtype="https://schema.org/Product"><span itemprop="name">Rain Jacket</span><div itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="price" content="120"><meta itemprop="priceCurrency" content="GBP"><link itemprop="availability" href="https://schema.org/OutOfStock"></div></div></body></html>`;
  const structured = extractHtml(
    "structured-data",
    page,
    "https://shop.example/item",
  ).records;
  assert.deepEqual(
    structured.map((r) => `${r.syntax}:${r.type}`),
    [
      "json-ld:Organization",
      "json-ld:Product",
      "microdata:Product",
      "open-graph:product",
    ],
  );
  const products = extractHtml(
    "product-data",
    page,
    "https://shop.example/item",
  ).records;
  assert.equal(products.length, 2);
  const [shoe, jacket] = products;
  assert.equal(shoe.name, "Trail Shoe");
  assert.equal(shoe.brand, "Fixture");
  assert.equal(shoe.price, 89.5);
  assert.equal(shoe.priceCurrency, "GBP");
  assert.equal(shoe.availability, "InStock");
  assert.equal(shoe.gtin, "0000000000001");
  assert.equal(shoe.ratingValue, 4.6);
  assert.equal(shoe.reviewCount, 12);
  assert.deepEqual(shoe.images, ["https://shop.example/shoe.jpg"]);
  assert.equal(shoe.source, "json-ld");
  assert.equal(jacket.name, "Rain Jacket");
  assert.equal(jacket.price, 120);
  assert.equal(jacket.availability, "OutOfStock");
  assert.equal(jacket.source, "microdata");
  // Shops with only Open Graph product tags still yield a product.
  const og =
    '<html><head><meta property="og:type" content="og:product"><meta property="og:title" content="Mug"><meta property="product:price:amount" content="9.99"><meta property="product:price:currency" content="EUR"></head><body></body></html>';
  const [mug] = extractHtml(
    "product-data",
    og,
    "https://shop.example/mug",
  ).records;
  assert.equal(mug.name, "Mug");
  assert.equal(mug.price, 9.99);
  assert.equal(mug.source, "open-graph");
  // Contacts also read schema.org organization data.
  const contacts = extractHtml(
    "contact-extractor",
    page,
    "https://shop.example/",
  ).records[0];
  assert.deepEqual(contacts.emails, ["sales@fixture.test"]);
  assert.deepEqual(contacts.phones, ["+44 113 000"]);
});

test("tables become rows keyed by unique headers; layout tables are skipped", () => {
  const page =
    "<html><body><table><tr><td>layout only</td></tr></table><table><caption>Prices</caption><thead><tr><th>Item</th><th>Price</th><th>Price</th><th>sourceUrl</th></tr></thead><tbody><tr><td>Tea</td><td>2</td><td>3</td><td>x</td></tr><tr><td>Coffee</td><td>4</td></tr></tbody></table></body></html>";
  const rows = extractHtml(
    "table-extractor",
    page,
    "https://example.com/t",
  ).records;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    { ...rows[0], collectedAt: null },
    {
      sourceUrl: "https://example.com/t",
      collectedAt: null,
      tableIndex: 1,
      caption: "Prices",
      Item: "Tea",
      Price: "2",
      Price_2: "3",
      sourceUrl_: "x",
    },
  );
  assert.equal(rows[1].Price_2, null);
});

test("custom selectors read text, attributes and repeated items", () => {
  const page =
    '<html><body><div class="card"><h2>Alpha</h2><a href="/a">more</a><span class="tag">x</span><span class="tag">y</span></div><div class="card"><h2>Beta</h2><a href="/b">more</a></div></body></html>';
  const input = {
    itemSelector: ".card",
    selectors:
      "title: h2\nlink: a @href\ntags[]: .tag\n# comment line\nmissing: .nope",
  };
  const records = extractHtml(
    "custom-selectors",
    page,
    "https://example.com/list",
    input,
  ).records;
  assert.deepEqual(
    records.map(({ title, link, tags, missing }) => ({
      title,
      link,
      tags,
      missing,
    })),
    [
      {
        title: "Alpha",
        link: "https://example.com/a",
        tags: ["x", "y"],
        missing: null,
      },
      { title: "Beta", link: "https://example.com/b", tags: [], missing: null },
    ],
  );
  assert.equal(
    extractHtml("custom-selectors", page, "https://example.com/list", {
      selectors: "first: h2",
    }).records.length,
    1,
  );
  for (const bad of ["", "no colon here", "dup: a\ndup: b", "x: a[", "1bad: a"])
    assert.throws(() => parseSelectorSpec(bad), undefined, bad);
});

test("feeds and sitemaps parse RSS, Atom and sitemap indexes", () => {
  const rss =
    '<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>News</title><item><title>First &amp; best</title><link>https://example.com/1</link><pubDate>Thu, 22 Oct 2026 08:00:00 GMT</pubDate><dc:creator>Ana</dc:creator><description><![CDATA[<p>Hello <b>world</b></p>]]></description><category>tech</category><guid>g1</guid></item></channel></rss>';
  const [item] = extractFeed(rss, "https://example.com/feed").records;
  assert.equal(item.feedTitle, "News");
  assert.equal(item.title, "First & best");
  assert.equal(item.link, "https://example.com/1");
  assert.equal(item.author, "Ana");
  assert.equal(item.summary, "Hello world");
  assert.deepEqual(item.categories, ["tech"]);
  const atom =
    '<feed xmlns="http://www.w3.org/2005/Atom"><title>Blog</title><entry><title>Post</title><link rel="alternate" href="/post"/><id>urn:1</id><updated>2026-10-21T00:00:00Z</updated><author><name>Bo</name></author><summary>Short</summary><category term="notes"/></entry></feed>';
  const [entry] = extractFeed(atom, "https://blog.example/atom").records;
  assert.equal(entry.link, "https://blog.example/post");
  assert.equal(entry.author, "Bo");
  assert.deepEqual(entry.categories, ["notes"]);
  const index =
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>';
  assert.deepEqual(
    extractFeed(index, "https://example.com/sitemap.xml").links,
    ["https://example.com/s1.xml"],
  );
  const urlset =
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/a</loc><lastmod>2026-10-01</lastmod><priority>0.8</priority></url></urlset>';
  const [loc] = extractFeed(urlset, "https://example.com/s1.xml").records;
  assert.equal(loc.loc, "https://example.com/a");
  assert.equal(loc.priority, 0.8);
  assert.throws(
    () => extractFeed("<html><body>no</body></html>", "https://example.com/"),
    /Unsupported/,
  );
});

test("robots.txt follows the most specific group, longest match and Allow ties", () => {
  const rules = parseRobots(
    "User-agent: *\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 3\n\nUser-agent: OtherBot\nDisallow: /",
  );
  assert.equal(rules.allows("/private/x"), false);
  assert.equal(rules.allows("/private/public/page"), true);
  assert.equal(rules.allows("/open"), true);
  assert.equal(rules.crawlDelay, 3);
  const specific = parseRobots(
    "User-agent: *\nDisallow: /\n\nUser-agent: LeedsHarvester\nDisallow: /admin",
  );
  assert.equal(specific.allows("/news"), true);
  assert.equal(specific.allows("/admin/x"), false);
  assert.equal(
    parseRobots("User-agent: *\nDisallow:").allows("/anything"),
    true,
  );
  for (const [pattern, path, expected] of [
    ["/*.pdf$", "/a/b.pdf", true],
    ["/*.pdf$", "/a/b.pdf?x", false],
    ["/a*b*c", "/axxbyyc/z", true],
    ["/a*b*c", "/axxcyyb", false],
    ["/exact$", "/exact", true],
    ["/exact$", "/exactly", false],
  ])
    assert.equal(
      robotsPatternMatches(pattern, path),
      expected,
      `${pattern} ${path}`,
    );
  // Many wildcards on a long path stay fast: no regular expressions are built.
  const started = performance.now();
  robotsPatternMatches(
    "/" + "*a".repeat(200) + "$",
    "/" + "a".repeat(2000) + "b",
  );
  assert.ok(performance.now() - started < 200);
});

test("input follows each actor's declared fields", () => {
  assert.deepEqual(
    normalizeInput(actor("website-content"), {
      urls: ["https://example.com/"],
    }),
    { urls: ["https://example.com/"], maxPages: 1, respectRobots: true },
  );
  assert.throws(
    () =>
      normalizeInput(actor("website-content"), {
        urls: ["https://example.com/"],
        extra: 1,
      }),
    /Unknown input field/,
  );
  assert.throws(
    () =>
      normalizeInput(actor("website-content"), {
        urls: ["https://a.example/", "https://b.example/"],
        maxPages: 1,
      }),
    /start URLs/,
  );
  assert.throws(
    () =>
      normalizeInput(actor("custom-selectors"), {
        urls: ["https://example.com/"],
        selectors: "title: h1",
        itemSelector: "div[",
      }),
    /Invalid CSS selector/,
  );
  assert.throws(
    () =>
      normalizeInput(actor("local-business-leads"), {
        category: "custom",
        customTag: 'name"];out;(',
        place: "Leeds",
      }),
    /key=value/,
  );
  assert.deepEqual(
    normalizeInput(actor("local-business-leads"), {
      category: "dentist",
      place: "Leeds",
      customTag: "ignored=yes",
    }),
    { category: "dentist", place: "Leeds", limit: 50, findEmails: false },
  );
  assert.throws(
    () =>
      normalizeInput(actor("social-embeds"), { urls: ["http://10.0.0.1/x"] }),
    /Private/,
  );
  assert.equal(
    normalizeInput(actor("ai-extract"), {
      urls: ["https://example.com/"],
      prompt: "  names  ",
    }).prompt,
    "names",
  );
  assert.equal(
    catalog.find((a) => a.id === "ai-extract").status,
    "requires-provider",
  );
  assert.equal(
    buildCatalog({ llmConfigured: true }).find((a) => a.id === "ai-extract")
      .status,
    "ready",
  );
});

test("model replies parse with fences and reasoning blocks removed", () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(
    parseModelJson('<think>hmm {not}</think>\nHere: {"items":[1,2]} done'),
    { items: [1, 2] },
  );
  assert.throws(() => parseModelJson("no json at all"));
});

test("URL boundary rejects private, encoded, credential and unsupported targets", () => {
  for (const value of [
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://10.0.0.1",
    "http://169.254.169.254/latest",
    "http://192.168.0.1",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://localhost",
    "http://service.local",
    "file:///etc/passwd",
    "https://user:password@example.com",
    "http://example.com:8080",
  ])
    assert.throws(() => validateUrl(value), undefined, value);
  assert.equal(
    validateUrl("https://example.com/a?b=1#fragment").href,
    "https://example.com/a?b=1",
  );
  for (const address of [
    "0.0.0.0",
    "100.64.0.1",
    "172.31.1.1",
    "192.0.2.2",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
  ])
    assert.equal(isPublicIPv4(address), false, address);
  assert.equal(isPublicIPv4("93.184.216.34"), true);
});

test("contact extraction stays linear on long runs of address characters", () => {
  // The former unbounded pattern took several seconds here and grew quadratically.
  const body =
    "<html><body><p>" +
    "a".repeat(200000) +
    "</p><p>reach sales@example.co.uk</p></body></html>";
  const started = performance.now();
  const [record] = extractHtml(
    "contact-extractor",
    body,
    "https://example.com/",
  ).records;
  assert.ok(performance.now() - started < 1000, "extraction exceeded 1 s");
  assert.deepEqual(record.emails, ["sales@example.co.uk"]);
});

test("extracted strings are capped so stored results stay bounded", () => {
  const long = "x".repeat(10000);
  const [record] = extractHtml(
    "metadata-extractor",
    `<html><head><title>${long}</title><meta name="description" content="${long}"></head><body></body></html>`,
    "https://example.com/",
  ).records;
  assert.equal(record.title.length, 1000);
  assert.equal(record.description.length, 2048);
});

// Hostile-input bounds found in review: each case previously took seconds to minutes.
const timed = (fn, limitMs, label) => {
  const started = performance.now();
  const value = fn();
  assert.ok(
    performance.now() - started < limitMs,
    `${label} took ${Math.round(performance.now() - started)} ms`,
  );
  return value;
};
test("markdown stays bounded on deeply nested tables", () => {
  const page =
    "<html><body>" +
    "<table><tr><td>".repeat(300) +
    "x ".repeat(750000) +
    "</td></tr></table>".repeat(300) +
    "</body></html>";
  const {
    records: [{ markdown }],
  } = timed(
    () => extractHtml("page-markdown", page, "https://example.com/"),
    3000,
    "nested tables",
  );
  assert.ok(markdown.length <= 200000);
});
test("microdata stays linear on nested items and dense properties", () => {
  const dense =
    "<html><body>" +
    "<div itemscope>".repeat(100) +
    '<i itemprop="a">x</i>'.repeat(100000) +
    "</div>".repeat(100) +
    "</body></html>";
  timed(
    () => extractHtml("structured-data", dense, "https://example.com/"),
    3000,
    "dense microdata",
  );
  const deep =
    "<html><body><div itemscope>" +
    '<span itemprop="a">'.repeat(10000) +
    "x" +
    "</span>".repeat(10000) +
    "</div></body></html>";
  timed(
    () => extractHtml("structured-data", deep, "https://example.com/"),
    3000,
    "deep microdata",
  );
});
test("model reply parsing is linear on whitespace and reasoning tags", () => {
  assert.deepEqual(
    timed(
      () => parseModelJson('```json\n{"a":1}' + " ".repeat(200000) + "```"),
      200,
      "whitespace",
    ),
    { a: 1 },
  );
  assert.deepEqual(
    timed(
      () => parseModelJson("<think>".repeat(50000) + '</think>{"b":2}'),
      200,
      "think tags",
    ),
    { b: 2 },
  );
});
test("AI endpoint config rejects credentials in the URL", () => {
  assert.throws(
    () =>
      readLlmConfig({
        LEEDS_LLM_BASE_URL: "https://user:sk-secret@api.example/v1",
        LEEDS_LLM_MODEL: "m",
      }),
    /LEEDS_LLM_API_KEY/,
  );
  assert.equal(readLlmConfig({}), null);
  assert.deepEqual(
    readLlmConfig({
      LEEDS_LLM_BASE_URL: "https://api.example/v1/",
      LEEDS_LLM_MODEL: "m",
      LEEDS_LLM_API_KEY: "k",
    }),
    { baseUrl: "https://api.example/v1", model: "m", apiKey: "k" },
  );
});
test("a charset declared in the page is honoured when the header has none", () => {
  const latin1 = Buffer.from(
    '<html><head><meta charset="iso-8859-1"></head><body>café</body></html>',
    "latin1",
  );
  assert.match(decodeBody(latin1, "text/html"), /café/);
  assert.match(
    decodeBody(
      Buffer.from(
        '<?xml version="1.0" encoding="ISO-8859-1"?><rss>naïve</rss>',
        "latin1",
      ),
      "application/xml",
    ),
    /naïve/,
  );
  assert.match(
    decodeBody(Buffer.from("plain é", "utf8"), "text/html; charset=utf-8"),
    /é/,
  );
});
test("robots.txt groups match the product token, not any substring of the User-Agent", () => {
  assert.equal(
    parseRobots("User-agent: e\nDisallow: /\n\nUser-agent: *\nAllow: /").allows(
      "/page",
    ),
    true,
  );
  for (const name of ["LeedsHarvester", "leedsharvester"])
    assert.equal(
      parseRobots(
        `User-agent: *\nAllow: /\n\nUser-agent: ${name}\nDisallow: /`,
      ).allows("/page"),
      false,
      name,
    );
});
test("<br> becomes a Markdown hard break that survives whitespace trimming", () => {
  const html = "<p>10 Main St<br>Leeds</p>  <p>trailing   </p>";
  const { markdown } = extractHtml(
    "page-markdown",
    html,
    "https://example.com/",
  ).records[0];
  assert.equal(markdown, "10 Main St\\\nLeeds\n\ntrailing");
  // The AI extractor reads the same Markdown.
  assert.equal(pageMarkdown(html, "https://example.com/").markdown, markdown);
});
test("mailto links match case-insensitively and are percent-decoded; malformed ones are ignored", () => {
  const html =
    '<a href="MAILTO:Info@Example.com">a</a><a href="mailto:sales%40example.com?subject=x">b</a><a href="mailto:%E0%A4%A">c</a>';
  assert.deepEqual(
    extractHtml("contact-extractor", html, "https://example.com/").records[0]
      .emails,
    ["info@example.com", "sales@example.com"],
  );
});
