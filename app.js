(function () {
  // Paste the deployed Google Apps Script Web App URL here.
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxIwRIyAPAqbgTHhEL4FEHqDhpSd1htsDcJWuUr1rmVa6Vw0CTc4fZN5o_SWZ4uak9z/exec";
  const STORAGE_KEY = "rm2026-recent";
  const form = document.querySelector("#entryForm");
  const status = document.querySelector("#status");
  const recentList = document.querySelector("#recentList");
  const balanceAmount = document.querySelector("#balanceAmount");
  const date = document.querySelector("#date");
  date.value = new Date().toISOString().slice(0, 10);

  function money(value) { return value ? `RM ${Number(value).toFixed(2)}` : "—"; }
  function getRecent() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (_) { return []; } }
  function renderRecent() {
    const rows = getRecent();
    recentList.innerHTML = rows.length ? rows.map((row) => `<article class="recent-row"><div><strong>${escapeHtml(row.item)}</strong><small>${row.date}${row.other ? ` · ${escapeHtml(row.other)}` : ""}</small></div><span>${row.dt ? `-${money(row.dt)}` : `+${money(row.kt)}`}</span></article>`).join("") : '<p class="empty">还没有本机记录</p>';
  }
  function renderBalance(value) { balanceAmount.textContent = value == null ? "RM —" : `RM ${Number(value).toFixed(2)}`; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function setStatus(message, type) { status.textContent = message; status.className = `status ${type || ""}`; }
  async function loadBalance() {
    if (!APPS_SCRIPT_URL) return;
    try {
      const response = await fetch(APPS_SCRIPT_URL);
      const result = await response.json();
      if (typeof result.balance === "number") renderBalance(result.balance);
    } catch (_) { /* Keep the balance placeholder when the sheet is unavailable. */ }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.dt && !data.kt) return setStatus("请填写进账或出账。", "error");
    if (data.dt && data.kt) return setStatus("一笔记录请只填写进账或出账其中一项。", "error");
    const payload = { date: data.date, item: data.item.trim(), other: data.other.trim(), dt: data.dt || "", kt: data.kt || "" };
    setStatus(APPS_SCRIPT_URL ? "正在保存…" : "界面已完成，但尚未连接 Google Sheet。", "pending");
    if (APPS_SCRIPT_URL) {
      try {
        const response = await fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) });
        if (!response.ok) throw new Error("save failed");
        const result = await response.json();
        if (typeof result.balance === "number") renderBalance(result.balance);
        setStatus("已保存到 RM2026。", "success");
      } catch (_) { return setStatus("保存失败，请检查连接设置。", "error"); }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([payload, ...getRecent()].slice(0, 8)));
    renderRecent();
    form.reset();
    date.value = new Date().toISOString().slice(0, 10);
  });
  document.querySelector("#clearButton").addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); renderRecent(); });
  renderRecent();
  loadBalance();
})();
