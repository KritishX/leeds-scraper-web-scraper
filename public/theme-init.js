// Applies the saved theme, or the OS preference, before first paint so a
// light page never flashes dark. Loaded synchronously from index.html because
// the CSP (script-src 'self') forbids inline scripts. src/theme.tsx takes over
// once the app runs.
(function () {
  var choice = "system";
  try {
    choice = localStorage.getItem("leeds-theme") || "system";
  } catch {
    // Blocked storage: follow the OS.
  }
  var dark =
    choice === "dark" ||
    (choice !== "light" &&
      !window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#171819" : "#f5f6f4";
})();
