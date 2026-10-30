import React from "react";

// WAI-ARIA tabs with automatic activation: Left/Right move to the previous or
// next tab, Home/End to the first or last. Only the selected tab is in the Tab
// order. Pair with tabPanel(id, selected) on the element showing the panel.
export function Tabs({
  id,
  label,
  tabs,
  selected,
  onSelect,
  className = "tabs",
}: {
  id: string;
  label: string;
  tabs: readonly string[];
  selected: string;
  onSelect: (tab: string) => void;
  className?: string;
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    // Move from the focused tab: the selection can lag behind fast key presses
    // while the router applies the previous one.
    const focused = tabs.findIndex(
      (tab) => `${id}-tab-${tab}` === (e.target as HTMLElement).id,
    );
    const i = focused >= 0 ? focused : tabs.indexOf(selected),
      n = tabs.length;
    const next = {
      ArrowRight: (i + 1) % n,
      ArrowLeft: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    onSelect(tabs[next]);
    document.getElementById(`${id}-tab-${tabs[next]}`)?.focus();
  }
  return (
    <div
      className={className}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`${id}-tab-${tab}`}
          aria-selected={tab === selected}
          aria-controls={`${id}-panel`}
          tabIndex={tab === selected ? 0 : -1}
          className={tab === selected ? "active" : ""}
          onClick={() => onSelect(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

export const tabPanel = (id: string, selected: string) => ({
  role: "tabpanel",
  id: `${id}-panel`,
  "aria-labelledby": `${id}-tab-${selected}`,
  tabIndex: 0,
});
