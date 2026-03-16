import { isoDate, startOfDay, diffDays, addYearsISO } from "./util.js";

const DB_NAME = "pillars-life-grid";
const DB_VERSION = 1;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains("meta")){
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if(!db.objectStoreNames.contains("days")){
        db.createObjectStore("days", { keyPath: "date" });
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}

export async function getMeta(key){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const store = db.transaction("meta","readonly").objectStore("meta");
    const req = store.get(key);
    req.onsuccess = ()=> resolve(req.result ? req.result.value : null);
    req.onerror = ()=> reject(req.error);
  });
}

export async function setMeta(key, value){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const store = db.transaction("meta","readwrite").objectStore("meta");
    const req = store.put({key, value});
    req.onsuccess = ()=> resolve(true);
    req.onerror = ()=> reject(req.error);
  });
}

export async function getConfig(){
  return await getMeta("config");
}

export async function setConfig(cfg){
  cfg.lastUpdated = new Date().toISOString();
  if(!cfg.defaultView) cfg.defaultView = "month";
  await setMeta("config", cfg);
}

export async function ensureConfig(){
  let cfg = await getConfig();
  if(cfg){
    if(!cfg.defaultView){
      cfg.defaultView = "month";
      await setConfig(cfg);
    }
    return cfg;
  }
  cfg = {
    birthDate: "",
    displayName: "",
    startDate: "",
    lifespanYears: 85,
    defaultView: "month",
    pillars: [
      { id: crypto.randomUUID(), key: "P",  name: "Purify",       target: "No junk food, sugar, artificial sweeteners, solo entertainment, or cheap dopamine", effectiveDate: "", order: 1 },
      { id: crypto.randomUUID(), key: "I",  name: "Inner peace",  target: "10 min meditation", effectiveDate: "", order: 2 },
      { id: crypto.randomUUID(), key: "L1", name: "Learn",        target: "10 min spiritual reading", effectiveDate: "", order: 3 },
      { id: crypto.randomUUID(), key: "L2", name: "Labor",        target: "3+ hours focused work", effectiveDate: "", order: 4 },
      { id: crypto.randomUUID(), key: "A",  name: "Activity",     target: "40 min workout", effectiveDate: "", order: 5 },
      { id: crypto.randomUUID(), key: "R",  name: "Reinvigorate", target: "Cold shower", effectiveDate: "", order: 6 },
      { id: crypto.randomUUID(), key: "S",  name: "Sustain",      target: "Half gallon water + calories match cut/bulk goals", effectiveDate: "", order: 7 },
    ]
  };
  await setConfig(cfg);
  return cfg;
}

export function lifeRange(cfg){
  const start = cfg.startDate;
  const end = addYearsISO(cfg.birthDate, Number(cfg.lifespanYears || 85));
  return {start, end};
}

export function pillarsEffectiveForDate(cfg, dateISO){
  const start = cfg.startDate || dateISO;
  const pills = (cfg.pillars || []).map(p => ({...p, effectiveDate: p.effectiveDate || start}));
  return pills
    .filter(p => (p.effectiveDate <= dateISO))
    .sort((a,b)=> (a.order||0) - (b.order||0));
}

export async function getDay(dateISO){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const store = db.transaction("days","readonly").objectStore("days");
    const req = store.get(dateISO);
    req.onsuccess = ()=> resolve(req.result || null);
    req.onerror = ()=> reject(req.error);
  });
}

export async function upsertDay(entry){
  const db = await openDB();
  entry.updatedAt = new Date().toISOString();
  if(!entry.createdAt) entry.createdAt = entry.updatedAt;
  return new Promise((resolve, reject)=>{
    const store = db.transaction("days","readwrite").objectStore("days");
    const req = store.put(entry);
    req.onsuccess = ()=> resolve(true);
    req.onerror = ()=> reject(req.error);
  });
}

export async function listRecentDays(limit=14){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const store = db.transaction("days","readonly").objectStore("days");
    const req = store.getAll();
    req.onsuccess = ()=> {
      const all = req.result || [];
      all.sort((a,b)=> b.date.localeCompare(a.date));
      resolve(all.slice(0, limit));
    };
    req.onerror = ()=> reject(req.error);
  });
}

export async function allDaysInRange(startISO, endISO){
  const db = await openDB();
  return new Promise((resolve, reject)=>{
    const store = db.transaction("days","readonly").objectStore("days");
    const req = store.getAll();
    req.onsuccess = ()=> {
      const all = req.result || [];
      const out = {};
      for(const e of all){
        if(e.date >= startISO && e.date <= endISO){
          out[e.date] = e;
        }
      }
      resolve(out);
    };
    req.onerror = ()=> reject(req.error);
  });
}

export function dayNumber(cfg, dateISO){
  const start = new Date(`${cfg.startDate}T00:00:00`);
  const d = new Date(`${dateISO}T00:00:00`);
  const n = diffDays(d, start) + 1;
  return n;
}

export function computeOverdue(dateISO){
  const today = startOfDay(new Date());
  const d = startOfDay(new Date(`${dateISO}T00:00:00`));
  return diffDays(today, d) >= 2;
}

export function statusForEntry(entry, mode="binary"){
  if(!entry) return {status:"empty", ratio:0};
  const override = entry.override || "";
  if(override === "connection") return {status:"connection", ratio:1};
  if(override === "good") return {status:"good", ratio:1};
  if(override === "medium") return {status:"medium", ratio:Math.max(entry.ratio ?? 0, 0.75)};
  if(override === "bad") return {status:"bad", ratio:0};

  const ratio = (entry.total || 0) ? (entry.done/entry.total) : 0;
  if(ratio >= 0.999) return {status:"good", ratio};
  if(ratio >= 0.75) return {status:"medium", ratio};
  return {status:"bad", ratio};
}
