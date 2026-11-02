// Errors that carry an HTTP status; the router turns them into JSON responses.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const reject = (status, message) => {
  throw new HttpError(status, message);
};
export const text = (v, name, max = 120) => {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    reject(400, `${name} is required (maximum ${max} characters)`);
  return v.trim();
};
