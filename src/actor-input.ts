type InputField = {
  name: string;
  label: string;
  type: string;
  options?: { value: string }[];
};

// Shape checks keep JSON-to-form conversion lossless; the server owns run validation.
export function parseActorInput(
  text: string,
  fields: InputField[],
): Record<string, any> {
  let input: any;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error(
      "Input JSON is invalid. Check commas, quotes and brackets.",
    );
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Input JSON must be an object.");
  for (const [key, value] of Object.entries(input)) {
    const field = fields.find((item) => item.name === key);
    if (!field) throw new Error(`Unknown input field: ${key}`);
    const valid =
      field.type === "urls"
        ? Array.isArray(value) &&
          value.every((url) => typeof url === "string" && !/[\n]/.test(url))
        : field.type === "number"
          ? typeof value === "number" && Number.isFinite(value)
          : field.type === "boolean"
            ? typeof value === "boolean"
            : typeof value === "string";
    if (!valid)
      throw new Error(
        `${field.label} must be ${field.type === "urls" ? "an array of URL strings" : field.type === "number" ? "a number" : field.type === "boolean" ? "true or false" : "text"}.`,
      );
    if (
      field.type === "select" &&
      !field.options?.some((option) => option.value === value)
    )
      throw new Error(`${field.label} is not a supported option.`);
  }
  return input;
}
