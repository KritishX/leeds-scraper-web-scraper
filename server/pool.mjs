// Runs `work` on up to `limit` items at once. Each outcome ({ value } or
// { error }) reaches `take` in input order, as soon as it and every earlier
// outcome are ready, so records keep their order while requests overlap.
// `take` returning false stops new work; an exception from `take` stops it
// too and is rethrown once every started item has settled.
export async function orderedPool(items, limit, work, take) {
  const outcomes = new Map();
  let next = 0,
    cursor = 0,
    stop = false,
    error = null;
  const flush = () => {
    while (!stop && outcomes.has(cursor)) {
      const outcome = outcomes.get(cursor);
      outcomes.delete(cursor);
      const index = cursor++;
      try {
        if (take(outcome, items[index], index) === false) stop = true;
      } catch (e) {
        stop = true;
        error = e;
      }
    }
  };
  const worker = async () => {
    while (!stop && next < items.length) {
      const i = next++;
      let outcome;
      try {
        outcome = { value: await work(items[i], i) };
      } catch (e) {
        outcome = { error: e };
      }
      outcomes.set(i, outcome);
      flush();
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  if (error) throw error;
}
