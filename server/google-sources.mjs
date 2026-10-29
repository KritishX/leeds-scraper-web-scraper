import { clip } from "./extractors.mjs";
import { validateUrl } from "./crawler.mjs";

const now = () => new Date().toISOString();
const limitOf = (input, max) => Math.min(max, Math.max(1, Math.trunc(Number(input.limit) || 20)));
const number = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const publicUrl = (value) => {
  try { return validateUrl(value).href; } catch { return null; }
};
function ready(ctx) {
  ctx.signal?.throwIfAborted();
  if (ctx.timeLeft && ctx.timeLeft() < 5000) throw new Error("Stopped before the run deadline; collected results are kept");
}
// Upstream errors may include the request URL or credentials; expose only status.
async function request(ctx, url, options = {}) {
  ready(ctx);
  try {
    const data = await ctx.fetchJson(url, { ...options, signal: ctx.signal });
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid response");
    if (data.error) throw Object.assign(new Error("API error"), { status: data.error.code });
    return data;
  } catch (error) {
    // The caught error is not attached as `cause`: it can carry the request URL or key.
    /* eslint-disable preserve-caught-error */
    ctx.signal?.throwIfAborted();
    if (error.code === "LEEDS_RUN_DOWNLOAD_LIMIT") throw new Error("Run download budget reached; partial results retained");
    const status = Number.isInteger(error.status) ? ` (HTTP ${error.status})` : "";
    throw new Error(`Google service request failed${status}; check credentials, API access and quota`);
    /* eslint-enable preserve-caught-error */
  }
}
function queryOf(input) {
  const query = clip(input.query, 1000);
  if (!query) throw new Error("Enter a search query");
  return query;
}

export async function runGoogleMaps(ctx, { googleMapsKey } = {}) {
  if (!googleMapsKey) throw new Error("Google Maps requires LEEDS_GOOGLE_MAPS_API_KEY with Places API (New) enabled; Google may charge for requests");
  const limit = limitOf(ctx.input, 60), query = queryOf(ctx.input);
  let token, count = 0;
  const seen = new Set();
  for (let page = 0; page < 3 && count < limit; page++) {
    const data = await request(ctx, "https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": googleMapsKey,
        "X-Goog-FieldMask": "nextPageToken,places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.businessStatus,places.rating,places.userRatingCount,places.regularOpeningHours.weekdayDescriptions,places.attributions",
      },
      body: JSON.stringify({ textQuery: query, pageSize: Math.min(20, limit), ...(token ? { pageToken: token } : {}) }),
    });
    if (data.places !== undefined && !Array.isArray(data.places)) throw new Error("Google Maps returned an invalid places response");
    for (const place of data.places ?? []) {
      const id = clip(place.id, 500);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const sourceUrl = publicUrl(place.googleMapsUri) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(id)}`;
      if (!ctx.push({
        sourceUrl, collectedAt: now(), placeId: id,
        name: clip(place.displayName?.text, 1000), address: clip(place.formattedAddress, 2000),
        phone: clip(place.internationalPhoneNumber ?? place.nationalPhoneNumber, 100),
        website: publicUrl(place.websiteUri), latitude: number(place.location?.latitude), longitude: number(place.location?.longitude),
        businessStatus: clip(place.businessStatus, 100), rating: number(place.rating), ratingCount: number(place.userRatingCount),
        openingHours: Array.isArray(place.regularOpeningHours?.weekdayDescriptions) ? place.regularOpeningHours.weekdayDescriptions.slice(0, 7).map((s) => clip(s, 500)) : null,
        attributions: Array.isArray(place.attributions) ? place.attributions.slice(0, 20).map((a) => ({ provider: clip(a.provider, 500), providerUri: publicUrl(a.providerUri) })) : [],
      })) return { failures: 0 };
      count++;
      if (count >= limit) break;
    }
    const next = clip(data.nextPageToken, 4000);
    if (!next || next === token) break;
    token = next;
  }
  if (!count) ctx.log("No matching places returned by Google Maps");
  return { failures: 0 };
}

export async function runGoogleSearch(ctx, { googleSearchKey, googleSearchEngineId } = {}) {
  if (!googleSearchKey || !googleSearchEngineId) throw new Error("Google Search requires LEEDS_GOOGLE_SEARCH_API_KEY and LEEDS_GOOGLE_SEARCH_ENGINE_ID for an existing eligible Custom Search JSON API customer; closed to new customers and ends January 1, 2027");
  const query = queryOf(ctx.input), limit = limitOf(ctx.input, 100);
  let count = 0, start = 1;
  const seen = new Set();
  while (start <= 100 && count < limit) {
    const params = new URLSearchParams({ q: query, cx: googleSearchEngineId, start: String(start), num: String(Math.min(10, limit - count, 101 - start)) });
    const data = await request(ctx, `https://customsearch.googleapis.com/customsearch/v1?${params}`, { headers: { "X-Goog-Api-Key": googleSearchKey } });
    if (data.items !== undefined && !Array.isArray(data.items)) throw new Error("Google Search returned an invalid results response");
    for (const item of data.items ?? []) {
      const sourceUrl = publicUrl(item.link);
      if (!sourceUrl || seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
      if (!ctx.push({ sourceUrl, collectedAt: now(), title: clip(item.title, 1000), snippet: clip(item.snippet, 4000), displayLink: clip(item.displayLink, 500), rank: start + data.items.indexOf(item) })) return { failures: 0 };
      count++;
      if (count >= limit) break;
    }
    const next = Number(data.queries?.nextPage?.[0]?.startIndex);
    if (!Number.isInteger(next) || next <= start || next > 100) break;
    start = next;
  }
  if (!count) ctx.log("No matching results returned by Google Search");
  return { failures: 0 };
}

function videoId(value) {
  try {
    const u = validateUrl(value), host = u.hostname.toLowerCase();
    let id;
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      if (u.pathname === "/watch") id = u.searchParams.get("v");
      else if (/^\/(shorts|embed)\//.test(u.pathname)) id = u.pathname.split("/")[2];
    }
    return /^[\w-]{11}$/.test(id ?? "") ? id : null;
  } catch { return null; }
}
const youtubeUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
const youtubeApi = (ctx, key, method, params) => request(ctx, `https://www.googleapis.com/youtube/v3/${method}?${new URLSearchParams(params)}`, { headers: { "X-Goog-Api-Key": key } });
export async function runYouTube(ctx, { youtubeKey } = {}) {
  const limit = limitOf(ctx.input, 100), query = clip(ctx.input.query, 1000);
  const urls = Array.isArray(ctx.input.urls) ? ctx.input.urls : [];
  if (!query && !urls.length) throw new Error("Enter public YouTube video URLs or a search query");
  if (query && !youtubeKey) throw new Error("YouTube keyword search requires LEEDS_YOUTUBE_API_KEY with YouTube Data API v3 enabled; public video URLs can use oEmbed without a key");
  let failures = 0;
  const ids = new Set();
  for (const url of urls.slice(0, 100)) {
    const id = videoId(url);
    if (id) ids.add(id);
    else { failures++; ctx.log("Skipped a URL: a public YouTube watch, shorts or youtu.be video URL is required"); }
  }
  if (query) {
    let token;
    const tokens = new Set();
    for (let page = 0; page < 2 && ids.size < limit; page++) {
      const data = await youtubeApi(ctx, youtubeKey, "search", { part: "snippet", type: "video", q: query, maxResults: String(Math.min(50, limit - ids.size)), ...(token ? { pageToken: token } : {}) });
      if (!Array.isArray(data.items)) throw new Error("YouTube returned an invalid search response");
      for (const item of data.items) if (/^[\w-]{11}$/.test(item.id?.videoId ?? "")) ids.add(item.id.videoId);
      token = clip(data.nextPageToken, 4000);
      if (!token || tokens.has(token)) break;
      tokens.add(token);
    }
  }
  const selected = [...ids].slice(0, limit);
  if (!youtubeKey) {
    for (const id of selected) {
      const sourceUrl = youtubeUrl(id);
      try {
        const data = await request(ctx, `https://www.youtube.com/oembed?${new URLSearchParams({ url: sourceUrl, format: "json" })}`);
        if (typeof data.title !== "string") throw new Error("YouTube returned no video metadata");
        if (!ctx.push({ sourceUrl, collectedAt: now(), videoId: id, title: clip(data.title, 1000), channelName: clip(data.author_name, 500), channelUrl: publicUrl(data.author_url), thumbnailUrl: publicUrl(data.thumbnail_url), views: null, likes: null, comments: null, subscriberCount: null })) break;
      } catch (error) {
        ctx.signal?.throwIfAborted();
        failures++; ctx.log(`Failed ${sourceUrl}: ${error.message}`);
      }
    }
  } else {
    for (let offset = 0; offset < selected.length; offset += 50) {
      const batch = selected.slice(offset, offset + 50);
      const data = await youtubeApi(ctx, youtubeKey, "videos", { part: "snippet,statistics,contentDetails", id: batch.join(","), maxResults: "50" });
      if (!Array.isArray(data.items)) throw new Error("YouTube returned an invalid videos response");
      const found = data.items.filter((v) => batch.includes(v.id));
      failures += batch.length - new Set(found.map((v) => v.id)).size;
      const channelIds = [...new Set(found.map((v) => v.snippet?.channelId).filter((id) => typeof id === "string" && /^[\w-]{1,100}$/.test(id)))];
      const channels = new Map();
      if (channelIds.length) {
        const response = await youtubeApi(ctx, youtubeKey, "channels", { part: "statistics", id: channelIds.join(","), maxResults: "50" });
        if (!Array.isArray(response.items)) throw new Error("YouTube returned an invalid channels response");
        for (const item of response.items) channels.set(item.id, item.statistics ?? {});
      }
      for (const video of found) {
        const snippet = video.snippet ?? {}, stats = video.statistics ?? {}, channelStats = channels.get(snippet.channelId);
        if (!ctx.push({ sourceUrl: youtubeUrl(video.id), collectedAt: now(), videoId: video.id,
          title: clip(snippet.title, 1000), description: clip(snippet.description, 10000), publishedAt: clip(snippet.publishedAt, 100), channelName: clip(snippet.channelTitle, 500), channelId: clip(snippet.channelId, 100),
          channelUrl: channelIds.includes(snippet.channelId) ? `https://www.youtube.com/channel/${snippet.channelId}` : null,
          thumbnailUrl: publicUrl(snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url), duration: clip(video.contentDetails?.duration, 100),
          views: number(stats.viewCount), likes: number(stats.likeCount), comments: number(stats.commentCount),
          subscriberCount: channelStats?.hiddenSubscriberCount ? null : number(channelStats?.subscriberCount), channelVideoCount: number(channelStats?.videoCount),
        })) return { failures };
      }
    }
    if (failures) ctx.log(`${failures} requested videos were unavailable or invalid`);
  }
  if (!selected.length) ctx.log("No matching public YouTube videos found");
  return { failures };
}

export function createGoogleSourceRunners(config = {}) {
  return {
    "google-maps-scraper": (ctx) => runGoogleMaps(ctx, config),
    "google-search-scraper": (ctx) => runGoogleSearch(ctx, config),
    "youtube-scraper": (ctx) => runYouTube(ctx, config),
  };
}
