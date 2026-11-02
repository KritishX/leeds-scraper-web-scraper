import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Field } from "../api/client";

export const splitUrls = (text: string) =>
  text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);

export const initialValues = (fields: Field[]) =>
  Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === "urls"
        ? ""
        : (f.default ??
          (f.type === "boolean"
            ? false
            : f.type === "number"
              ? (f.min ?? 1)
              : "")),
    ]),
  );

// The inverse of toInput: form values for a stored input, defaults elsewhere.
export function toValues(fields: Field[], input: Record<string, any>) {
  const defaults = initialValues(fields);
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      field.type === "urls"
        ? (input[field.name] ?? []).join("\n")
        : (input[field.name] ?? defaults[field.name]),
    ]),
  );
}

// Converts form values to the run input the server validates.
export function toInput(fields: Field[], values: Record<string, any>) {
  const input: Record<string, any> = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === "urls") input[f.name] = splitUrls(v ?? "");
    else if (f.type === "number") input[f.name] = Number(v);
    else if (f.type === "boolean") input[f.name] = Boolean(v);
    else if (typeof v === "string" && v.trim()) input[f.name] = v;
  }
  if (input.category && input.category !== "custom") delete input.customTag;
  return input;
}

export function useInputValues(fields: Field[] | undefined) {
  const [values, setValues] = useState<Record<string, any>>({});
  useEffect(() => {
    if (fields) setValues(initialValues(fields));
  }, [fields]);
  // Start URLs count toward the page limit, so it never drops below them.
  const urlCount = splitUrls(values.urls ?? "").length;
  useEffect(() => {
    if (
      fields?.some((f) => f.name === "maxPages") &&
      (values.maxPages ?? 1) < urlCount
    )
      setValues((v) => ({ ...v, maxPages: Math.min(20, urlCount) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the URL count only
  }, [urlCount]);
  return [values, setValues] as const;
}

export function InputFields({
  fields,
  values,
  onChange,
  urlLists = false,
}: {
  fields: Field[];
  values: Record<string, any>;
  onChange: (values: Record<string, any>) => void;
  urlLists?: boolean;
}) {
  const set = (name: string, value: any) =>
    onChange({ ...values, [name]: value });
  return (
    <>
      {fields.map((f) => {
        if (f.name === "customTag" && values.category !== "custom") return null;
        // One element, so the label's column layout keeps the asterisk inline.
        const label = (
          <span>
            {f.label} {f.required && <span className="required">*</span>}
          </span>
        );
        const help = f.help && <small>{f.help}</small>;
        if (f.type === "urls" && urlLists)
          return (
            <UrlList
              key={f.name}
              field={f}
              value={values[f.name] ?? ""}
              onChange={(value) => set(f.name, value)}
            />
          );
        if (f.type === "boolean")
          return (
            <label className="check-field" key={f.name}>
              <input
                type="checkbox"
                checked={Boolean(values[f.name])}
                onChange={(e) => set(f.name, e.target.checked)}
              />
              <span>
                {f.label}
                {help}
              </span>
            </label>
          );
        return (
          <label key={f.name}>
            {label}
            {f.type === "urls" || f.type === "textarea" ? (
              <textarea
                rows={f.type === "urls" ? 4 : 6}
                className={f.name === "selectors" ? "mono" : undefined}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : f.type === "select" ? (
              <select
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "number" ? (
              <input
                type="number"
                min={
                  f.name === "maxPages"
                    ? Math.max(f.min ?? 1, splitUrls(values.urls ?? "").length)
                    : f.min
                }
                max={f.max}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, Number(e.target.value))}
              />
            ) : (
              <input
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                value={values[f.name] ?? ""}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
            {help}
          </label>
        );
      })}
    </>
  );
}

export function UrlList({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}) {
  const [bulk, setBulk] = useState(false);
  // Keep blank rows while editing; splitUrls normalizes only at submission.
  const rows = value.split("\n");
  return (
    <fieldset className="url-list">
      <legend>
        {field.label} {field.required && <span className="required">*</span>}
      </legend>
      <div className="url-list-heading">
        <small>{field.help}</small>
        <button
          type="button"
          className="text-button"
          onClick={() => setBulk(!bulk)}
        >
          {bulk ? "Edit individual URLs" : "Bulk edit"}
        </button>
      </div>
      {bulk ? (
        <label>
          <span className="sr-only">{field.label}, one URL per line</span>
          <textarea
            rows={6}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      ) : (
        rows.map((url, index) => (
          <div className="url-row" key={index}>
            <span className="url-index">{index + 1}</span>
            <input
              aria-label={`${field.label} ${index + 1}`}
              placeholder={field.placeholder}
              value={url}
              onChange={(e) =>
                onChange(
                  rows
                    .map((row, i) => (i === index ? e.target.value : row))
                    .join("\n"),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove URL ${index + 1}`}
              onClick={() =>
                onChange(rows.filter((_, i) => i !== index).join("\n"))
              }
            >
              <X size={16} />
            </button>
          </div>
        ))
      )}
      {!bulk && (
        <button
          type="button"
          className="btn"
          disabled={rows.length >= (field.max ?? 20)}
          onClick={() => onChange(value + "\n")}
        >
          <Plus size={14} /> Add URL
        </button>
      )}
      <small>
        {splitUrls(value).length} URLs · maximum {field.max ?? 20}
      </small>
    </fieldset>
  );
}
