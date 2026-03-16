import { COLORS, gradientRYG, parseISO, isoDate, addDays, startSundayOfYear, chooseYearGrid, clamp, friendlyWeekday, statusLabel } from "./util.js";
import { lifeRange, allDaysInRange, getConfig, computeOverdue, statusForEntry, pillarsEffectiveForDate } from "./db.js";

const WEEKS_PER_YEAR = 54;

function cellColor(entry, mode){
  if(!entry) return COLORS.empty;
  const {status, ratio} = statusForEntry(entry, mode);
  if(status === "connection") return COLORS.connection;
  if(mode === "gradient"){
    if(entry.override === "good") return COLORS.good;
    if(entry.override === "medium") return COLORS.medium;
    if(entry.override === "bad") return COLORS.bad;
    return gradientRYG(ratio);
  }
  if(status === "good") return COLORS.good;
  if(status === "medium") return COLORS.medium;
  if(status === "bad") return COLORS.bad;
  return COLORS.empty;
}

function formatPct(r){ return `${Math.round(r*100)}%`; }

export class GridRenderer {
  constructor(canvas, tooltip){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.tooltip = tooltip;
    this.tTitle = tooltip.querySelector("#tt-title");
    this.tBody = tooltip.querySelector("#tt-body");
    this.hit = [];
    this.mode = "binary";
    this.view = "month";
    this.anchor = isoDate(new Date());
    this.entries = {};
    this.cfg = null;
    this.range = null;
    this.dpr = window.devicePixelRatio || 1;
    this._lastTap = null;
    this._bind();
  }

  async load(){
    this.cfg = await getConfig();
    this.range = lifeRange(this.cfg);
    this.entries = await allDaysInRange(this.range.start, this.range.end);
    for(let d = parseISO(this.range.start); isoDate(d) <= this.range.end; d = addDays(d, 1)){
      const k = isoDate(d);
      if(!this.entries[k] && computeOverdue(k)){
        const total = pillarsEffectiveForDate(this.cfg, k).length;
        this.entries[k] = { date:k, tasks:[], done:0, total, override:"bad", dayNote:"", ratio:0 };
      }
    }
    this.render();
  }

  setMode(mode){ this.mode = mode; this.render(); }
  setView(view){ this.view = view; this.render(); }
  setAnchor(iso){ this.anchor = iso; this.render(); }

  _bind(){
    const move = (ev) => {
      const pt = this._eventPoint(ev);
      if(!pt) return;
      const hit = this._hitTest(pt.x, pt.y);
      if(hit){
        this._showTip(hit.dateISO, pt.clientX, pt.clientY);
      }else{
        this._hideTip();
      }
    };
    const leave = () => this._hideTip();
    const click = (ev) => {
      const pt = this._eventPoint(ev);
      if(!pt) return;
      const hit = this._hitTest(pt.x, pt.y);
      if(hit && hit.dateISO){
        if(hit.disabled) return;
        const now = Date.now();
        if(this._lastTap && this._lastTap.date === hit.dateISO && (now - this._lastTap.t) < 600){
          window.location.hash = `#/log?date=${encodeURIComponent(hit.dateISO)}`;
        }else{
          this._lastTap = {date: hit.dateISO, t: now};
          this._showTip(hit.dateISO, pt.clientX, pt.clientY);
        }
      }else{
        this._hideTip();
      }
    };

    this.canvas.addEventListener("mousemove", move);
    this.canvas.addEventListener("mouseleave", leave);
    this.canvas.addEventListener("click", click);

    this.canvas.addEventListener("touchstart", (ev)=>{
      click(ev);
      ev.preventDefault();
    }, {passive:false});
  }

  _eventPoint(ev){
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;
    if(ev.touches && ev.touches.length){
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    }else{
      clientX = ev.clientX;
      clientY = ev.clientY;
    }
    const x = (clientX - rect.left);
    const y = (clientY - rect.top);
    return {x, y, clientX, clientY};
  }

  _hitTest(x, y){
    for(let i=this.hit.length-1; i>=0; i--){
      const h = this.hit[i];
      if(x >= h.x && x <= h.x+h.w && y >= h.y && y <= h.y+h.h){
        return h;
      }
    }
    return null;
  }

  _isPreStart(dateISO){
    return dateISO < this.range.start;
  }

  _showTip(dateISO, clientX, clientY){
    const entry = this.entries[dateISO] || null;
    const total = entry ? (entry.total||0) : pillarsEffectiveForDate(this.cfg, dateISO).length;
    const done = entry ? (entry.done||0) : 0;

    let title = `${dateISO} • ${friendlyWeekday(dateISO)}`;
    let body = "";
    if(this._isPreStart(dateISO)){
      body = `
        <div><span class="pill">Before tracking began</span></div>
        <div class="muted small" style="margin-top:8px">Your first log date is <span class="mono">${this.range.start}</span>.</div>
      `;
    } else {
      const {status, ratio} = entry ? statusForEntry(entry, this.mode) : {status:"empty", ratio:0};
      const pillClass = (status === "connection") ? "connection" : status;
      const label = statusLabel(status);
      const ruleLine = (this.mode === "gradient")
        ? `Completion: <span class="mono">${formatPct(ratio)}</span>`
        : `Rule: 100% = green, ≥75% = yellow, <75% = red`;
      body = `
        <div><span class="pill ${pillClass}">${label}</span> <span class="mono" style="margin-left:8px">${done}/${total}</span></div>
        <div class="muted small" style="margin-top:6px">${ruleLine}</div>
        <div class="muted small" style="margin-top:8px">Tap twice to open log</div>
      `;
    }

    this.tTitle.textContent = title;
    this.tBody.innerHTML = body;

    const padding = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = clientX + 14;
    let y = clientY + 14;
    x = clamp(x, padding, vw - 350);
    y = clamp(y, padding, vh - 180);

    this.tooltip.style.transform = `translate(${x}px, ${y}px)`;
    this.tooltip.setAttribute("aria-hidden","false");
  }

  _hideTip(){
    this.tooltip.setAttribute("aria-hidden","true");
    this.tooltip.style.transform = "translate(-9999px,-9999px)";
  }

  _resizeToHeight(heightCss){
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const wCss = Math.max(320, rect.width);
    const hCss = heightCss;
    this.canvas.style.height = `${hCss}px`;
    this.canvas.width = Math.floor(wCss * this.dpr);
    this.canvas.height = Math.floor(hCss * this.dpr);
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    return {wCss, hCss};
  }

  _drawCell(x, y, size, dateISO, color, disabled=false){
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, size, size);
    if(size >= 5){
      this.ctx.strokeStyle = disabled ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.10)";
      this.ctx.strokeRect(x+0.5, y+0.5, size-1, size-1);
    }
    this.hit.push({x, y, w:size, h:size, dateISO, disabled});
  }

  render(){
    if(!this.cfg || !this.range) return;

    const containerWidth = this.canvas.parentElement.getBoundingClientRect().width;
    const viewportH = Math.max(500, window.innerHeight - 230);
    const pad = 16;
    const gap = (this.view === "lifetime") ? 1 : 2;
    const sep = (this.view === "lifetime") ? 4 : 10;

    const drawText = (txt, x, y, alpha=0.55, size=12) => {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace`;
      this.ctx.fillText(txt, x, y);
      this.ctx.restore();
    };

    this.hit = [];

    if(this.view === "week"){
      const anchor = parseISO(this.anchor);
      const start = addDays(anchor, -anchor.getDay());
      const cell = Math.floor((containerWidth - pad*2 - gap*6)/7);
      const h = pad*2 + cell + 34;
      const {wCss, hCss} = this._resizeToHeight(h);
      this.ctx.clearRect(0,0,wCss,hCss);
      drawText("Week", pad, pad+14, 0.7, 12);
      const labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      labels.forEach((l,i)=> drawText(l, pad + i*(cell+gap), pad+32, 0.45, 11));
      for(let i=0;i<7;i++){
        const d = addDays(start, i);
        const k = isoDate(d);
        const x = pad + i*(cell+gap);
        const y = pad + 40;
        if(this._isPreStart(k)){
          this._drawCell(x, y, cell, k, "rgba(255,255,255,.03)", true);
          continue;
        }
        const entry = this.entries[k] || null;
        this._drawCell(x, y, cell, k, cellColor(entry, this.mode), false);
      }
      return;
    }

    if(this.view === "month"){
      const anchor = parseISO(this.anchor);
      const y = anchor.getFullYear();
      const m = anchor.getMonth();
      const first = new Date(y, m, 1);
      const start = addDays(first, -first.getDay());
      const weeks = 6;
      const cell = Math.floor((containerWidth - pad*2 - gap*6)/7);
      const h = pad*2 + 28 + weeks*(cell+gap);
      const {wCss, hCss} = this._resizeToHeight(h);
      this.ctx.clearRect(0,0,wCss,hCss);

      drawText(`${anchor.toLocaleDateString(undefined,{month:"long"})} ${y}`, pad, pad+14, 0.75, 12);
      const labels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      labels.forEach((l,i)=> drawText(l, pad + i*(cell+gap), pad+32, 0.45, 11));
      for(let r=0;r<weeks;r++){
        for(let c=0;c<7;c++){
          const d = addDays(start, r*7+c);
          const k = isoDate(d);
          const x = pad + c*(cell+gap);
          const y0 = pad + 40 + r*(cell+gap);
          const inMonth = d.getMonth() === m;
          if(!inMonth){
            this.ctx.fillStyle = "rgba(255,255,255,.03)";
            this.ctx.fillRect(x,y0,cell,cell);
            continue;
          }
          if(this._isPreStart(k)){
            this._drawCell(x, y0, cell, k, "rgba(255,255,255,.03)", true);
            continue;
          }
          const entry = this.entries[k] || null;
          this._drawCell(x, y0, cell, k, cellColor(entry, this.mode), false);
        }
      }
      return;
    }

    if(this.view === "year"){
      const anchor = parseISO(this.anchor);
      const year = anchor.getFullYear();
      const startSun = startSundayOfYear(year);
      const availableHeight = viewportH - pad*2 - 28;
      const cellByWidth = Math.max(2, Math.floor((containerWidth - pad*2 - gap*6)/7));
      const cellByHeight = Math.max(2, Math.floor((availableHeight - gap*(WEEKS_PER_YEAR-1))/WEEKS_PER_YEAR));
      const cell = Math.min(cellByWidth, cellByHeight);
      const yearH = WEEKS_PER_YEAR*cell + (WEEKS_PER_YEAR-1)*gap;
      const h = pad*2 + 28 + yearH;
      const {wCss, hCss} = this._resizeToHeight(h);
      this.ctx.clearRect(0,0,wCss,hCss);
      drawText(`${year}`, pad, pad+14, 0.75, 12);
      for(let w=0; w<WEEKS_PER_YEAR; w++){
        for(let dow=0; dow<7; dow++){
          const d = addDays(startSun, w*7+dow);
          const k = isoDate(d);
          const x = pad + dow*(cell+gap);
          const y0 = pad + 28 + w*(cell+gap);
          const inYear = d.getFullYear() === year;
          if(!inYear){
            this.ctx.fillStyle = "rgba(255,255,255,.03)";
            this.ctx.fillRect(x,y0,cell,cell);
            continue;
          }
          if(this._isPreStart(k)){
            this._drawCell(x, y0, cell, k, "rgba(255,255,255,.03)", true);
            continue;
          }
          const entry = this.entries[k] || null;
          this._drawCell(x, y0, cell, k, cellColor(entry, this.mode), false);
        }
      }
      return;
    }

    const anchor = parseISO(this.anchor);
    const anchorYear = anchor.getFullYear();
    const startYear = parseISO(this.range.start).getFullYear();
    const currentYear = new Date().getFullYear();
    const years = [];
    if(this.view === "decade"){
      if((currentYear - startYear) < 10 && anchorYear >= startYear && anchorYear <= startYear + 9){
        for(let y=startYear; y<startYear+10; y++) years.push(y);
      } else {
        const decadeStart = anchorYear - (anchorYear % 10);
        for(let y=decadeStart; y<decadeStart+10; y++) years.push(y);
      }
    }else{
      const endY = parseISO(this.range.end).getFullYear();
      for(let y=startYear; y<=endY; y++) years.push(y);
    }

    const grid = chooseYearGrid(years.length, 2.0);
    const cols = (this.view === "decade") ? Math.min(5, grid.cols) : grid.cols;
    const rows = Math.ceil(years.length / cols);
    const availableW = containerWidth - pad*2 - (cols-1)*sep;
    const yearW = Math.floor(availableW / cols);
    const cell = Math.max(2, Math.floor((yearW - gap*6)/7));
    const blockW = 7*cell + (7-1)*gap;
    const blockH = WEEKS_PER_YEAR*cell + (WEEKS_PER_YEAR-1)*gap;
    const totalH = pad*2 + 22 + rows*blockH + (rows-1)*sep;
    const {wCss, hCss} = this._resizeToHeight(totalH);
    this.ctx.clearRect(0,0,wCss,hCss);
    drawText(this.view === "decade" ? `Decade` : `Lifetime`, pad, pad+14, 0.75, 12);

    years.forEach((year, idx)=>{
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const ox = pad + gx*(blockW + sep);
      const oy = pad + 22 + gy*(blockH + sep);
      drawText(String(year), ox, oy - 6, 0.55, 11);
      const startSun = startSundayOfYear(year);
      for(let w=0; w<WEEKS_PER_YEAR; w++){
        for(let dow=0; dow<7; dow++){
          const d = addDays(startSun, w*7+dow);
          const k = isoDate(d);
          const x = ox + dow*(cell+gap);
          const y0 = oy + w*(cell+gap);
          const inYear = d.getFullYear() === year;
          if(!inYear || k < this.range.start || k > this.range.end){
            this.ctx.fillStyle = "rgba(255,255,255,.03)";
            this.ctx.fillRect(x,y0,cell,cell);
            continue;
          }
          const entry = this.entries[k] || null;
          const color = cellColor(entry, this.mode);
          this.ctx.fillStyle = color;
          this.ctx.fillRect(x,y0,cell,cell);
          if(cell >= 5){
            this.ctx.strokeStyle = "rgba(255,255,255,.08)";
            this.ctx.strokeRect(x+0.5,y0+0.5,cell-1,cell-1);
          }
          this.hit.push({x,y:y0,w:cell,h:cell,dateISO:k,disabled:false});
        }
      }
    });
  }

async exportPNG(){
  const exportView = this.view;
  const prevMode = this.mode;

  const pad = 18;
  const gap = (exportView === "lifetime") ? 1 : 2;
  const sep = (exportView === "lifetime") ? 4 : 10;

  let width = 1200;
  let height = 1600;
  if (exportView === "week") {
    width = 1400; height = 320;
  } else if (exportView === "month") {
    width = 1400; height = 1200;
  } else if (exportView === "year") {
    width = 600; height = 1800;
  } else if (exportView === "decade") {
    width = 1400; height = 1800;
  }

  const off = document.createElement("canvas");
  const dpr = 2;
  off.width = width * dpr;
  off.height = height * dpr;
  const ctx = off.getContext("2d");
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0,0,width,height);

  const drawText = (txt, x, y, alpha=0.65, size=12) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace`;
    ctx.fillText(txt, x, y);
    ctx.restore();
  };

  const drawCell = (x, y, size, dateISO) => {
    if (dateISO < this.range.start || dateISO > this.range.end) {
      ctx.fillStyle = "rgba(255,255,255,.05)";
    } else {
      const entry = this.entries[dateISO] || null;
      ctx.fillStyle = cellColor(entry, prevMode);
    }
    ctx.fillRect(x, y, size, size);
  };

  if (exportView === "week") {
    const anchor = parseISO(this.anchor);
    const start = addDays(anchor, -anchor.getDay());
    const cell = Math.floor((width - pad*2 - gap*6)/7);
    drawText("Week", pad, pad+14, 0.75, 12);
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((l,i)=> drawText(l, pad + i*(cell+gap), pad+32, 0.45, 11));
    for(let i=0;i<7;i++){
      const d = addDays(start, i);
      drawCell(pad + i*(cell+gap), pad + 40, cell, isoDate(d));
    }
  } else if (exportView === "month") {
    const anchor = parseISO(this.anchor);
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const first = new Date(y, m, 1);
    const start = addDays(first, -first.getDay());
    const cell = Math.floor((width - pad*2 - gap*6)/7);
    drawText(`${anchor.toLocaleDateString(undefined,{month:"long"})} ${y}`, pad, pad+14, 0.75, 12);
    ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((l,i)=> drawText(l, pad + i*(cell+gap), pad+32, 0.45, 11));
    for(let r=0;r<6;r++){
      for(let c=0;c<7;c++){
        const d = addDays(start, r*7+c);
        const k = isoDate(d);
        if (d.getMonth() !== m) {
          ctx.fillStyle = "rgba(255,255,255,.05)";
          ctx.fillRect(pad + c*(cell+gap), pad + 40 + r*(cell+gap), cell, cell);
        } else {
          drawCell(pad + c*(cell+gap), pad + 40 + r*(cell+gap), cell, k);
        }
      }
    }
  } else if (exportView === "year") {
    const anchor = parseISO(this.anchor);
    const year = anchor.getFullYear();
    const startSun = startSundayOfYear(year);
    const cell = Math.max(2, Math.floor((height - pad*2 - 28 - gap*(WEEKS_PER_YEAR-1))/WEEKS_PER_YEAR));
    drawText(`${year}`, pad, pad+14, 0.75, 12);
    for(let w=0; w<WEEKS_PER_YEAR; w++){
      for(let dow=0; dow<7; dow++){
        const d = addDays(startSun, w*7+dow);
        const k = isoDate(d);
        const x = pad + dow*(cell+gap);
        const y0 = pad + 28 + w*(cell+gap);
        if (d.getFullYear() !== year) {
          ctx.fillStyle = "rgba(255,255,255,.05)";
          ctx.fillRect(x,y0,cell,cell);
        } else {
          drawCell(x, y0, cell, k);
        }
      }
    }
  } else {
    let years = [];
    const anchor = parseISO(this.anchor);
    const anchorYear = anchor.getFullYear();
    const startYear = parseISO(this.range.start).getFullYear();
    const currentYear = new Date().getFullYear();
    if (exportView === "decade") {
      if((currentYear - startYear) < 10 && anchorYear >= startYear && anchorYear <= startYear + 9){
        for(let y=startYear; y<startYear+10; y++) years.push(y);
      } else {
        const decadeStart = anchorYear - (anchorYear % 10);
        for(let y=decadeStart; y<decadeStart+10; y++) years.push(y);
      }
    } else {
      const endY = parseISO(this.range.end).getFullYear();
      for(let y=startYear; y<=endY; y++) years.push(y);
    }

    const grid = chooseYearGrid(years.length, 2.0);
    const cols = (exportView === "decade") ? Math.min(5, grid.cols) : grid.cols;
    const rows = Math.ceil(years.length / cols);
    const availableW = width - pad*2 - (cols-1)*sep;
    const yearW = Math.floor(availableW / cols);
    const cell = Math.max(2, Math.floor((yearW - gap*6)/7));
    const blockW = 7*cell + (7-1)*gap;
    const blockH = WEEKS_PER_YEAR*cell + (WEEKS_PER_YEAR-1)*gap;

    drawText(exportView === "decade" ? "Decade" : "Lifetime", pad, pad+14, 0.75, 12);
    years.forEach((year, idx)=>{
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      const ox = pad + gx*(blockW + sep);
      const oy = pad + 28 + gy*(blockH + sep);
      drawText(String(year), ox, oy - 6, 0.55, 11);
      const startSun = startSundayOfYear(year);
      for(let w=0; w<WEEKS_PER_YEAR; w++){
        for(let dow=0; dow<7; dow++){
          const d = addDays(startSun, w*7+dow);
          const k = isoDate(d);
          const x = ox + dow*(cell+gap);
          const y0 = oy + w*(cell+gap);
          if (d.getFullYear() !== year) {
            ctx.fillStyle = "rgba(255,255,255,.05)";
            ctx.fillRect(x,y0,cell,cell);
          } else {
            drawCell(x, y0, cell, k);
          }
        }
      }
    });
  }

  return await new Promise(res => off.toBlob(res, "image/png"));
}

}