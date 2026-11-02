import * as cheerio from "cheerio";
import { clip } from "./extractors.mjs";
import { validateUrl } from "./crawler.mjs";

const TIKTOK = new Set(["tiktok-scraper", "tiktok-search"]);
const INSTAGRAM = new Set([
  "instagram-scraper",
  "instagram-profile",
  "instagram-reel",
]);
const SEARCH = new Set(["tiktok-search", "facebook-search-posts"]);
const MAX_BYTES = 2 * 1024 * 1024;
const text = (value) => clip(value, 10000) || null;
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function validatePlatformUrl(actorId, value) {
  const u = validateUrl(value);
  const host = u.hostname;
  let allowed = false;
  if (TIKTOK.has(actorId) && ["tiktok.com", "www.tiktok.com"].includes(host)) {
    allowed =
      actorId === "tiktok-search"
        ? /^\/search\/?$/.test(u.pathname) && Boolean(u.searchParams.get("q"))
        : /^\/@[^/]{1,80}(?:\/video\/\d{1,30})?\/?$/.test(u.pathname) ||
          /^\/tag\/[^/]{1,120}\/?$/.test(u.pathname);
  } else if (
    INSTAGRAM.has(actorId) &&
    ["instagram.com", "www.instagram.com"].includes(host)
  ) {
    const profile =
      /^\/(?!accounts(?:\/|$)|explore(?:\/|$)|direct(?:\/|$)|stories(?:\/|$)|p(?:\/|$)|reel(?:\/|$)|reels(?:\/|$))[\w.]{1,30}\/?$/;
    const reel = /^\/reel\/[\w-]{1,100}\/?$/;
    allowed =
      actorId === "instagram-profile"
        ? profile.test(u.pathname)
        : actorId === "instagram-reel"
          ? reel.test(u.pathname)
          : profile.test(u.pathname) ||
            reel.test(u.pathname) ||
            /^\/p\/[\w-]{1,100}\/?$/.test(u.pathname);
  } else if (
    actorId === "facebook-search-posts" &&
    ["facebook.com", "www.facebook.com", "m.facebook.com"].includes(host)
  ) {
    allowed =
      /^\/search\/posts\/?$/.test(u.pathname) &&
      Boolean(u.searchParams.get("q"));
  }
  if (!allowed)
    throw new Error(
      "Use a supported public platform URL; search scrapers require a public search URL with q. Login, people and private pages are unsupported.",
    );
  return u;
}

// shortcut: only known public hydration schemas are read; add fixtures when platforms change them.
function parseJson(value) {
  if (!value || value.length > MAX_BYTES) return null;
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of value) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "[" || c === "{") {
      if (++depth > 64) return null;
    } else if (c === "]" || c === "}") depth--;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function base(actorId, url, extractionMode) {
  return {
    platform: TIKTOK.has(actorId)
      ? "tiktok"
      : INSTAGRAM.has(actorId)
        ? "instagram"
        : "facebook",
    sourceUrl: url,
    collectedAt: new Date().toISOString(),
    extractionMode,
    id: null,
    name: null,
    username: null,
    description: null,
    imageUrl: null,
    videoUrl: null,
    publishedAt: null,
    followers: null,
    likes: null,
    comments: null,
    shares: null,
    views: null,
  };
}
function tiktokItem(actorId, value, url) {
  const item = object(value),
    author = object(item.author),
    stats = object(item.stats);
  if (!text(item.id) || typeof item.desc !== "string") return null;
  return {
    ...base(actorId, url, "public-embedded-json"),
    id: text(item.id),
    description: text(item.desc),
    username: text(author.uniqueId),
    name: text(author.nickname),
    imageUrl: text(item.video?.cover),
    videoUrl: text(item.video?.playAddr),
    publishedAt:
      number(item.createTime) !== null && item.createTime < 1e11
        ? new Date(item.createTime * 1000).toISOString()
        : null,
    likes: number(stats.diggCount),
    comments: number(stats.commentCount),
    shares: number(stats.shareCount),
    views: number(stats.playCount),
  };
}
function jsonLd($) {
  const entities = [];
  for (const el of $('script[type="application/ld+json"]')
    .toArray()
    .slice(0, 20)) {
    const root = parseJson($(el).text());
    for (const value of (Array.isArray(root) ? root : [root]).slice(0, 100)) {
      if (!value || typeof value !== "object") continue;
      entities.push(value);
      if (Array.isArray(value["@graph"]))
        entities.push(...value["@graph"].slice(0, 100));
      if (value["@type"] === "ItemList" && Array.isArray(value.itemListElement))
        entities.push(
          ...value.itemListElement.slice(0, 100).map((x) => x?.item ?? x),
        );
    }
  }
  return entities.slice(0, 200);
}

export function parsePublicPlatform(actorId, html, url) {
  validatePlatformUrl(actorId, url);
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_BYTES)
    throw new Error("Public HTML is missing or exceeds 2 MB.");
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  if (
    /^(?:log ?in|sign ?in|login|security check|just a moment|access denied|verify you are human|page not found|content unavailable|page isn.t available)/i.test(
      title,
    ) ||
    $(
      'form[action*="/login"], input[name="password"], #captcha, #challenge-form',
    ).length
  )
    throw new Error(
      "Platform returned a login or challenge page. Public HTML only; no login or bypass is supported.",
    );
  const records = [];
  if (TIKTOK.has(actorId)) {
    const sigi = parseJson($("script#SIGI_STATE").first().text());
    const universal = parseJson(
      $("script#__UNIVERSAL_DATA_FOR_REHYDRATION__").first().text(),
    );
    const scope = object(universal?.__DEFAULT_SCOPE__);
    const items = [];
    if (SEARCH.has(actorId)) {
      const search = object(scope["webapp.search"]);
      for (const row of (Array.isArray(search.itemList)
        ? search.itemList
        : []
      ).slice(0, 50))
        items.push(row);
      for (const row of (Array.isArray(search.data) ? search.data : []).slice(
        0,
        50,
      ))
        if (row?.item) items.push(row.item);
      // SIGI_STATE's SearchModule explicitly identifies search records.
      for (const id of (Array.isArray(sigi?.SearchModule?.itemList)
        ? sigi.SearchModule.itemList
        : []
      ).slice(0, 50))
        if (
          typeof id === "string" &&
          Object.hasOwn(object(sigi?.ItemModule), id)
        )
          items.push(sigi.ItemModule[id]);
    } else {
      items.push(...Object.values(object(sigi?.ItemModule)).slice(0, 50));
      const detail = scope["webapp.video-detail"]?.itemInfo?.itemStruct;
      if (detail) items.push(detail);
      if (!items.length) {
        const profile = scope["webapp.user-detail"]?.userInfo;
        if (profile?.user?.uniqueId)
          records.push({
            ...base(actorId, url, "public-embedded-json"),
            id: text(profile.user.id),
            username: text(profile.user.uniqueId),
            name: text(profile.user.nickname),
            description: text(profile.user.signature),
            followers: number(profile.stats?.followerCount),
            imageUrl: text(profile.user.avatarLarger),
          });
      }
    }
    records.push(
      ...items.map((x) => tiktokItem(actorId, x, url)).filter(Boolean),
    );
  } else {
    for (const entity of jsonLd($)) {
      const types = [].concat(entity?.["@type"] ?? []);
      if (
        actorId === "facebook-search-posts" &&
        !types.includes("SocialMediaPosting")
      )
        continue;
      if (
        INSTAGRAM.has(actorId) &&
        !types.some((t) =>
          [
            "VideoObject",
            "ImageObject",
            "Person",
            "Organization",
            "ProfilePage",
            "SocialMediaPosting",
          ].includes(t),
        )
      )
        continue;
      if (
        actorId === "instagram-profile" &&
        types.some((t) =>
          ["VideoObject", "ImageObject", "SocialMediaPosting"].includes(t),
        )
      )
        continue;
      if (actorId === "instagram-reel" && !types.includes("VideoObject"))
        continue;
      const data = types.includes("ProfilePage") ? entity.mainEntity : entity;
      if (
        !data ||
        !(
          text(data.name) ||
          text(data.headline) ||
          text(data.description) ||
          text(data.articleBody)
        )
      )
        continue;
      records.push({
        ...base(actorId, url, "public-json-ld"),
        id: text(data.identifier),
        name: text(data.name ?? data.headline),
        description: text(data.description ?? data.articleBody),
        imageUrl: text(
          Array.isArray(data.thumbnailUrl)
            ? data.thumbnailUrl[0]
            : (data.thumbnailUrl ?? data.image),
        ),
        videoUrl: text(data.contentUrl),
        publishedAt: text(data.uploadDate ?? data.datePublished),
      });
    }
  }
  if (!records.length && !SEARCH.has(actorId)) {
    const meta = (key) =>
      text($(`meta[property="${key}"]`).first().attr("content"));
    const name = meta("og:title"),
      description = meta("og:description");
    if (
      name &&
      !/^(?:instagram|tiktok)(?:\s*[-|]|$)/i.test(name) &&
      (description || meta("og:image"))
    )
      records.push({
        ...base(actorId, url, "public-page-metadata"),
        name,
        description,
        imageUrl: meta("og:image"),
        videoUrl: meta("og:video"),
      });
  }
  if (!records.length)
    throw new Error(
      "No supported public records were embedded in this page. JavaScript-only, login-walled and changed schemas cannot be extracted; use a different public URL.",
    );
  return records
    .filter(
      (r, i, all) =>
        all.findIndex(
          (x) =>
            x.id === r.id &&
            x.name === r.name &&
            x.description === r.description,
        ) === i,
    )
    .slice(0, 50);
}

export async function runPublicPlatform({
  actorId,
  input,
  signal,
  getPage,
  push,
  log = () => {},
}) {
  let requested = input.urls;
  if (SEARCH.has(actorId) && (!Array.isArray(requested) || !requested.length)) {
    if (
      typeof input.query !== "string" ||
      !input.query.trim() ||
      input.query.length > 500
    )
      throw new Error("Supply a search query between 1 and 500 characters.");
    const searchUrl = new URL(
      actorId === "tiktok-search"
        ? "https://www.tiktok.com/search"
        : "https://www.facebook.com/search/posts/",
    );
    searchUrl.searchParams.set("q", input.query.trim());
    requested = [searchUrl.href];
  }
  if (!Array.isArray(requested) || !requested.length || requested.length > 50)
    throw new Error("Supply between 1 and 50 public URLs.");
  const urls = [
    ...new Set(
      requested.map((value) => validatePlatformUrl(actorId, value).href),
    ),
  ];
  const limit = input.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Result limit must be between 1 and 50.");
  let pages = 0,
    records = 0,
    failures = 0;
  const errors = [];
  for (const url of urls) {
    signal.throwIfAborted();
    if (records >= limit) break;
    let parsed;
    try {
      const page = await getPage(url, { maxBytes: MAX_BYTES });
      signal.throwIfAborted();
      validatePlatformUrl(actorId, page.url);
      parsed = parsePublicPlatform(actorId, page.body, page.url);
      pages++;
    } catch (e) {
      signal.throwIfAborted();
      failures++;
      errors.push(e.message);
      log(`Public page failed: ${url}: ${e.message}`);
      continue;
    }
    for (const record of parsed) {
      signal.throwIfAborted();
      if (records >= limit) break;
      if (push(record) !== false) records++;
    }
  }
  if (!records)
    throw new Error(
      `No public platform records collected. ${errors.slice(0, 3).join(" ")}`,
    );
  return { pages, records, failures };
}
