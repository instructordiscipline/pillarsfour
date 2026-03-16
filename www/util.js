export const COLORS = {
  good: "#22c55e",
  medium: "#eab308",
  bad: "#ef4444",
  connection: "#ec4899",
  empty: "#ffffff",
  blank: "rgba(255,255,255,.03)",
  blankBorder: "rgba(255,255,255,.05)"
};

export function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
export function lerp(a,b,t){ return a + (b-a)*t; }
export function lerpColor(c1,c2,t){
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}
export function rgbToHex([r,g,b]){
  const to = (v)=> v.toString(16).padStart(2,"0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
export function gradientRYG(ratio){
  ratio = clamp(ratio, 0, 1);
  const red = [239,68,68], yellow=[234,179,8], green=[34,197,94];
  if(ratio <= 0.5) return rgbToHex(lerpColor(red, yellow, ratio/0.5));
  return rgbToHex(lerpColor(yellow, green, (ratio-0.5)/0.5));
}

export function isoDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
export function parseISO(s){
  return new Date(`${s}T00:00:00`);
}
export function startOfDay(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}
export function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate()+n);
  return x;
}
export function diffDays(a, b){
  return Math.floor((startOfDay(a) - startOfDay(b)) / (24*3600*1000));
}
export function addYearsISO(iso, years){
  const d = parseISO(iso);
  const y = d.getFullYear()+years;
  const m = d.getMonth();
  const day = d.getDate();
  const out = new Date(d);
  out.setFullYear(y, m, day);
  if (out.getMonth() !== m) out.setDate(0);
  return isoDate(out);
}
export function weekdaySun0(d){
  return d.getDay();
}
export function startSundayOfYear(year){
  const jan1 = new Date(`${year}-01-01T00:00:00`);
  const dow = jan1.getDay();
  const start = new Date(jan1);
  start.setDate(jan1.getDate() - dow);
  start.setHours(0,0,0,0);
  return start;
}

export function chooseYearGrid(nYears, targetRatio=2.0){
  let best = null;
  for(let cols=1; cols<=nYears; cols++){
    const rows = Math.ceil(nYears/cols);
    const ratio = (rows*54)/(cols*7);
    let score = Math.abs(ratio-targetRatio) + (ratio < targetRatio ? 0.02 : 0);
    if(!best || score < best.score){
      best = {score, cols, rows};
    }
  }
  return {cols: best.cols, rows: best.rows};
}

export function friendlyWeekday(iso){
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

export function statusLabel(status){
  if(status === "connection") return "Connection Day";
  if(status === "good") return "Good";
  if(status === "medium") return "Medium";
  if(status === "bad") return "Bad";
  return "Empty";
}
