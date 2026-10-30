import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildCatalog } from "../../server/catalog.mjs";
import { StorePage } from "../../src/pages/Store";
import { Runs } from "../../src/pages/Runs";
import { ErrorBoundary } from "../../src/components/ErrorBoundary";
import { Tabs } from "../../src/components/Tabs";

const json = (data: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
let requests: string[];
beforeEach(() => {
  requests = [];
  vi.stubGlobal("fetch", (url: string) => {
    requests.push(url);
    if (url === "/api/catalog") return json({ actors: buildCatalog() });
    if (url === "/api/runs") return json({ runs: [] });
    return Promise.reject(new Error("unexpected " + url));
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Store", () => {
  it("shows a loading state, then filters the catalog by search and category", async () => {
    render(
      <MemoryRouter>
        <StorePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    expect(
      await screen.findByText("22 tools to make the web work for you"),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search Actors"), {
      target: { value: "sitemap" },
    });
    expect(
      screen.getByText("1 tools to make the web work for you"),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Feed & Sitemap Reader" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search Actors"), {
      target: { value: "no such tool" },
    });
    expect(screen.getByText("No Actors found")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    fireEvent.click(screen.getByRole("button", { name: /Social media/ }));
    expect(
      screen.getAllByRole("link").filter((l) => l.className === "actor-card")
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("heading", { name: "Feed & Sitemap Reader" }),
    ).toBeNull();
  });
});

describe("Runs polling", () => {
  it("skips refreshes while the tab is hidden and refreshes once when shown", async () => {
    vi.useFakeTimers();
    let state: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => state,
    );
    const { unmount } = render(
      <MemoryRouter>
        <Runs />
      </MemoryRouter>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(requests).toEqual(["/api/runs"]);
    state = "hidden";
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(requests.length).toBe(1);
    state = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(requests.length).toBe(2);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(requests.length).toBe(2);
  });
});

describe("ErrorBoundary", () => {
  it("shows the fallback with the message instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Broken = () => {
      throw new Error("Unexpected record shape");
    };
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(
      /Something went wrong.*Unexpected record shape/,
    );
    expect(
      screen.getByRole("link", { name: "Go to the dashboard" }),
    ).toBeTruthy();
  });
});

describe("Tabs", () => {
  it("moves with arrow keys, Home and End, keeping one tab in the Tab order", () => {
    const tabs = ["Input", "README", "Output"];
    let selected = "Input";
    const view = () => (
      <Tabs
        id="t"
        label="Sections"
        tabs={tabs}
        selected={selected}
        onSelect={(t) => (selected = t)}
      />
    );
    const { rerender } = render(view());
    const press = (key: string) => {
      fireEvent.keyDown(document.activeElement!, { key });
      rerender(view());
      return selected;
    };
    screen.getByRole("tab", { name: "Input" }).focus();
    expect(press("ArrowRight")).toBe("README");
    expect(press("End")).toBe("Output");
    expect(press("ArrowRight")).toBe("Input");
    expect(press("ArrowLeft")).toBe("Output");
    expect(press("Home")).toBe("Input");
    expect(
      screen.getAllByRole("tab").filter((t) => t.tabIndex === 0).length,
    ).toBe(1);
    expect(
      screen.getByRole("tab", { name: "Input" }).getAttribute("aria-selected"),
    ).toBe("true");
  });
});
