import { reject, text } from "./errors.mjs";

export function cronPlan(cron, intervalMinutes) {
  if (cron !== undefined) {
    const value = text(cron, "Cron expression", 80);
    const fields = value.split(/\s+/);
    if (fields.length !== 5)
      reject(400, "Use a five-field cron expression (UTC)");
    const limits = [
      [0, 59],
      [0, 23],
      [1, 31],
      [1, 12],
      [0, 7],
    ];
    const sets = fields.map((field, i) => {
      const set = new Set();
      for (const part of field.split(",")) {
        const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
        if (!m) reject(400, "Unsupported cron expression");
        const step = Number(m[2] || 1);
        if (step < 1 || step > 60) reject(400, "Invalid cron step");
        const [min, max] = limits[i];
        let low = min,
          high = max;
        if (m[1] !== "*") {
          const r = m[1].split("-").map(Number);
          low = r[0];
          high = r[1] ?? (m[2] ? max : low);
        }
        if (low < min || high > max || low > high)
          reject(400, "Cron field is out of range");
        // Day-of-week 7 is Sunday, like 0.
        for (let n = low; n <= high; n += step)
          set.add(i === 4 && n === 7 ? 0 : n);
      }
      return set;
    });
    // Standard cron: when both day fields are restricted (not starting with
    // `*`), either may match.
    const eitherDay = !fields[2].startsWith("*") && !fields[4].startsWith("*");
    // Non-matching days and hours are skipped whole, so an eight-year search
    // (enough for leap days) stays a few thousand steps.
    const nextAfter = (date) => {
      let ts = Math.floor(date / 60000) * 60000 + 60000;
      const end = ts + 8 * 366 * 86400000;
      while (ts < end) {
        const d = new Date(ts);
        const dayOfMonth = sets[2].has(d.getUTCDate()),
          dayOfWeek = sets[4].has(d.getUTCDay());
        if (
          !sets[3].has(d.getUTCMonth() + 1) ||
          !(eitherDay ? dayOfMonth || dayOfWeek : dayOfMonth && dayOfWeek)
        )
          ts = Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate() + 1,
          );
        else if (!sets[1].has(d.getUTCHours()))
          ts += (60 - d.getUTCMinutes()) * 60000;
        else if (!sets[0].has(d.getUTCMinutes())) ts += 60000;
        else return ts;
      }
      reject(400, "Cron has no matching time within eight years");
    };
    return { cron: value, intervalMinutes: null, nextAfter };
  }
  if (
    !Number.isInteger(intervalMinutes) ||
    intervalMinutes < 1 ||
    intervalMinutes > 525600
  )
    reject(400, "Interval must be 1–525600 minutes");
  return {
    cron: null,
    intervalMinutes,
    nextAfter: (date) => date + intervalMinutes * 60000,
  };
}
