/* ─── Remote Monitoring (admin-only) ─────────────────────────────────────────────────────────
   Live view of a plant's Central Supervision System (CSS). A Raspberry Pi at the plant reads the
   CSS every 60 s and posts to Supabase (css_ingest); this tab reads css_latest, css_trend_points
   (latest 24 h) and css_alarm_state. Six pages mirror the CSS screens: Plant status, Synoptic,
   Details 1, Details 2, Trends, Alarm history. Design agreed with the operator 2026-09-23.
   Every status box mirrors the CSS's own bit; nothing is recomputed from thresholds here. */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

const ICON = {
  compressor: "/css-icons/compressor.svg",
  dryer: "/css-icons/dryer.svg",
  generator: "/css-icons/oxyswing.svg",
  medgasflow: "/css-icons/medgas.svg",
  oxycheck: "/css-icons/oxycheck.svg",
  hpox: "/css-icons/hpox.svg",
};
const FONT_HREF = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap";   // DM Sans is already loaded by the site
const POLL_MS = 60000;          // latest reading + alarms
const TREND_POLL_MS = 300000;   // trend rows
const STALE_MS = 3 * 60000;     // warn when the newest reading is older than this

const CSS = `
.ox{--ink:#1a1d21;--muted:#5c6b76;--faint:#8a9199;--line:#e8ecf0;--panel:#fff;--panel-2:#f7fafb;--bg:transparent;
 --teal:#0d9488;--teal-dark:#0f766e;--teal-deep:#0b3b38;--teal-light:#ccfbf1;--teal-bg:#f0fdfa;--pipe:#0d9488;
 --ok:#276749;--ok-bg:#c6f6d5;--warn:#7c5e10;--warn-bg:#fef3c7;--alarm:#9b2c2c;--alarm-bg:#fed7d7;--off:#6b7280;--off-bg:#edf0f2;--info:#1a5276;--info-bg:#d6eaf8;
 --series-1:#0f766e;--series-2:#eb6834;
 --display:'DM Sans',system-ui,sans-serif;--body:'DM Sans',system-ui,sans-serif;--mono:'DM Mono',ui-monospace,monospace;
 color:var(--ink);font-family:var(--body);font-size:14px;line-height:1.45}
.ox *{box-sizing:border-box}
.ox .top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;margin-bottom:16px}
.ox .brand{font-size:22px;font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.ox .meta{margin-left:auto;display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;font-size:12px;color:var(--muted)}
.ox .meta>span{display:inline-flex;align-items:center;gap:6px;background:var(--teal-bg);border:1.5px solid var(--teal-light);border-radius:20px;padding:5px 12px;font-weight:600;color:var(--teal-dark)}
.ox .meta b{color:var(--ink);font-weight:600;font-family:var(--mono);font-size:12px}
.ox select.site{font-family:var(--body);font-weight:600;font-size:13px;padding:8px 14px;border:1.5px solid var(--teal-light);border-radius:10px;background:#fff;color:var(--ink)}
.ox .dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:-1px;margin-right:6px;background:#c3ccd2}
.ox .dot.on{background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.18)}
.ox .dot.off{background:#dc2626;box-shadow:0 0 0 3px rgba(220,38,38,.16)}
.ox .warnbar{background:#fff5f5;color:#9b2c2c;border:1.5px solid #fed7d7;border-radius:12px;padding:10px 16px;margin-bottom:14px;font-size:13px;font-weight:500}
.ox .infobar{background:var(--teal-bg);color:var(--teal-dark);border:1.5px solid var(--teal-light);border-radius:12px;padding:10px 16px;margin-bottom:14px;font-size:13px;font-weight:500}
.ox .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.ox .tab{font-family:var(--body);font-weight:700;font-size:13px;letter-spacing:.2px;padding:8px 16px;border:1.5px solid var(--teal-light);border-radius:20px;background:#fff;color:var(--teal-dark);cursor:pointer;transition:all .2s}
.ox .tab:hover{background:var(--teal-bg)}
.ox .tab:focus-visible{outline:2px solid var(--teal);outline-offset:2px}
.ox .tab.active{background:linear-gradient(135deg,#0d9488,#0f766e);color:#fff;border-color:transparent;box-shadow:0 4px 12px rgba(13,148,136,.3)}
.ox .unit{background:#fff;border:1px solid var(--line);border-radius:16px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,25,.05)}
.ox .unit-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:12px 18px;background:linear-gradient(135deg,#0b3b38,#0f766e);color:#fff}
.ox .unit-head h2{margin:0;font-size:16px;font-weight:800;letter-spacing:-.01em;color:#fff}
.ox .unit-head .link{color:rgba(255,255,255,.85)}
.ox .link{color:var(--muted);font-size:12.5px;font-weight:600}
.ox .row{display:grid;grid-template-columns:1fr 1fr 1fr}
.ox .tile{padding:20px 16px 22px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:10px}
.ox .tile:last-child{border-right:0}
.ox .icon{height:150px;display:flex;align-items:center;justify-content:center}
.ox .icon img{height:150px;width:auto;max-width:100%;filter:drop-shadow(0 10px 18px rgba(15,23,25,.14))}
.ox .name{font-size:14.5px;font-weight:700;text-align:center;letter-spacing:-.01em;color:var(--ink)}
.ox .box{display:inline-block;font-family:var(--body);font-weight:800;font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;text-align:center;border-radius:8px;white-space:nowrap;padding:5px 12px}
.ox .box.ok{color:var(--ok);background:var(--ok-bg)}
.ox .box.warn{color:var(--warn);background:var(--warn-bg)}
.ox .box.alarm{color:var(--alarm);background:var(--alarm-bg)}
.ox .box.off{color:var(--off);background:var(--off-bg)}
.ox .box.info{color:var(--info);background:var(--info-bg)}
.ox .box.status{font-size:12.5px;padding:7px 26px;min-width:120px}
.ox .box.phase{font-size:12.5px;padding:8px 18px;min-width:220px}
.ox .box.state{font-size:11px;padding:4px 14px;min-width:150px}
.ox .stack{display:flex;flex-direction:column;align-items:center;gap:6px}
.ox .kv{display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:13px;align-items:baseline;margin:0}
.ox .kv dt{color:var(--muted);font-weight:500}
.ox .kv dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:16px;font-weight:500;text-align:right;color:var(--ink)}
.ox .u{color:var(--faint);font-family:var(--body);font-size:11.5px;font-weight:600;margin-left:4px}
.ox .tile.stale{opacity:.6}
@media (max-width:760px){.ox .row{grid-template-columns:1fr 1fr}.ox .tile.gen{grid-column:1/-1;border-top:1px solid var(--line);border-right:0}.ox .tile:nth-child(2){border-right:0}}
@media (max-width:460px){.ox .row{grid-template-columns:1fr}.ox .tile{border-right:0;border-top:1px solid var(--line)}.ox .tile:first-child{border-top:0}.ox .icon,.ox .icon img{height:120px}}
.ox .syn-wrap{background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px;overflow-x:auto;box-shadow:0 1px 3px rgba(15,23,25,.05)}
.ox .syn{position:relative;width:100%;max-width:960px;aspect-ratio:4/3;margin:0 auto;min-width:560px;container-type:inline-size}
.ox .syn svg.pipes{position:absolute;inset:0;width:100%;height:100%}
.ox .syn svg.pipes path{fill:none;stroke:var(--pipe);stroke-width:2;stroke-linejoin:round;opacity:.75}
.ox .syn .el{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center}
.ox .syn .el img,.ox .syn .el svg.ph{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 8px 14px rgba(15,23,25,.14))}
.ox .syn .dot.abs{position:absolute;transform:translate(-50%,-50%);margin:0}
.ox .syn .val{position:absolute;transform:translate(-50%,-50%);font-family:var(--mono);font-variant-numeric:tabular-nums;font-weight:500;font-size:clamp(11px,1.7cqw,16px);color:var(--ink);white-space:nowrap}
.ox .syn .val .u{font-size:clamp(9px,1.3cqw,11.5px)}
.ox .syn .val.l{transform:translate(0,-50%)}
.ox .syn .val.r{transform:translate(-100%,-50%)}
.ox .syn .box.abs{position:absolute;transform:translate(-50%,-50%);font-size:clamp(9px,1.25cqw,11.5px);padding:.45cqw 0;width:11cqw}
.ox .syn .lbl{position:absolute;transform:translate(-50%,-50%);font-weight:700;font-size:clamp(12px,1.8cqw,15px);letter-spacing:-.01em;color:var(--ink);white-space:nowrap}
.ox .syn .legend{position:absolute;right:1.5%;top:2%;display:flex;flex-direction:column;gap:.6cqw;padding:.8cqw 1.4cqw;border:1.5px solid var(--teal-light);border-radius:10px;background:var(--teal-bg);font-size:clamp(10px,1.4cqw,12.5px);font-weight:600;color:var(--teal-dark)}
.ox .syn .legend div{white-space:nowrap}
.ox .ph-stroke{fill:none;stroke:#6b7580;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.ox .ph-fill{fill:#e6e9ec;stroke:#6b7580;stroke-width:2.5;stroke-linejoin:round}
.ox .ph-dark{fill:#b9c0c7;stroke:#6b7580;stroke-width:2.5;stroke-linejoin:round}
.ox .ph-red{fill:#d23b32;stroke:#8c1f19;stroke-width:2}
.ox .ph-cyl{fill:#cfd5da;stroke:#5f6973;stroke-width:2.5}
.ox .ph-cyl-hi{fill:#f1f4f6;stroke:none}
.ox .dgrid{display:grid;gap:16px;align-items:start}
.ox .dgrid.two{grid-template-columns:1fr 1fr}
.ox .dgrid.four{grid-template-columns:1.15fr 1fr 1fr}
.ox .dgrid.four .span2{grid-row:span 2}
.ox .dpanel{background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,25,.05)}
.ox .dpanel .unit-head{justify-content:space-between}
.ox .drows{display:grid;grid-template-columns:1fr auto}
.ox .drow{display:contents}
.ox .drow>*{padding:9px 18px;border-bottom:1px solid var(--line)}
.ox .drow:last-child>*{border-bottom:0}
.ox .drow .k{color:var(--muted);font-size:13px;font-weight:500}
.ox .drow .v{font-family:var(--mono);font-variant-numeric:tabular-nums;font-size:15px;font-weight:500;text-align:right;white-space:nowrap;color:var(--ink)}
.ox .drow .v.txt{font-family:var(--body);font-weight:700}
.ox .drow .v .box{font-size:11px;padding:4px 0;width:150px}
.ox .drow .v .box.phase{width:190px}
@media (max-width:860px){.ox .dgrid.four{grid-template-columns:1fr 1fr}.ox .dgrid.four .span2{grid-row:auto}}
@media (max-width:560px){.ox .dgrid.two,.ox .dgrid.four{grid-template-columns:1fr}.ox .drow .v .box,.ox .drow .v .box.phase{width:120px}}
.ox .tmenu{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.ox .tbtn{font-family:var(--body);font-weight:800;font-size:15px;letter-spacing:.2px;padding:26px 20px;border-radius:16px;border:1px solid var(--line);background:linear-gradient(135deg,#0b3b38,#0f766e);color:#fff;cursor:pointer;box-shadow:0 1px 3px rgba(15,23,25,.05);transition:all .28s cubic-bezier(.16,1,.3,1)}
.ox .tbtn:hover{transform:translateY(-4px);box-shadow:0 12px 32px rgba(15,118,110,.22)}
.ox .thead{display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap}
.ox .thead h2{margin:0;font-size:18px;font-weight:800;letter-spacing:-.01em}
.ox .thead .win{margin-left:auto;color:var(--teal-dark);background:var(--teal-bg);border:1.5px solid var(--teal-light);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600}
.ox .back{font-family:var(--body);font-weight:700;font-size:13px;padding:8px 14px;border:1.5px solid var(--teal-light);border-radius:10px;background:var(--teal-bg);color:var(--teal-dark);cursor:pointer}
.ox .charts{display:grid;gap:16px}
.ox .chart{background:#fff;border:1px solid var(--line);border-radius:16px;padding:14px 18px 10px;position:relative;box-shadow:0 1px 3px rgba(15,23,25,.05)}
.ox .chart-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.ox .chart-head h3{margin:0;font-size:15px;font-weight:800;letter-spacing:-.01em;border-left:4px solid var(--teal);padding-left:10px}
.ox .chart-head .unit{color:var(--faint);font-size:12px;font-weight:600}
.ox .legend-row{display:flex;gap:14px;margin-left:auto;font-size:12px;font-weight:600;color:var(--muted)}
.ox .legend-row .key{display:inline-block;width:18px;height:0;border-top:2.5px solid;vertical-align:middle;margin-right:6px;border-radius:2px}
.ox .chart svg{width:100%;height:auto;display:block}
.ox .chart .grid{stroke:var(--line);stroke-width:1}
.ox .chart .axis{fill:var(--faint);font-family:var(--mono);font-size:11px}
.ox .chart .ln{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.ox .chart .endpt{stroke:#fff;stroke-width:2}
.ox .chart .xhair{stroke:var(--muted);stroke-width:1;stroke-dasharray:3 3;display:none}
.ox .chart .empty{color:var(--faint);font-size:13px;padding:30px 0;text-align:center}
.ox .tip{position:absolute;pointer-events:none;display:none;background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:12.5px;box-shadow:0 6px 20px rgba(15,118,110,.14);min-width:150px;z-index:2}
.ox .tip .t{color:var(--faint);font-family:var(--mono);font-size:11px;margin-bottom:4px}
.ox .tip .r{display:flex;align-items:center;gap:8px;font-weight:500}
.ox .tip .r b{font-family:var(--mono);font-weight:500;font-size:14px;margin-left:auto;color:var(--ink)}
.ox .asum{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px;font-size:12.5px;color:var(--muted)}
.ox .asum>span{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:8px 14px;box-shadow:0 1px 3px rgba(15,23,25,.05);font-weight:600}
.ox .asum b{font-family:var(--mono);font-weight:500;color:var(--teal-dark);font-size:16px}
.ox .asum .since{margin-left:auto;background:var(--teal-bg);border-color:var(--teal-light);color:var(--teal-dark)}
.ox .atable-wrap{background:#fff;border:1px solid var(--line);border-radius:16px;overflow-x:auto;box-shadow:0 1px 3px rgba(15,23,25,.05)}
.ox .atable{width:100%;border-collapse:collapse;min-width:720px}
.ox .atable th{text-align:center;font-weight:800;font-size:11.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--teal-dark);padding:12px 16px;background:var(--teal-bg);border-bottom:1.5px solid var(--teal-light);white-space:nowrap}
.ox .atable td{text-align:center;padding:9px 16px;border-bottom:1px solid var(--line);font-size:13.5px;vertical-align:middle;white-space:nowrap}
.ox .atable tr:last-child td{border-bottom:0}
.ox .atable td.id,.ox .atable td.n,.ox .atable td.dt{font-family:var(--mono);font-variant-numeric:tabular-nums}
.ox .atable td.id{color:var(--faint)}
.ox .atable td.name{font-weight:700}
.ox .atable tr.never td{color:var(--faint)}
.ox .atable tr.live td{background:#fff5f5}
.ox .atable .box{font-size:10.5px;padding:3px 0;width:84px}
.ox .atable .pr{font-weight:800;font-size:11.5px;letter-spacing:.4px}
.ox .atable .pr.High{color:#c0392b}.ox .atable .pr.Med{color:#b7791f}.ox .atable .pr.Low{color:#2b6cb0}
.ox .anote{color:var(--faint);font-size:12px;margin-top:10px}
`;

/* ─── decode helpers (values -> box class/text), same rules as the CSS screen ─── */
const phaseClass = p => ({ 0: "info", 1: "ok", 2: "warn", 3: "warn", 4: "info", 5: "warn" })[p] ?? "off";
const stateClass = s => ({ 0: "ok", 1: "warn", 2: "alarm" })[s] ?? "off";
const stateLabel = s => ({ 0: "OK", 1: "WARNING", 2: "ALARM" })[s] ?? "?";
const BANK_STATE = { 0: "DEFAULT", 1: "OK", 2: "TOO LOW", 3: "TOO HIGH" };
const fmt = (v, d = 1) => (v === undefined || v === null || Number.isNaN(Number(v))) ? "–" : Number(v).toFixed(d);
const Num = ({ v, u, d = 1 }) => <>{fmt(v, d)}<span className="u">{u}</span></>;
const Box = ({ cls, children, extra = "" }) => <span className={`box ${cls} ${extra}`}>{children}</span>;
const OkBox = ({ bad, ok = "OK", badTxt = "ALARM", extra = "" }) => <Box cls={bad ? "alarm" : "ok"} extra={extra}>{bad ? badTxt : ok}</Box>;
const Dot = ({ on, abs, style }) => <span className={`dot ${abs ? "abs " : ""}${on ? "on" : "off"}`} style={style} />;
const fmtTs = ts => {
  if (!ts) return "–";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts).replace("T", " ");
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const fmtNaive = ts => ts ? String(ts).replace("T", " ").replace(/\+.*$/, "").slice(0, 19) : "–";

/* ─── page 1: plant status ─── */
function Unit({ n, g }) {
  const stale = g.stale ? " stale" : "";
  return (
    <section className="unit">
      <div className="unit-head"><h2>Unit {n}</h2><span className="link"><Dot on={g.dot} />{g.dot ? "link OK" : "no link"}</span></div>
      <div className="row">
        <div className={`tile${stale}`}>
          <div className="icon"><img src={ICON.compressor} alt="" /></div>
          <div className="name">Compressor</div>
          <OkBox bad={g.compressor_fault} badTxt="FAULT" extra="status" />
        </div>
        <div className={`tile${stale}`}>
          <div className="icon"><img src={ICON.dryer} alt="" /></div>
          <div className="name">Dryer</div>
          <OkBox bad={g.dryer_fault} badTxt="FAULT" extra="status" />
        </div>
        <div className={`tile gen${stale}`}>
          <div className="icon"><img src={ICON.generator} alt="" /></div>
          <div className="name">Oxygen generator</div>
          <dl className="kv">
            <dt>Pressure</dt><dd><Num v={g.pressure_bar} u="bar" /></dd>
            <dt>Purity</dt><dd><Num v={g.purity_pct} u="%" /></dd>
          </dl>
          <div className="stack">
            <Box cls={phaseClass(g.phase)} extra="phase">{g.phase_text}</Box>
            <Box cls={stateClass(g.state)} extra="state">{stateLabel(g.state)}</Box>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── page 2: synoptic, coordinates in % of the CSS's 800x600 screen ─── */
const P = (x, y) => ({ left: `${(x / 8).toFixed(2)}%`, top: `${(y / 6).toFixed(2)}%` });
const El = ({ x, y, w, h, children }) => <div className="el" style={{ ...P(x, y), width: `${w / 8}%`, height: `${h / 6}%` }}>{children}</div>;
const Val = ({ x, y, side = "c", children }) => <span className={`val ${side}`} style={P(x, y)}>{children}</span>;
const Sbx = ({ x, y, bad, ok = "OK", badTxt = "DEFAULT" }) => <span className={`box abs ${bad ? "alarm" : "ok"}`} style={P(x, y)}>{bad ? badTxt : ok}</span>;
const Lbl = ({ x, y, children }) => <span className="lbl" style={P(x, y)}>{children}</span>;
const Bank = () => (
  <svg className="ph" viewBox="0 0 160 140" aria-hidden="true">
    <rect className="ph-fill" x="48" y="14" width="64" height="86" rx="5" /><rect className="ph-red" x="48" y="14" width="64" height="12" rx="3" />
    <rect className="ph-dark" x="60" y="34" width="40" height="22" rx="2" /><rect className="ph-stroke" x="66" y="39" width="28" height="12" rx="1" />
    <path className="ph-stroke" d="M64 66h32M64 76h32M64 86h20" />
    <circle className="ph-fill" cx="24" cy="86" r="17" /><circle className="ph-stroke" cx="24" cy="86" r="10" /><path className="ph-stroke" d="M24 86l6-7" />
    <circle className="ph-fill" cx="136" cy="86" r="17" /><circle className="ph-stroke" cx="136" cy="86" r="10" /><path className="ph-stroke" d="M136 86l-6-7" />
    <path className="ph-stroke" d="M41 86h7M112 86h7" />
    <rect className="ph-dark" x="14" y="106" width="20" height="8" rx="2" /><rect className="ph-dark" x="126" y="106" width="20" height="8" rx="2" />
    <path className="ph-stroke" d="M24 103v3M136 103v3M24 114v22M136 114v22M80 100v36" />
  </svg>
);
const Cylinders = () => (
  <svg className="ph" viewBox="0 0 96 130" aria-hidden="true">
    <path className="ph-stroke" d="M6 18h84" />
    {[0, 1, 2, 3].map(i => { const x = 6 + i * 22; return (
      <g key={i}>
        <rect className="ph-cyl" x={x} y="22" width="18" height="104" rx="7" />
        <rect className="ph-cyl-hi" x={x + 4} y="30" width="4" height="86" rx="2" />
        <rect className="ph-dark" x={x + 5} y="12" width="8" height="12" rx="2" />
        <path className="ph-stroke" d={`M${x + 9} 12V18`} />
      </g>); })}
  </svg>
);
function Synoptic({ r }) {
  const o = r.oxycheck, m = r.medgasflow, b = r.bank, h = r.hpox;
  return (
    <div className="syn-wrap"><div className="syn">
      <svg className="pipes" viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true">
        <path d="M202 165 H273" /><path d="M377 178 H600 V292 H420 V308" />
        <path d="M360 432 V456 H293 V474" /><path d="M450 432 V456 H517 V474" /><path d="M182 505 H256" />
      </svg>
      <div className="legend"><div><Dot on />link OK</div><div><Dot on={false} />no link</div></div>

      <El x={150} y={165} w={100} h={90}><img src={ICON.oxycheck} alt="" /></El>
      <Dot abs on={o.dot} style={P(205, 108)} />
      <Val x={24} y={165} side="l"><Num v={o.o2_pct} u="%" /></Val>
      <Sbx x={150} y={232} bad={o.alarm_not_active} />
      <Lbl x={150} y={254}>Oxycheck</Lbl>

      <El x={325} y={165} w={100} h={90}><img src={ICON.medgasflow} alt="" /></El>
      <Dot abs on={m.dot} style={P(380, 108)} />
      <Val x={400} y={150} side="l"><Num v={m.flow_m3h} u="m³/h" /></Val>
      <Sbx x={325} y={232} bad={m.alarm} />
      <Lbl x={325} y={254}>Medgas Flow</Lbl>

      <Val x={412} y={290} side="r"><Num v={b.network_bar} u="bar" d={2} /></Val>
      <El x={405} y={370} w={140} h={120}><Bank /></El>
      <Dot abs on={b.dot} style={P(492, 332)} />
      <Val x={328} y={375} side="r"><Num v={b.left_bar} u="bar" d={2} /></Val>
      <Val x={485} y={375} side="l"><Num v={b.right_bar} u="bar" d={2} /></Val>
      <Sbx x={405} y={447} bad={b.alarm_failure} />
      <Lbl x={405} y={468}>Medgas Bank</Lbl>
      <El x={293} y={525} w={72} h={100}><Cylinders /></El>
      <El x={517} y={525} w={72} h={100}><Cylinders /></El>

      <El x={120} y={505} w={120} h={100}><img src={ICON.hpox} alt="" /></El>
      <Dot abs on={h.dot} style={P(188, 458)} />
      <Val x={14} y={500} side="l"><Num v={h.in_bar} u="bar" /></Val>
      <Val x={186} y={486} side="l"><Num v={h.out_bar} u="bar" /></Val>
      <Sbx x={84} y={572} bad={h.general_alarm} badTxt="FAULT" />
      <Sbx x={160} y={572} bad={!h.status} ok="RUNNING" badTxt="STOP" />
      <Lbl x={120} y={592}>Booster HPOX 450</Lbl>
    </div></div>
  );
}

/* ─── pages 3 and 4: detail panels ─── */
const Row = ({ k, children, txt }) => <div className="drow"><div className="k">{k}</div><div className={`v${txt ? " txt" : ""}`}>{children}</div></div>;
function Panel({ title, dot, cls = "", children }) {
  return (
    <section className={`dpanel ${cls}`}>
      <div className="unit-head"><h2>{title}</h2><span className="link"><Dot on={dot} />{dot ? "link OK" : "no link"}</span></div>
      <div className="drows">{children}</div>
    </section>
  );
}
function Details1({ r }) {
  return (
    <div className="dgrid two">
      {[1, 2].map(n => { const g = r["gen" + n]; return (
        <Panel key={n} title={`O2 Generator ${n}`} dot={g.dot}>
          <Row k="Purity"><Num v={g.purity_pct} u="%" /></Row>
          <Row k="Output pressure"><Num v={g.pressure_bar} u="bar" /></Row>
          <Row k="Output flowrate"><Num v={g.flow_nm3h} u="Nm³/h" /></Row>
          <Row k="Hour counter"><Num v={g.hours} u="h" d={0} /></Row>
          <Row k="Filters maintenance"><OkBox bad={g.filters_maint} ok="NOT REQUIRED" badTxt="REQUIRED" /></Row>
          <Row k="Valves maintenance"><OkBox bad={g.valves_maint} ok="NOT REQUIRED" badTxt="REQUIRED" /></Row>
          <Row k="Phase"><Box cls={phaseClass(g.phase)} extra="phase">{g.phase_text}</Box></Row>
          <Row k="General state"><Box cls={stateClass(g.state)}>{stateLabel(g.state)}</Box></Row>
          <Row k="Dryer alarm"><OkBox bad={g.dryer_fault} badTxt="FAULT" /></Row>
          <Row k="Air compressor alarm"><OkBox bad={g.compressor_fault} badTxt="FAULT" /></Row>
        </Panel>); })}
    </div>
  );
}
function Details2({ r }) {
  const m = r.medgasflow, h = r.hpox, b = r.bank, o = r.oxycheck;
  const bankRow = (k, st) => <Row k={k}><OkBox bad={st !== 1} ok={BANK_STATE[1]} badTxt={BANK_STATE[st] ?? "?"} /></Row>;
  return (
    <div className="dgrid four">
      <Panel title="Medgasflow" dot={m.dot} cls="span2">
        <Row k="Flow"><Num v={m.flow_m3h} u="m³/h" /></Row>
        <Row k="Total counter"><Num v={m.total_m3} u="m³" /></Row>
        <Row k="Current week"><Num v={m.week_m3} u="m³" /></Row>
        <Row k="Current month"><Num v={m.month_m3} u="m³" /></Row>
        <Row k="Current year"><Num v={m.year_m3} u="m³" /></Row>
        <Row k="Previous week"><Num v={m.prev_week_m3} u="m³" /></Row>
        <Row k="Previous month"><Num v={m.prev_month_m3} u="m³" /></Row>
        <Row k="Previous year"><Num v={m.prev_year_m3} u="m³" /></Row>
        <Row k="Flow alarm"><OkBox bad={m.alarm} badTxt={m.alarm === 1 ? "LOW" : "HIGH"} /></Row>
      </Panel>
      <Panel title="HPOX 450" dot={h.dot}>
        <Row k="Output pressure"><Num v={h.out_bar} u="bar" /></Row>
        <Row k="Input pressure"><Num v={h.in_bar} u="bar" /></Row>
        <Row k="Temperature 1"><Num v={h.temp1_c} u="°C" /></Row>
        <Row k="Temperature 2"><Num v={h.temp2_c} u="°C" /></Row>
        <Row k="Working hours"><Num v={h.hours} u="h" d={0} /></Row>
        <Row k="Status" txt>{h.status_text}</Row>
        <Row k="General alarm"><OkBox bad={h.general_alarm} badTxt="FAULT" /></Row>
      </Panel>
      <Panel title="Oxycheck" dot={o.dot}>
        <Row k="O₂"><Num v={o.o2_pct} u="%" /></Row>
        <Row k="Low alarm"><OkBox bad={o.low_alarm} /></Row>
        <Row k="High alarm"><OkBox bad={o.high_alarm} /></Row>
      </Panel>
      <Panel title="Medgas Bank" dot={b.dot}>
        {bankRow("Left bank state", b.left_state)}
        {bankRow("Network state", b.network_state)}
        {bankRow("Right bank state", b.right_state)}
        <Row k="Left bank pressure"><Num v={b.left_bar} u="bar" d={2} /></Row>
        <Row k="Network pressure"><Num v={b.network_bar} u="bar" d={2} /></Row>
        <Row k="Right bank pressure"><Num v={b.right_bar} u="bar" d={2} /></Row>
      </Panel>
    </div>
  );
}

/* ─── page 5: trends (latest 24 h from css_trend_points; Y ranges = the CSS project's curve ranges) ─── */
const TRENDS = {
  generators: { name: "Generators", charts: [
    { title: "Purity", unit: "%", min: 0, max: 110, d: 1, series: [{ k: "gen1_purity", l: "Gen 1", link: "gen1_link" }, { k: "gen2_purity", l: "Gen 2", link: "gen2_link" }] },
    { title: "Output pressure", unit: "bar", min: 0, max: 100, d: 1, series: [{ k: "gen1_pressure", l: "Gen 1", link: "gen1_link" }, { k: "gen2_pressure", l: "Gen 2", link: "gen2_link" }] },
  ] },
  oxycheck: { name: "Oxycheck", charts: [{ title: "O₂", unit: "%", min: 0, max: 100, d: 1, series: [{ k: "oxy_o2", l: "O₂", link: "oxy_link" }] }] },
  medgasflow: { name: "Medgasflow", charts: [{ title: "Flow", unit: "m³/h", min: 0, max: 30, d: 1, series: [{ k: "mgf_flow", l: "Flow" }] }] },
  bank: { name: "Medgas Bank", charts: [
    { title: "Network pressure", unit: "bar", min: 0, max: 10, d: 2, series: [{ k: "bank_network", l: "Network", link: "bank_link" }] },
    { title: "Bank pressures", unit: "bar", min: 0, max: 250, d: 1, series: [{ k: "bank_left", l: "Left bank", link: "bank_link" }, { k: "bank_right", l: "Right bank", link: "bank_link" }] },
  ] },
  hpox: { name: "HPOX 450", charts: [
    { title: "Output pressure", unit: "bar", min: 0, max: 250, d: 1, series: [{ k: "hpox_out", l: "Output", link: "hpox_link" }] },
    { title: "Input pressure", unit: "bar", min: 0, max: 10, d: 1, series: [{ k: "hpox_in", l: "Input", link: "hpox_link" }] },
    { title: "Temperatures", unit: "°C", min: 0, max: 200, d: 1, series: [{ k: "hpox_t1", l: "Temperature 1", link: "hpox_link" }, { k: "hpox_t2", l: "Temperature 2", link: "hpox_link" }] },
  ] },
};
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const a in attrs) e.setAttribute(a, attrs[a]); return e; };
const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function buildChart(spec, rows, now) {
  const W = 800, H = 260, L = 52, R = 16, T = 12, B = 30, pw = W - L - R, ph = H - T - B;
  const t1 = now, t0 = now - 24 * 3600000;
  const x = t => L + (t - t0) / (t1 - t0) * pw;
  const y = v => T + (1 - (Math.min(Math.max(v, spec.min), spec.max) - spec.min) / (spec.max - spec.min)) * ph;
  const card = document.createElement("div"); card.className = "chart";
  const head = document.createElement("div"); head.className = "chart-head";
  const h3 = document.createElement("h3"); h3.textContent = spec.title;
  const un = document.createElement("span"); un.className = "unit"; un.textContent = spec.unit;
  head.append(h3, un);
  if (spec.series.length > 1) {
    const lg = document.createElement("div"); lg.className = "legend-row";
    spec.series.forEach((s, i) => { const it = document.createElement("span"); const key = document.createElement("span"); key.className = "key"; key.style.borderColor = `var(--series-${i + 1})`; it.append(key, document.createTextNode(s.l)); lg.append(it); });
    head.append(lg);
  }
  card.append(head);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${spec.title} (${spec.unit}), latest 24 hours` });
  const n = 5;
  for (let i = 0; i <= n; i++) { const v = spec.min + i * (spec.max - spec.min) / n;
    svg.append(svgEl("line", { class: "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    const tx = svgEl("text", { class: "axis", x: L - 8, y: y(v) + 4, "text-anchor": "end" }); tx.textContent = v.toFixed(spec.d > 1 ? 1 : 0); svg.append(tx); }
  for (let t = t1; t >= t0; t -= 4 * 3600000) { const tx = svgEl("text", { class: "axis", x: x(t), y: H - 10, "text-anchor": t === t1 ? "end" : "middle" }); tx.textContent = hhmm(t); svg.append(tx); }
  const pts = rows.filter(r => r.t >= t0 && r.t <= t1);
  if (pts.length) {
    spec.series.forEach((s, i) => {
      let d = "", pen = false;
      const has = r => r[s.k] !== null && r[s.k] !== undefined && (!s.link || r[s.link] === true);
      for (const r of pts) { const v = r[s.k]; if (!has(r)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(r.t).toFixed(1)} ${y(v).toFixed(1)}`; pen = true; }
      svg.append(svgEl("path", { class: "ln", d, stroke: `var(--series-${i + 1})` }));
      const last = [...pts].reverse().find(has);
      if (last) svg.append(svgEl("circle", { class: "endpt", cx: x(last.t), cy: y(last[s.k]), r: 4, fill: `var(--series-${i + 1})` }));
    });
  }
  const xh = svgEl("line", { class: "xhair", x1: 0, x2: 0, y1: T, y2: T + ph }); svg.append(xh);
  card.append(svg);
  if (!pts.length) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "No readings in the last 24 hours yet."; card.append(e); }
  const tip = document.createElement("div"); tip.className = "tip"; card.append(tip);
  const hide = () => { xh.style.display = "none"; tip.style.display = "none"; };
  svg.addEventListener("pointermove", ev => {
    if (!pts.length) return;
    const rect = svg.getBoundingClientRect(); const px = (ev.clientX - rect.left) / rect.width * W;
    if (px < L || px > W - R) { hide(); return; }
    const tt = t0 + (px - L) / pw * (t1 - t0);
    let row = pts[0]; for (const r of pts) if (Math.abs(r.t - tt) < Math.abs(row.t - tt)) row = r;
    xh.setAttribute("x1", x(row.t)); xh.setAttribute("x2", x(row.t)); xh.style.display = "block";
    tip.replaceChildren();
    const t = document.createElement("div"); t.className = "t"; t.textContent = fmtTs(row.t); tip.append(t);
    spec.series.forEach((s, i) => { const r = document.createElement("div"); r.className = "r";
      const key = document.createElement("span"); key.style.cssText = `display:inline-block;width:14px;border-top:2px solid var(--series-${i + 1})`;
      const b = document.createElement("b"); b.textContent = (s.link && row[s.link] !== true) ? "no link" : `${fmt(row[s.k], spec.d)} ${spec.unit}`;
      r.append(key, document.createTextNode(s.l), b); tip.append(r); });
    tip.style.display = "block";
    const cx = ev.clientX - rect.left, flip = cx > rect.width * 0.65;
    tip.style.left = flip ? "auto" : `${cx + 14}px`; tip.style.right = flip ? `${rect.width - cx + 14}px` : "auto";
    tip.style.top = `${ev.clientY - rect.top + 10}px`;
  });
  svg.addEventListener("pointerleave", hide);
  return card;
}
function TrendView({ trendKey, rows, onBack }) {
  const box = useRef(null);
  const t = TRENDS[trendKey];
  useEffect(() => {
    if (!box.current || !t) return;
    box.current.replaceChildren();
    const now = Date.now();
    for (const spec of t.charts) box.current.append(buildChart(spec, rows, now));
  }, [trendKey, rows, t]);
  if (!t) return null;
  return (
    <div>
      <div className="thead"><button type="button" className="back" onClick={onBack}>&#8592; Trends</button><h2>{t.name}</h2><span className="win">latest 24 hours</span></div>
      <div className="charts" ref={box} />
    </div>
  );
}
function Trends({ rows }) {
  const [key, setKey] = useState(null);
  if (key) return <TrendView trendKey={key} rows={rows} onBack={() => setKey(null)} />;
  return (
    <div className="tmenu">
      {Object.entries(TRENDS).map(([k, t]) => <button key={k} type="button" className="tbtn" onClick={() => setKey(k)}>{t.name}</button>)}
    </div>
  );
}

/* ─── page 6: alarm history (css_alarm_state) ─── */
function Alarms({ list: raw, css }) {
  // Merge the CSS's own history (seeded once from its screen) with what the Pi has seen since:
  // newest "last triggered" wins, counts add up, alarms with no history at all stay hidden.
  const list = raw
    .map(a => {
      const seedT = a.seed_last_on ? new Date(a.seed_last_on).getTime() : 0;
      const piT = a.last_on ? new Date(a.last_on).getTime() : 0;
      return { ...a, show_on: piT >= seedT ? a.last_on : a.seed_last_on, show_off: piT >= seedT ? a.last_off : null,
               total: (a.count || 0) + (a.seed_count || 0), seen: !!(a.active || a.count || a.seed_last_on) };
    })
    .filter(a => a.seen);
  const active = list.filter(a => a.active).length;

  return (
    <div>
      <div className="asum">
        <span>Active now <b>{active}</b></span>
        <span>PLC active <b>{css?.alarms_active ?? "–"}</b></span>
        <span>Pending acknowledge <b>{css?.alarms_pending_ack ?? "–"}</b></span>
        <span>Pending view <b>{css?.alarms_pending_view ?? "–"}</b></span>
      </div>
      <div className="atable-wrap">
        <table className="atable">
          <thead><tr><th>ID</th><th>Alarm name</th><th>Last triggered</th><th>Last cleared</th><th>Active</th><th>Priority</th><th className="n">Count</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No alarm data received yet.</td></tr>}
            {list.map(al => (
              <tr key={al.alarm_id} className={al.active ? "live" : (al.count ? "" : "never")}>
                <td className="id">{String(al.alarm_id).padStart(3, "0")}</td>
                <td className="name">{al.name}</td>
                <td className="dt">{fmtTs(al.show_on)}</td>
                <td className="dt">{fmtTs(al.show_off)}</td>
                <td><Box cls={al.active ? "alarm" : "ok"}>{al.active ? "ACTIVE" : "CLEARED"}</Box></td>
                <td><span className={`pr ${al.priority}`}>{al.priority}</span></td>
                <td className="n">{al.total}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <p className="anote">Dates and counts up to the seed date were copied from the CSS screen; everything after comes from the plant readings, one per minute.
        Acknowledgement state stays on the CSS only.</p>
    </div>
  );
}

/* ─── data ─── */
async function fetchTrendRows(siteId) {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const cols = "ts,gen1_purity,gen2_purity,gen1_pressure,gen2_pressure,oxy_o2,mgf_flow,bank_network,bank_left,bank_right,hpox_out,hpox_in,hpox_t1,hpox_t2,gen1_link,gen2_link,oxy_link,bank_link,hpox_link";
  const out = [];
  for (let page = 0; page < 3; page++) {                       // 1440 rows/day; server pages are 1000
    const { data, error } = await supabase.from("css_trend_points").select(cols).eq("site_id", siteId).gte("ts", since)
      .order("ts", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    for (const r of data) out.push({ ...r, t: new Date(r.ts).getTime() });
    if (data.length < 1000) break;
  }
  return out;
}

const PAGES = [["p1", "Plant status"], ["p2", "Synoptic"], ["p3", "Details 1"], ["p4", "Details 2"], ["p5", "Trends"], ["p6", "Alarm history"]];
export { Unit, Synoptic, Details1, Details2, Alarms, TRENDS };   // for tests

export default function RemoteMonitoring() {
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [latest, setLatest] = useState(null);        // css_latest row
  const [alarms, setAlarms] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [page, setPage] = useState("p1");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(iv); }, []);

  useEffect(() => {                                    // fonts once
    if (!document.querySelector(`link[href="${FONT_HREF}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = FONT_HREF; document.head.append(l); }
  }, []);
  useEffect(() => {                                    // sites
    let alive = true;
    supabase.from("css_sites").select("id,name,timezone").order("name").then(({ data, error }) => {
      if (!alive) return;
      if (error) { setErr(error.message); return; }
      setSites(data || []);
      if (data?.length && !siteId) setSiteId(data[0].id);
    });
    return () => { alive = false; };
  }, []);                                              // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {                                    // latest + alarms every minute
    if (!siteId) return;
    let alive = true;
    const pull = async () => {
      try {
        const [{ data: l, error: e1 }, { data: a, error: e2 }] = await Promise.all([
          supabase.from("css_latest").select("ts,plant_clock,received_at,payload").eq("site_id", siteId).maybeSingle(),
          supabase.from("css_alarm_state").select("*").eq("site_id", siteId).order("alarm_id"),
        ]);
        if (!alive) return;
        if (e1 || e2) { setErr((e1 || e2).message); return; }
        setErr(""); setLatest(l || null); setAlarms(a || []); setTick(t => t + 1);
      } catch (e) { if (alive) setErr(String(e.message || e)); }
    };
    pull();
    const iv = setInterval(() => { if (!document.hidden) pull(); }, POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [siteId]);
  useEffect(() => {                                    // trend rows every 5 min
    if (!siteId) return;
    let alive = true;
    const pull = () => fetchTrendRows(siteId).then(rows => { if (alive) setTrendRows(rows); }).catch(e => { if (alive) setErr(String(e.message || e)); });
    pull();
    const iv = setInterval(() => { if (!document.hidden) pull(); }, TREND_POLL_MS);
    return () => { alive = false; clearInterval(iv); };
  }, [siteId]);

  const site = sites.find(s => s.id === siteId);
  const r = latest?.payload;
  // plant clock = the real local time at the site (its time zone), ticking every second;
  // the CSS's own clock (payload.plant_clock) is stored but not shown, it runs slow
  const plantNow = new Date(now);
  const lastReadPlant = latest ? new Date(latest.ts) : null;
  const fmtZone = d => { try { return d.toLocaleString("en-GB", { timeZone: site?.timezone || "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", ""); } catch (e) { return fmtTs(d); } };
  const ageMs = latest ? Date.now() - new Date(latest.ts).getTime() : null;
  const stale = ageMs !== null && ageMs > STALE_MS;
  const ready = r && r.gen1 && r.gen2 && r.oxycheck && r.medgasflow && r.hpox && r.bank;

  return (
    <div className="ox">
      <style>{CSS}</style>
      <header className="top">
        {sites.length > 1 && <select className="site" value={siteId} onChange={e => setSiteId(e.target.value)}>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <div className="meta">
          <span>Plant clock <b>{plantNow ? fmtZone(plantNow) : "–"}</b></span>
          <span>Last read at: <b>{lastReadPlant ? fmtZone(lastReadPlant) : "–"}</b></span>
        </div>
      </header>
      {err && <div className="warnbar">Could not load data: {err}</div>}
      {!err && !latest && <div className="infobar">No readings received from this plant yet.</div>}
      {stale && <div className="warnbar">No new reading since {fmtZone(lastReadPlant)} ({Math.round(ageMs / 60000)} min ago). The plant or its internet link may be down; the values below are the last received.</div>}
      <nav className="tabs">
        {PAGES.map(([id, label]) => <button key={id} type="button" className={`tab${page === id ? " active" : ""}`} onClick={() => setPage(id)}>{label}</button>)}
      </nav>
      {ready && page === "p1" && <><Unit n={1} g={r.gen1} /><Unit n={2} g={r.gen2} /></>}
      {ready && page === "p2" && <Synoptic r={r} />}
      {ready && page === "p3" && <Details1 r={r} />}
      {ready && page === "p4" && <Details2 r={r} />}
      {page === "p5" && <Trends rows={trendRows} key={siteId + tick % 5} />}
      {page === "p6" && <Alarms list={alarms} css={r?.css} />}
    </div>
  );
}
