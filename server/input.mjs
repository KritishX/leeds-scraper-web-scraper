import { validateUrl } from "./crawler.mjs";
import { parseSelectorSpec, validateSelector } from "./extractors.mjs";
import { LOCAL_BUSINESS_CATEGORIES } from "./catalog.mjs";

export class InputError extends Error {}
const fail = (message) => {
  throw new InputError(message);
};
const CUSTOM_TAG = /^[a-z][a-z0-9_:]{0,39}=[A-Za-z0-9_:;. -]{1,60}$/;

// Validates input against the actor's declared fields and returns only those
// fields, with defaults applied. Unknown fields are rejected rather than kept.
export function normalizeInput(actor, input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    fail("Input must be an object");
  const known = new Set(actor.fields.map((f) => f.name));
  for (const key of Object.keys(input))
    if (!known.has(key)) fail(`Unknown input field: ${key.slice(0, 40)}`);
  const out = {};
  for (const field of actor.fields) {
    const value = input[field.name];
    // An empty list in an optional field is "not provided", as the UI sends it.
    const empty = Array.isArray(value) && !value.length && !field.required;
    if (value === undefined || value === null || value === "" || empty) {
      if (field.required) fail(`${field.label} is required`);
      if (field.default !== undefined) out[field.name] = field.default;
      continue;
    }
    switch (field.type) {
      case "urls": {
        if (!Array.isArray(value) || !value.length || value.length > field.max)
          fail(`Provide 1–${field.max} public website URLs`);
        try {
          out[field.name] = [...new Set(value.map((v) => validateUrl(v).href))];
        } catch (e) {
          fail(e.message);
        }
        break;
      }
      case "number":
        if (!Number.isInteger(value) || value < field.min || value > field.max)
          fail(`${field.label} must be an integer from ${field.min} to ${field.max}`);
        out[field.name] = value;
        break;
      case "boolean":
        if (typeof value !== "boolean") fail(`${field.label} must be true or false`);
        out[field.name] = value;
        break;
      case "select":
        if (!field.options.some((o) => o.value === value))
          fail(`${field.label} is not a supported option`);
        out[field.name] = value;
        break;
      case "text":
      case "textarea":
        if (typeof value !== "string" || value.length > field.maxLength)
          fail(`${field.label} must be text of at most ${field.maxLength} characters`);
        if (value.trim()) out[field.name] = value.trim();
        else if (field.required) fail(`${field.label} is required`);
        break;
      default:
        fail(`Unsupported field type ${field.type}`);
    }
  }
  // Start URLs count toward the page limit, so the limit must cover them all.
  if (known.has("maxPages")) {
    out.maxPages ??= out.urls.length;
    if (out.maxPages < out.urls.length)
      fail("Maximum pages must be at least the number of start URLs");
  }
  try {
    if (out.selectors !== undefined) parseSelectorSpec(out.selectors);
    if (out.itemSelector !== undefined) validateSelector(out.itemSelector);
  } catch (e) {
    fail(e.message);
  }
  if (actor.id === "local-business-leads") {
    if (out.category === "custom" && !CUSTOM_TAG.test(out.customTag ?? ""))
      fail("Custom tag must look like key=value, e.g. shop=florist");
    if (out.category !== "custom") delete out.customTag;
    if (!LOCAL_BUSINESS_CATEGORIES[out.category] && out.category !== "custom")
      fail("Business type is not supported");
  }
  if (actor.id === "youtube-scraper" && !out.query && !out.urls?.length)
    fail("Enter public YouTube video URLs or a search query");
  return out;
}
