import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { buildCatalog } from "../../server/catalog.mjs";
import { normalizeInput } from "../../server/input.mjs";
import {
  InputFields,
  initialValues,
  toInput,
  toValues,
} from "../../src/components/inputs";
import type { Actor, Field } from "../../src/api/client";

const actors = buildCatalog() as Actor[];
const actor = (id: string) => actors.find((a) => a.id === id)!;
afterEach(cleanup);

function Form({ fields }: { fields: Field[] }) {
  const [values, setValues] = useState(initialValues(fields));
  return (
    <>
      <InputFields fields={fields} values={values} onChange={setValues} />
      <output data-testid="input">
        {JSON.stringify(toInput(fields, values))}
      </output>
    </>
  );
}

describe("InputFields", () => {
  it("renders a control for every field type in the catalog", () => {
    const control = {
      urls: "TEXTAREA",
      textarea: "TEXTAREA",
      select: "SELECT",
      number: "INPUT",
      text: "INPUT",
      boolean: "INPUT",
    };
    const seen = new Set<string>();
    for (const a of actors) {
      const { container, unmount } = render(<Form fields={a.fields} />);
      for (const field of a.fields) {
        // customTag only shows for the "custom" business type.
        if (field.name === "customTag") continue;
        const label = Array.from(container.querySelectorAll("label")).find(
          (l) => l.textContent?.includes(field.label),
        );
        expect(label, `${a.id}.${field.name}`).toBeTruthy();
        const element = label!.querySelector("input, select, textarea")!;
        expect(element.tagName).toBe(control[field.type]);
        if (field.type === "boolean")
          expect((element as HTMLInputElement).type).toBe("checkbox");
        if (field.type === "number")
          expect((element as HTMLInputElement).type).toBe("number");
        seen.add(field.type);
      }
      unmount();
    }
    expect([...seen].sort()).toEqual(Object.keys(control).sort());
  });

  it("sends what the user typed, in the types the server expects", () => {
    render(<Form fields={actor("website-content").fields} />);
    fireEvent.change(screen.getByLabelText(/Start URLs/), {
      target: { value: "https://a.example\n\n https://b.example \n" },
    });
    fireEvent.change(screen.getByLabelText(/Maximum pages/), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByLabelText(/robots/i));
    expect(JSON.parse(screen.getByTestId("input").textContent!)).toEqual({
      urls: ["https://a.example", "https://b.example"],
      maxPages: 5,
      respectRobots: false,
    });
  });
});

describe("toInput", () => {
  it("sends an empty URL list that the server accepts for an optional URL field (#2)", () => {
    const youtube = actor("youtube-scraper");
    const payload = toInput(youtube.fields, {
      ...initialValues(youtube.fields),
      query: "lofi",
    });
    expect(payload.urls).toEqual([]);
    expect(() => normalizeInput(youtube, payload)).not.toThrow();
    // A required URL field still refuses the same empty list.
    const site = actor("website-content");
    expect(() =>
      normalizeInput(site, toInput(site.fields, initialValues(site.fields))),
    ).toThrow();
  });

  it("drops blank text and the custom tag unless the custom type is chosen", () => {
    const leads = actor("local-business-leads");
    const values = {
      ...initialValues(leads.fields),
      place: "  ",
      customTag: "shop=florist",
    };
    const input = toInput(leads.fields, values);
    expect(input).not.toHaveProperty("customTag");
    expect(input.place).toBeUndefined();
    expect(
      toInput(leads.fields, { ...values, category: "custom" }).customTag,
    ).toBe("shop=florist");
  });

  it("round-trips through toValues", () => {
    const fields = actor("custom-selectors").fields;
    const input = {
      urls: ["https://example.com/"],
      maxPages: 3,
      selectors: "title: h1",
      respectRobots: true,
    };
    expect(toInput(fields, toValues(fields, input))).toEqual(input);
  });
});
