import { isoDate, addDays } from "./util.js";
import { ensureConfig, getConfig, setConfig, getDay, upsertDay, listRecentDays, dayNumber, pillarsEffectiveForDate, lifeRange, statusForEntry } from "./db.js";
import { GridRenderer } from "./grid.js";

const isNativeApp = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

function getCapacitorPlugins(){
  if(!isNativeApp || !window.Capacitor) return null;
  const plugins = window.Capacitor.Plugins || {};
  return {
    App: plugins.App || null,
    Filesystem: plugins.Filesystem || null,
    Share: plugins.Share || null,
  };
}



const $ = (sel, root=document) => root.querySelector(sel);

function setActiveNav(route){
  document.querySelectorAll(".nav-link").forEach(a=>{
    a.classList.toggle("active", a.dataset.nav === route);
  });
}

function toast(type, msg){
  const box = document.createElement("div");
  box.className = `toast ${type}`;
  box.textContent = msg;
  const app = $("#app");
  app.prepend(box);
  setTimeout(()=> box.remove(), 2800);
}

function route(){
  const hash = window.location.hash || "#/dashboard";
  const [path, qs] = hash.split("?");
  const q = new URLSearchParams(qs || "");
  return { path, q };
}

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function renderSetup(app, cfg){
  setActiveNav("");
  app.innerHTML = `
    <section class="card">
      <h1>Welcome. Let’s map the rest of your life.</h1>
      <p class="muted">Everything stays on your device. No accounts. No tracking. Just clarity.</p>
      <form class="form" id="setupForm">
        <div class="grid2">
          <div class="field"><label for="birth">Birthday</label><input id="birth" type="date" required><div class="hint">Used to estimate an ~85-year lifespan.</div></div>
          <div class="field"><label for="start">First log date (Day 1)</label><input id="start" type="date" value="${isoDate(new Date())}" required><div class="hint">Defaults to today.</div></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="name">Display name (optional)</label><input id="name" type="text" placeholder="e.g., Alex"></div>
          <div class="field"><label for="life">Lifespan (years)</label><input id="life" type="number" min="50" max="120" value="${cfg.lifespanYears || 85}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="defaultView">Default view</label><select id="defaultView" class="select-light"><option value="week">Week</option><option value="month" selected>Month</option><option value="year">Year</option><option value="decade">Decade</option><option value="lifetime">Lifetime</option></select></div>
          <div class="field"></div>
        </div>
        <div class="actions"><button class="btn primary" type="submit">Create my life grid</button></div>
      </form>
    </section>`;
  $("#setupForm").addEventListener("submit", async (ev)=>{
    ev.preventDefault();
    const birthDate = $("#birth").value, startDate = $("#start").value;
    if(!birthDate || !startDate) return toast("error","Please enter valid dates.");
    if(birthDate > isoDate(new Date())) return toast("error","Birthday can't be in the future.");
    cfg.birthDate = birthDate; cfg.startDate = startDate; cfg.displayName = $("#name").value.trim(); cfg.lifespanYears = Number($("#life").value || 85); cfg.defaultView = $("#defaultView").value || "month";
    cfg.pillars = (cfg.pillars||[]).map(p => ({...p, effectiveDate: p.effectiveDate || startDate}));
    await setConfig(cfg); window.location.hash = "#/dashboard";
  });
}

function makeDashboardHTML(cfg){
  const name = cfg.displayName ? `${escapeHtml(cfg.displayName)}’s` : "Your";
  const range = lifeRange(cfg);
  return `
    <section class="dash-head">
      <div class="card">
        <h1>${name} Life Grid</h1>
        <p class="muted">Day <strong id="dayNum">—</strong> • <span class="mono">${escapeHtml(cfg.startDate)} → ${escapeHtml(range.end)}</span> <span class="streak" style="margin-left:10px">🔥 Streak: <strong id="streak">—</strong></span></p>
        <div class="dash-actions"><a class="btn primary" href="#/log?date=${encodeURIComponent(isoDate(new Date()))}">Log today</a><button class="btn" id="copyToday">Copy to Clipboard</button><button class="btn" id="saveTodayExport">Save Export File</button></div>
      </div>
      <div class="card controls">
        <div class="control-row"><div class="muted small">View</div><div class="segment" id="viewSeg">${["week","month","year","decade","lifetime"].map(v=> `<button class="chip" data-view="${v}" type="button">${v[0].toUpperCase()+v.slice(1)}</button>`).join("")}</div></div>
        <div class="control-row"><div class="muted small">Mode</div><div class="segment" id="modeSeg"><button class="chip active" data-mode="binary" type="button">Binary</button><button class="chip" data-mode="gradient" type="button">Gradient</button></div></div>
        
        <div class="control-row"><div class="muted small">Legend</div><div class="legend"><span class="swatch good"></span> Good <span class="swatch medium"></span> Medium <span class="swatch bad"></span> Bad <span class="swatch connection"></span> Connection </div></div>
      </div>
    </section>
    <section class="card grid-shell"><div class="nav-center"><button class="btn ghost" id="prev" type="button">←</button><button class="btn" id="today" type="button">Today</button><button class="btn ghost" id="next" type="button">→</button></div><div class="canvas-wrap"><canvas id="gridCanvas" aria-label="Life grid"></canvas></div><div class="muted small" style="margin-top:10px">Desktop: hover a day. Mobile: tap to preview, tap again to open log.</div></section>
    <section class="card"><div class="control-row"><div><h2>Recent logs</h2><div class="muted small">Quick access to your latest entries.</div></div></div><div class="recent" id="recent"></div></section>
    <section class="card collapsed" id="imgPanel"><div class="collapsible-head"><div><h2>Generated PNG (shareable)</h2><div class="muted small">Includes year labels. Uses your current mode (Binary/Gradient).</div></div><button class="caret" id="toggleImg" type="button" aria-label="Toggle image panel"></button></div><div class="collapsible-body"><div class="actions"><button class="btn" id="genPng" type="button">Generate</button><button class="btn" id="downloadPng" type="button">Save PNG</button></div><img id="pngImg" class="grid-image" alt="Generated life grid PNG" /></div></section>`;
}

async function computeStreak(){
  let streak = 0; let d = new Date();
  for(let i=0;i<365;i++){
    const e = await getDay(isoDate(d));
    if(!e || statusForEntry(e, "binary").status !== "good") break;
    streak++; d = addDays(d, -1);
  }
  return streak;
}

function buildClipboardTextFromState(cfg, dateISO, tasks, dayNote){
  const dn = dayNumber(cfg, dateISO); const lines = ["-------", `🏛️ PILLARS - Day ${dn}`, "-------"];
  for(const t of (tasks||[])){
    const mark = t.done ? "✅" : "❌"; let key = t.key || ""; if(key === "L1" || key === "L2") key = "L";
    const note = (t.note||"").trim(); lines.push(`-# ${key} – ${t.name || ""} → ${t.target || ""}: ${mark}${note ? `  ${note}` : ""}`);
  }
  if((dayNote||"").trim()) lines.push("", (dayNote||"").trim());
  return lines.join("\n");
}

async function copyTextToClipboard(txt){
  try{ await navigator.clipboard.writeText(txt); }
  catch{ const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
}

async function copyClipboardExport(dateISO){
  const cfg = await getConfig(); const entry = await getDay(dateISO);
  if(!entry) return toast("warning","No saved log for that date yet. Save first.");
  await copyTextToClipboard(buildClipboardTextFromState(cfg, dateISO, entry.tasks || [], entry.dayNote || ""));
  toast("success","Copied to Clipboard ✅");
}

async function saveBlobMobileFriendly(blob, filename){
  const plugins = await getCapacitorPlugins();
  if(plugins){
    try{
      const base64 = await new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onloadend = ()=> {
          const out = String(reader.result || "");
          const comma = out.indexOf(",");
          resolve(comma >= 0 ? out.slice(comma + 1) : out);
        };
        reader.onerror = ()=> reject(reader.error);
        reader.readAsDataURL(blob);
      });

      const mime = blob.type || (
        filename.endsWith(".png") ? "image/png" :
        filename.endsWith(".json") ? "application/json" :
        "text/plain"
      );

      const written = await plugins.Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: plugins.Directory.Cache,
        recursive: true,
      });

      await plugins.Share.share({
        title: filename,
        text: filename,
        url: written.uri,
        dialogTitle: "Save or share file",
      });
      return true;
    }catch(err){
      console.error("Native export failed", err);
    }
  }

  if (window.showSaveFilePicker) {
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: blob.type || "File",
          accept: { [blob.type || "application/octet-stream"]: [`.${filename.split(".").pop()}`] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }catch(err){
      if (err && err.name === "AbortError") return false;
    }
  }

  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  if(navigator.canShare && navigator.canShare({ files: [file] })){
    await navigator.share({ files: [file], title: filename });
    return true;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 60000);
  return true;
}

async function exportAllData(
){
  const cfg = await getConfig(); const req = indexedDB.open("pillars-life-grid", 1);
  const db = await new Promise((resolve, reject)=>{ req.onsuccess = ()=> resolve(req.result); req.onerror = ()=> reject(req.error); });
  const days = await new Promise((resolve, reject)=>{ const getAll = db.transaction("days","readonly").objectStore("days").getAll(); getAll.onsuccess = ()=> resolve(getAll.result || []); getAll.onerror = ()=> reject(getAll.error); });
  return { schema: 1, exportedAt: new Date().toISOString(), config: cfg, days };
}

async function restoreAllData(payload){
  if(!payload || !payload.config || !Array.isArray(payload.days)) throw new Error("Invalid backup file.");
  const req = indexedDB.open("pillars-life-grid", 1);
  const db = await new Promise((resolve, reject)=>{ req.onsuccess = ()=> resolve(req.result); req.onerror = ()=> reject(req.error); });
  await new Promise((resolve, reject)=>{
    const tx = db.transaction(["meta","days"], "readwrite");
    tx.objectStore("meta").put({ key: "config", value: payload.config });
    const days = tx.objectStore("days");
    const clearReq = days.clear();
    clearReq.onsuccess = ()=> payload.days.forEach(entry => days.put(entry));
    tx.oncomplete = ()=> resolve(true); tx.onerror = ()=> reject(tx.error);
  });
}

async function renderDashboard(app){
  setActiveNav("dashboard"); const cfg = await getConfig(); app.innerHTML = makeDashboardHTML(cfg);
  $("#dayNum").textContent = String(dayNumber(cfg, isoDate(new Date()))); $("#streak").textContent = String(await computeStreak());
  const renderer = new GridRenderer($("#gridCanvas"), $("#tooltip")); await renderer.load();
  const defaultView = cfg.defaultView || "month"; renderer.setMode("binary"); renderer.setView(defaultView); renderer.setAnchor(isoDate(new Date()));
  document.querySelectorAll("#viewSeg .chip").forEach(btn=> btn.classList.toggle("active", btn.dataset.view === defaultView));
  $("#modeSeg").addEventListener("click", (ev)=>{ const btn = ev.target.closest(".chip"); if(!btn) return; document.querySelectorAll("#modeSeg .chip").forEach(b=> b.classList.toggle("active", b === btn)); renderer.setMode(btn.dataset.mode); });
  $("#viewSeg").addEventListener("click", (ev)=>{ const btn = ev.target.closest(".chip"); if(!btn) return; document.querySelectorAll("#viewSeg .chip").forEach(b=> b.classList.toggle("active", b === btn)); renderer.setView(btn.dataset.view); });
  function shiftAnchor(dir){ const a = new Date(`${renderer.anchor}T00:00:00`); let next = a; if(renderer.view === "week") next = addDays(a, dir*7); else if(renderer.view === "month") next = new Date(a.getFullYear(), a.getMonth()+dir, 1); else if(renderer.view === "year") next = new Date(a.getFullYear()+dir, 0, 1); else next = new Date(a.getFullYear()+dir*10, 0, 1); renderer.setAnchor(isoDate(next)); }
  $("#prev").addEventListener("click", ()=> shiftAnchor(-1)); $("#next").addEventListener("click", ()=> shiftAnchor(1)); $("#today").addEventListener("click", ()=> renderer.setAnchor(isoDate(new Date())));
  const recent = await listRecentDays(14), recentEl = $("#recent");
  recentEl.innerHTML = !recent.length ? `<div class="muted">No logs yet. Start with <a href="#/log?date=${encodeURIComponent(isoDate(new Date()))}">today</a>.</div>` : recent.map(e=> `<a class="recent-item" href="#/log?date=${encodeURIComponent(e.date)}"><div class="mono">${escapeHtml(e.date)}</div><div class="muted small">${e.done}/${e.total} pillars${e.override ? ` • override: ${escapeHtml(e.override)}` : ""}</div>${(e.dayNote||"").trim() ? `<div class="quote">“${escapeHtml(e.dayNote)}”</div>` : ""}</a>`).join("");
  $("#copyToday").addEventListener("click", async ()=> copyClipboardExport(isoDate(new Date())));
  const imgPanel = $("#imgPanel"); let latestBlob = null; $("#toggleImg").addEventListener("click", ()=> imgPanel.classList.toggle("collapsed"));
  const pngImg = $("#pngImg");
  $("#genPng").addEventListener("click", async ()=>{ toast("success","Generating PNG…"); latestBlob = await renderer.exportPNG(); pngImg.src = URL.createObjectURL(latestBlob); toast("success","PNG ready ✅"); });
  $("#downloadPng").addEventListener("click", async ()=>{ if(!latestBlob){ toast("success","Generating PNG…"); latestBlob = await renderer.exportPNG(); pngImg.src = URL.createObjectURL(latestBlob); } const ok = await saveBlobMobileFriendly(latestBlob, "life-grid.png"); if(ok) toast("success","PNG file created ✅"); });
  let resizeTimer = null; window.addEventListener("resize", ()=>{ clearTimeout(resizeTimer); resizeTimer = setTimeout(()=> renderer.render(), 90); });
}

function renderLog(app, dateISO){
  setActiveNav("log");
  app.innerHTML = `<section class="card"><div class="control-row"><div><h1 id="logTitle">Log</h1><p class="muted mono" id="logSub">—</p></div><div class="segment"><button class="btn" id="btnToday" type="button">Today</button><button class="btn" id="btnYesterday" type="button">Yesterday</button></div></div><form class="form" id="logForm"><div class="grid2"><div class="field"><label>Date</label><input type="date" id="datePick"><div class="hint">Switching date navigates (it won’t auto-save).</div></div><div class="field"><label>Status override</label><select id="override" class="select-light"><option value="">Auto</option><option value="good">✅ Good (force green)</option><option value="medium">🟡 Medium (force yellow)</option><option value="bad">❌ Bad (force red)</option><option value="connection">🩷 Connection Day (force pink)</option></select><div class="hint">Auto uses your completion rate + overdue rules.</div></div></div><div class="pillars" id="pillars"></div><div class="field"><label>Day note (optional)</label><textarea id="dayNote" rows="3" placeholder="Reflection, lessons, wins, adjustments..."></textarea></div><div class="actions"><button class="btn primary" type="submit">Save and Return</button><button class="btn" id="copyExport" type="button">Copy to Clipboard</button><button class="btn" id="saveExportFile" type="button">Save Export File</button><button class="btn danger" id="returnWithoutSaving" type="button">Return Without Saving</button></div></form></section>`;
  const datePick = $("#datePick"), override = $("#override"), pillarsEl = $("#pillars"), dayNote = $("#dayNote");
  async function load(){
    const cfg = await getConfig(); const d = dateISO || isoDate(new Date()); datePick.value = d;
    $("#logTitle").textContent = `Log Day ${dayNumber(cfg, d)}`; $("#logSub").textContent = `${d} • ${new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {weekday:"long"})}`;
    const existing = await getDay(d); let tasks = existing?.tasks || null; override.value = existing?.override || ""; dayNote.value = existing?.dayNote || "";
    if(!tasks){ tasks = pillarsEffectiveForDate(cfg, d).map(p => ({ pillarId: p.id, key: p.key, name: p.name, target: p.target, done: true, note: "" })); }
    pillarsEl.innerHTML = tasks.map((t, idx)=> `<div class="pillar"><div class="pillar-top"><label class="check"><input type="checkbox" data-idx="${idx}" class="done" ${t.done ? "checked" : ""}><span class="checkmark"></span></label><div class="pillar-text"><div class="pillar-title"><span class="pillkey mono">${escapeHtml(t.key || "")}</span><span class="pillname">${escapeHtml(t.name || "")}</span></div><div class="muted small">${escapeHtml(t.target || "")}</div></div></div><div class="field"><input type="text" class="note" data-idx="${idx}" value="${escapeHtml(t.note || "")}" placeholder="Optional note (e.g., Push day, Business, etc.)"></div></div>`).join("");
    app.__tasks = tasks;
  }
  datePick.addEventListener("change", ()=> { if(datePick.value) window.location.hash = `#/log?date=${encodeURIComponent(datePick.value)}`; });
  $("#btnToday").addEventListener("click", ()=> window.location.hash = `#/log?date=${encodeURIComponent(isoDate(new Date()))}`);
  $("#btnYesterday").addEventListener("click", ()=> window.location.hash = `#/log?date=${encodeURIComponent(isoDate(addDays(new Date(), -1)))}`);
  $("#returnWithoutSaving").addEventListener("click", ()=> window.location.hash = "#/dashboard");
  $("#logForm").addEventListener("input", (ev)=>{ const done = ev.target.closest(".done"), note = ev.target.closest(".note"); if(done) app.__tasks[Number(done.dataset.idx)].done = done.checked; else if(note) app.__tasks[Number(note.dataset.idx)].note = note.value; });
  $("#logForm").addEventListener("submit", async (ev)=>{ ev.preventDefault(); const tasks = app.__tasks || []; const total = tasks.length, done = tasks.reduce((a,t)=> a + (t.done ? 1 : 0), 0); await upsertDay({ date: datePick.value, tasks, total, done, ratio: total ? (done/total) : 0, override: override.value || "", dayNote: dayNote.value.trim() }); toast("success","Saved ✅"); window.location.hash = "#/dashboard"; });
  $("#copyExport").addEventListener("click", async ()=>{ const cfg = await getConfig(); await copyTextToClipboard(buildClipboardTextFromState(cfg, datePick.value || isoDate(new Date()), app.__tasks || [], dayNote.value || "")); toast("success","Copied to Clipboard ✅"); });
  load();
}

function renderSettings(app){
  setActiveNav("settings");
  app.innerHTML = `<section class="card"><h1>Settings</h1><p class="muted">Customize pillars. New pillars apply from their effective date onward — old days keep original totals (e.g., 6/7).</p><form class="form" id="settingsForm"><div class="grid2"><div class="field"><label>Display name</label><input id="sName" type="text" placeholder="Optional"></div><div class="field"><label>Lifespan (years)</label><input id="sLife" type="number" min="50" max="120"></div></div><div class="grid2"><div class="field"><label>Default selected view</label><select id="sDefaultView" class="select-light"><option value="week">Week</option><option value="month">Month</option><option value="year">Year</option><option value="decade">Decade</option><option value="lifetime">Lifetime</option></select></div><div class="field"><label>Backup / Restore</label><div class="backup-box"><button class="btn" type="button" id="exportBackup">Export Backup</button><label class="btn" for="restoreBackup">Restore Backup</label><input class="hidden-input" type="file" id="restoreBackup" accept="application/json"></div></div></div><h2 style="margin-top:6px">Pillars</h2><p class="muted small">Drag to reorder. “Effective date” controls when a pillar starts counting toward totals.</p><div id="pillarsList" class="pillars"></div><div class="actions"><button class="btn" type="button" id="addPillar">Add pillar</button><button class="btn primary" type="submit">Save settings</button></div></form></section>`;
  const list = $("#pillarsList"); let cfgLocal = null;
  function renderList(){
    const pills = (cfgLocal.pillars||[]).slice().sort((a,b)=> (a.order||0)-(b.order||0));
    list.innerHTML = pills.map((p)=> `<div class="pillar draggable" draggable="true" data-id="${p.id}"><div class="pillar-row"><div class="drag-handle" aria-hidden="true"></div><div class="grow"><div class="grid3"><div class="field"><label>Key</label><input type="text" data-field="key" data-id="${p.id}" value="${escapeHtml(p.key||"")}"></div><div class="field"><label>Name</label><input type="text" data-field="name" data-id="${p.id}" value="${escapeHtml(p.name||"")}"></div><div class="field"><label>Target</label><input type="text" data-field="target" data-id="${p.id}" value="${escapeHtml(p.target||"")}"></div></div><div class="grid2" style="margin-top:10px"><div class="field"><label>Effective date</label><input type="date" data-field="effectiveDate" data-id="${p.id}" value="${escapeHtml(p.effectiveDate||cfgLocal.startDate||"")}"><div class="hint">Only dates on/after this count this pillar.</div></div><div class="field"><label>Remove</label><button class="btn danger" type="button" data-remove="${p.id}">Remove</button></div></div></div></div></div>`).join("");
    let dragId = null;
    list.querySelectorAll(".draggable").forEach(el=>{ el.addEventListener("dragstart", (ev)=>{ dragId = el.dataset.id; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", dragId); }); el.addEventListener("dragover", (ev)=>{ ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; }); el.addEventListener("drop", (ev)=>{ ev.preventDefault(); const targetId = el.dataset.id; if(!dragId || dragId === targetId) return; const pills = (cfgLocal.pillars||[]).slice().sort((a,b)=> (a.order||0)-(b.order||0)); const from = pills.findIndex(p=>p.id===dragId), to = pills.findIndex(p=>p.id===targetId); const [moved] = pills.splice(from,1); pills.splice(to,0,moved); pills.forEach((p,i)=> p.order=i+1); cfgLocal.pillars = pills; renderList(); dragId = null; }); });
  }
  list.addEventListener("input", (ev)=>{ const inp = ev.target.closest("input"); if(!inp) return; const p = cfgLocal.pillars.find(x=>x.id===inp.dataset.id); if(p) p[inp.dataset.field] = inp.value; });
  list.addEventListener("click", (ev)=>{ const rem = ev.target.closest("button")?.dataset.remove; if(rem){ cfgLocal.pillars = cfgLocal.pillars.filter(p=>p.id!==rem); cfgLocal.pillars.sort((a,b)=> (a.order||0)-(b.order||0)).forEach((p,i)=> p.order=i+1); renderList(); } });
  $("#addPillar").addEventListener("click", ()=>{ cfgLocal.pillars.push({ id: crypto.randomUUID(), key:"", name:"", target:"", effectiveDate: isoDate(new Date()), order: (cfgLocal.pillars?.length || 0) + 1 }); renderList(); });
  $("#exportBackup").addEventListener("click", async ()=>{ const ok = await saveBlobMobileFriendly(new Blob([JSON.stringify(await exportAllData(), null, 2)], { type: "application/json" }), "life-grid-backup.json"); if(ok) toast("success","Backup file created ✅"); });
  $("#restoreBackup").addEventListener("change", async (ev)=>{ const file = ev.target.files?.[0]; if(!file) return; try{ await restoreAllData(JSON.parse(await file.text())); toast("success","Backup restored ✅"); window.location.reload(); } catch { toast("error","Backup restore failed."); } });
  $("#settingsForm").addEventListener("submit", async (ev)=>{ ev.preventDefault(); cfgLocal.displayName = $("#sName").value.trim(); cfgLocal.lifespanYears = Number($("#sLife").value || 85); cfgLocal.defaultView = $("#sDefaultView").value || "month"; await setConfig(cfgLocal); toast("success","Settings saved ✅"); });
  (async ()=>{ cfgLocal = JSON.parse(JSON.stringify(await getConfig())); $("#sName").value = cfgLocal.displayName || ""; $("#sLife").value = cfgLocal.lifespanYears || 85; $("#sDefaultView").value = cfgLocal.defaultView || "month"; renderList(); })();
}

async function render(){
  const app = $("#app"); const cfg = await ensureConfig();
  if(!cfg.birthDate || !cfg.startDate) return renderSetup(app, cfg);
  const r = route();
  if(r.path === "#/dashboard") await renderDashboard(app);
  else if(r.path === "#/log") renderLog(app, r.q.get("date") || isoDate(new Date()));
  else if(r.path === "#/settings") renderSettings(app);
  else window.location.hash = "#/dashboard";
}

let __lastBackPress = 0;
function showBackExitToast(){
  const existing = document.querySelector("#back-exit-toast");
  if(existing) existing.remove();
  const el = document.createElement("div");
  el.id = "back-exit-toast";
  el.className = "back-exit-toast";
  el.textContent = "Tap the back button again to exit";
  document.body.appendChild(el);
  requestAnimationFrame(()=> el.classList.add("show"));
  setTimeout(()=>{ el.classList.remove("show"); setTimeout(()=> el.remove(), 220); }, 1600);
}

async function installAndroidBackGuard(){
  if(window.__lifeGridBackGuardInstalled) return;
  window.__lifeGridBackGuardInstalled = true;

  const plugins = getCapacitorPlugins();
  if(!plugins || !plugins.App) return;

  await plugins.App.addListener("backButton", () => {
    const hash = window.location.hash || "#/dashboard";
    const onDashboard = hash.startsWith("#/dashboard");

    if(!onDashboard){
      window.location.hash = "#/dashboard";
      return;
    }

    const now = Date.now();
    if((now - __lastBackPress) > 1800){
      __lastBackPress = now;
      showBackExitToast();
      return;
    }

    plugins.App.exitApp();
  });
}

async function boot(){
  try{
    await render();
  }catch(err){
    console.error(err);
    const app = document.querySelector("#app");
    if(app){
      app.innerHTML = `
        <section class="card">
          <h1>App failed to load</h1>
          <p class="muted">A runtime error occurred during startup.</p>
          <pre style="white-space:pre-wrap; word-break:break-word; color:#fff; background:rgba(255,255,255,.04); padding:12px; border-radius:12px; border:1px solid rgba(255,255,255,.08);">${String(err && (err.stack || err.message || err))}</pre>
        </section>
      `;
    }
  }
}

window.addEventListener("hashchange", boot);
window.addEventListener("DOMContentLoaded", async ()=>{ await installAndroidBackGuard(); boot(); });
