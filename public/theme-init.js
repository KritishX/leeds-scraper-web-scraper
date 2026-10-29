// Applies the saved theme before first paint so a light-mode reload doesn't
// flash dark. It is a same-origin file because the server's CSP blocks inline
// scripts. Keep the key, colours and rule in step with src/theme.ts.
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("leeds-theme") || "system";
  } catch (e) {}
  var light =
    pref === "light" ||
    (pref !== "dark" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#f5f6f3" : "#171819");
})();
