import { cronPlan } from "./cron.mjs";

// Checks every second for due schedules, starts their task and plans the next
// occurrence. A schedule whose timing can no longer be planned is disabled.
export function startScheduler({ store: { list, find, save }, enqueue }) {
  let stopped = false;
  function tick() {
    if (stopped) return;
    const time = Date.now();
    for (const schedule of list("schedule")) {
      if (!schedule.enabled || Date.parse(schedule.nextRunAt) > time) continue;
      try {
        const task = find(schedule.taskId, "task");
        const run = enqueue(task.actorId, task.input);
        schedule.lastRunId = run.id;
        schedule.lastError = null;
      } catch (e) {
        schedule.lastError = String(e.message).slice(0, 300);
      }
      try {
        schedule.nextRunAt = new Date(
          cronPlan(
            schedule.cron ?? undefined,
            schedule.intervalMinutes,
            schedule.timezone,
          ).nextAfter(time),
        ).toISOString();
      } catch (e) {
        schedule.enabled = false;
        schedule.lastError = e.message;
      }
      save("schedule", schedule);
    }
  }
  const scheduler = setInterval(tick, 1000);
  scheduler.unref();
  return {
    tick,
    stop() {
      stopped = true;
      clearInterval(scheduler);
    },
  };
}
