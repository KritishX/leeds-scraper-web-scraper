import { reject, text } from "./errors.mjs";

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// An IANA zone name, kept as given (ICU would rename some, e.g. Kathmandu to
// Katmandu); unknown names are a 400.
export function timeZoneOf(value = "UTC") {
  const zone = text(value, "Time zone", 64);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    reject(400, "Unknown time zone; use an IANA name such as Europe/London");
  }
  return zone;
}

// Reads the wall-clock fields of a timestamp in a zone. UTC skips Intl.
function wallClock(zone) {
  if (zone === "UTC")
    return (ts) => {
      const d = new Date(ts);
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        weekday: d.getUTCDay(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
      };
    };
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
  });
  return (ts) => {
    const p = {};
    for (const { type, value } of format.formatToParts(ts)) p[type] = value;
    return {
      year: +p.year,
      month: +p.month,
      day: +p.day,
      weekday: WEEKDAYS[p.weekday],
      hour: +p.hour,
      minute: +p.minute,
    };
  };
}

// Five-field cron evaluated in `timeZone` (default UTC), or a fixed interval.
// Daylight saving: a wall time that is skipped does not fire, and one that
// repeats fires once, the first time.
export function cronPlan(cron, intervalMinutes, timeZone = "UTC") {
  if (cron !== undefined) {
    const wall = wallClock(timeZoneOf(timeZone));
    const value = text(cron, "Cron expression", 80);
    const fields = value.split(/\s+/);
    if (fields.length !== 5) reject(400, "Use a five-field cron expression");
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
    // Non-matching months, days and hours are skipped whole, so an eight-year
    // search (enough for leap days) stays a few hundred steps. Jumps stop an
    // hour short of local midnight, so a DST change cannot carry them past it.
    const early = (minutes) => (minutes > 60 ? minutes - 60 : minutes);
    const nextAfter = (date) => {
      let ts = Math.floor(date / 60000) * 60000 + 60000;
      const end = ts + 8 * 366 * 86400000;
      while (ts < end) {
        const w = wall(ts);
        const toMidnight = (24 - w.hour) * 60 - w.minute;
        const dayOfMonth = sets[2].has(w.day),
          dayOfWeek = sets[4].has(w.weekday);
        if (!sets[3].has(w.month)) {
          const daysLeft =
            new Date(Date.UTC(w.year, w.month, 0)).getUTCDate() - w.day;
          ts += early(daysLeft * 1440 + toMidnight) * 60000;
        } else if (
          !(eitherDay ? dayOfMonth || dayOfWeek : dayOfMonth && dayOfWeek)
        )
          ts += early(toMidnight) * 60000;
        else if (!sets[1].has(w.hour)) ts += (60 - w.minute) * 60000;
        else if (!sets[0].has(w.minute)) ts += 60000;
        else {
          // The second pass through a repeated (fall-back) hour is skipped.
          const before = wall(ts - 3600000);
          if (
            before.hour === w.hour &&
            before.minute === w.minute &&
            before.day === w.day
          )
            ts += 60000;
          else return ts;
        }
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
