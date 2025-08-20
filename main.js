/* Base */
* { box-sizing: border-box; }
:root {
  --bg:#f6f7f8; --fg:#111827; --muted:#6b7280; --card:#ffffff; --border:#e5e7eb;
  --accent:#c08a2b; --accent-ink:#1b1208; --good:#166534; --bad:#7f1d1d;
}
html, body {
  height:100%; margin:0; background:var(--bg); color:var(--fg);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial;
}

/* Header/Footer */
.app-header, .app-footer {
  display:flex; align-items:center; gap:12px; padding:12px 16px;
  background:#101418; color:#e5e7eb;
}
.app-footer { justify-content:center; }
.logo { width:28px; height:28px; filter: invert(90%); }
.flex-spacer { flex:1; }

/* Buttons */
button { border:1px solid var(--border); background:#fff; color:var(--fg); padding:6px 10px; border-radius:10px; cursor:pointer; }
button.primary { background:var(--accent); color:var(--accent-ink); border-color:#b07b22; font-weight:600; }
button:disabled { opacity:.6; cursor:not-allowed; }

/* Layout */
.app-main { display:grid; grid-template-columns:360px 1fr; gap:16px; padding:16px; }
.sidebar { display:flex; flex-direction:column; gap:16px; }

/* Cards */
.card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:12px; box-shadow:0 2px 6px rgba(0,0,0,.04); }
.card h2 { margin:4px 0 8px; }

/* Map toolbar */
.map-pane { display:flex; flex-direction:column; gap:12px; }
.map-toolbar { display:flex; align-items:center; gap:12px; padding:8px 12px; background:#fff; border:1px solid var(--border); border-radius:12px; }
.tabs { display:flex; gap:8px; }
.tab { border-radius:999px; padding:6px 10px; border:1px solid var(--border); background:#fff; }
.tab.active { background:#111827; color:#fff; border-color:#111827; }

/* Grid map */
#map {
  background:#e8eef2; border:1px solid var(--border); border-radius:12px; padding:8px;
  display:grid; grid-template-columns:repeat(64, 1fr); grid-auto-rows:14px; gap:2px;
  overflow:auto; max-height:65vh;
}
.tile { width:14px; height:14px; border-radius:3px; border:1px solid var(--border); position:relative; }
.tile.plains{background:#fef3c7;} .tile.forest{background:#a7f3d0;} .tile.river{background:#93c5fd;}
.tile.mountain{background:#ced4da;} .tile.town{background:#fca5a5;}
.tile.selected { outline:2px solid var(--accent); }
.tile.discovered::after { content:'•'; position:absolute; right:2px; top:-2px; font-size:10px; color:#92400e; }
.tile.claimed { box-shadow: inset 0 0 0 2px #a16207; }

/* Hi-res map container */
#leafletMap.leaflet-shell {
  height:65vh; background:#e8eef2; border:1px solid var(--border); border-radius:12px; overflow:hidden;
}

/* Tile panel */
.tile-card { max-width:700px; }
.log { margin-top:8px; padding:8px; background:#f9fafb; border:1px dashed var(--border); border-radius:12px; max-height:140px; overflow:auto; }
.kv { display:grid; grid-template-columns:1fr 1fr; gap:6px 10px; }
.kv div { display:flex; justify-content:space-between; }
.badge { display:inline-block; padding:2px 8px; border-radius:999px; background:#f3f4f6; border:1px solid var(--border); margin-right:6px; font-size:12px; }
.stat { font-variant-numeric: tabular-nums; }
.priceUp { color:var(--good); } .priceDown { color:var(--bad); }

/* Responsive */
@media (max-width:1000px){
  .app-main { grid-template-columns:1fr; }
  #map, #leafletMap.leaflet-shell { max-height:50vh; }
}

