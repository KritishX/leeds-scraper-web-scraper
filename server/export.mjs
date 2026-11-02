import { reject } from "./errors.mjs";

// A quoted CSV cell. Text that a spreadsheet would read as a formula gets a
// leading apostrophe.
export const csvCell = (v) => {
  let s =
    typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "");
  // Only text can carry a formula; numbers and booleans export as-is.
  if (typeof v !== "number" && typeof v !== "boolean" && /^[=+\-@\t\r]/.test(s))
    s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};

// Serialises a run's records as JSON, JSON Lines or CSV (one column per key
// seen in any record).
export function exportRecords(records, format) {
  if (!["json", "jsonl", "csv"].includes(format))
    reject(400, "Export format must be json, jsonl or csv");
  let output;
  if (format === "json") output = JSON.stringify(records, null, 2);
  else if (format === "jsonl")
    output = records.map((r) => JSON.stringify(r)).join("\n");
  else {
    const keys = [...new Set(records.flatMap(Object.keys))];
    output = [
      keys.map(csvCell).join(","),
      ...records.map((row) => keys.map((k) => csvCell(row[k])).join(",")),
    ].join("\r\n");
  }
  return {
    contentType: {
      json: "application/json; charset=utf-8",
      jsonl: "application/x-ndjson; charset=utf-8",
      csv: "text/csv; charset=utf-8",
    }[format],
    body: output,
  };
}
