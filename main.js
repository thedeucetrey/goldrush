// Pay Dirt — v3: Leaflet IIIF deep-zoom for 1849 map.
// Uses LoC IIIF Presentation manifest to locate the Image service.

const WORLD = { width: 64, height: 48, seed: 1849 };
const EQUIPMENT = {
  pan: { name: "Pan", price: 20, yield: 1.0 },
  shovel: { name: "Shovel", price: 60, yield: 1.15 },
  pickaxe: { name: "Pickaxe", price: 100, yield: 1.25 },
  rocker: { name: "Rocker", price: 220, yield: 1.45 },
  sluice: { name: "Sluice", price: 400, yield: 1.7 },
  mule: { name: "Pack Mule", price: 180, cap: 250 }
};

// LoC IIIF presentation manifest for Wyld (1849)
const HIST_MANIFEST_URL = "https://www.loc.gov/item/99446205/manifest.json";

// --- Utilities: seeded RNG (xmur3 + mulberry32) ---
function xmur3(str){ for(var i=0,h=1779033703^str.length;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19 } return function(){ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^h>>>16)>>>0 } }
function mulberry32(a){ return function(){ var t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296 } }
const hash = xmur3(String(WORLD.seed));
function seeded(x,y){ const h = xmur3(`${WORLD.seed}:${x},${y}`)(); return mulberry32(h)(); }
function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

// --- World generation ---
function genTile(x,y){
  const r = seeded(x,y);
  const riverBand = Math.sin((x/10)) * 3 + (WORLD.height/2 - 2);
  const distToRiver = Math.abs(y - riverBand);
  let terrain = "plains";
  if (distToRiver < 0.8) terrain = "river";
  else if (r < 0.15) terrain = "forest";
  else if (r > 0.85) terrain = "mountain";

  let goldDensity = 0;
  if (terrain === "river") goldDensity = 0.55 + (0.45 * (0.8 - distToRiver));
  else if (terrain === "mountain") goldDensity = 0.35 + (r * 0.2);
  else if (terrain === "forest") goldDensity = 0.18 + (r * 0.12);
  else goldDensity = 0.1 + (r * 0.1);
  goldDensity = clamp(goldDensity, 0, 0.95);

  const deposit = Math.floor(goldDensity * 120) + (r > 0.97 ? 100 : 0);
  const town = (x===Math.floor(WORLD.width*0.15) && y===Math.floor(WORLD.height*0.7))
            || (x===Math.floor(WORLD.width*0.8) && y===Math.floor(WORLD.height*0.3));

  return { x,y, terrain: town ? "town" : terrain, discovered: false, claimedBy: null,
           goldRemaining: town ? 0 : deposit, difficulty: terrain==="mountain"?1.25:(terrain==="river"?0.9:1.0) };
}

let world = { tiles: [], pricePerGram: 20, lastPrice: 20, supplyPressure: 0, demandPressure: 0 };
function buildWorld(){ world.tiles = Array.from({length: WORLD.height}, (_,y)=> Array.from({length: WORLD.width},(_,x)=>genTile(x,y))); }
buildWorld();

// --- Player ---
function newID(){ return crypto.getRandomValues(new Uint32Array(1))[0].toString(16)+Date.now().toString(16); }
const initialPlayer = () => ({ id:newID(), name:"Argonaut", money:50, stamina:100, maxStamina:100, encumbrance:0, maxCarry:100,
  inventory:{ gold_dust:0 }, equipment:{ pan:true }, skills:{ prospecting:{xp:0,lvl:1}, panning:{xp:0,lvl:1}, excavation:{xp:0,lvl:1}, trading:{xp:0,lvl:1}, fitness:{xp:0,lvl:1} },
  pos:{ x:Math.floor(WORLD.width*0.18), y:Math.floor(WORLD.height*0.68) }, claims:[], store:null });
let player = initialPlayer();

// --- Persistence ---
function save(){ localStorage.setItem("paydirt_save", JSON.stringify({ world, player })); status("Saved."); }
function load(){ const s = localStorage.getItem("paydirt_save"); if(!s) return false; try{ const d=JSON.parse(s); world=d.world; player=d.player; status("Loaded local save."); return true; }catch{ return false; } }
function reset(){ localStorage.removeItem("paydirt_save"); buildWorld(); player=initialPlayer(); renderAll(); status("Reset."); }

function levelFromXP(xp){ return Math.floor(1 + Math.sqrt(xp)/7); }
function gainXP(skill, amount){ player.skills[skill].xp += amount; player.skills[skill].lvl = levelFromXP(player.skills[skill].xp); }

// --- UI helpers ---
const el = (s) => document.querySelector(s);
const mapEl = el("#map");
const lMapEl = el("#leafletMap");
const tileCard = el("#tileCard");
const tileInfo = el("#tileInfo");
const actionLog = el("#actionLog");
let selected = null;

// --- Grid map rendering ---
function renderMap(){
  mapEl.innerHTML = "";
  mapEl.style.gridTemplateColumns = `repeat(${WORLD.width}, 1fr)`;
  for (let y=0;y<WORLD.height;y++){
    for (let x=0;x<WORLD.width;x++){
      const t = world.tiles[y][x];
      const d = document.createElement("div");
      d.className = `tile ${t.terrain} ${t.discovered ? "discovered":""} ${t.claimedBy? "claimed":""}`;
      d.setAttribute("role","gridcell");
      d.title = `(${x},${y}) ${t.terrain}`;
      d.addEventListener("click", ()=> selectTile(x,y,d));
      if (player.pos.x===x && player.pos.y===y){ d.style.outline = "2px solid #16a34a"; }
      mapEl.appendChild(d);
    }
  }
}
function selectTile(x,y,node=null){
  selected = world.tiles[y][x];
  if (node){ for (const c of mapEl.children) c.classList.remove("selected"); node.classList.add("selected"); }
  selected.discovered = true; tileCard.hidden = false; renderTile(); updateLeafletPlayer();
}
function renderTile(){
  const t = selected, claimed = t.claimedBy ? "Yes":"No";
  tileInfo.innerHTML = `<div class="kv">
    <div><span>Coords</span><span class="stat">(${t.x}, ${t.y})</span></div>
    <div><span>Terrain</span><span>${t.terrain}</span></div>
    <div><span>Gold left</span><span class="stat">${t.goldRemaining} g</span></div>
    <div><span>Claimed</span><span>${claimed}</span></div>
    <div><span>Difficulty</span><span class="stat">${t.difficulty.toFixed(2)}×</span></div>
  </div>`;
  el("#prospectBtn").disabled = t.terrain==="town" || player.stamina<5;
  el("#panBtn").disabled = t.terrain!=="river" || player.stamina<4;
  el("#sluiceBtn").disabled = !player.equipment.sluice || t.terrain!=="river" || player.stamina<8;
  el("#claimBtn").disabled = !!t.claimedBy || (t.goldRemaining<10);
}
function renderChar(){
  el("#charInfo").innerHTML = `<div class="kv">
    <div><span>Name</span><span>${player.name}</span></div>
    <div><span>Money</span><span class="stat">$${player.money.toFixed(2)}</span></div>
    <div><span>Stamina</span><span class="stat">${player.stamina}/${player.maxStamina}</span></div>
    <div><span>Carry</span><span class="stat">${player.encumbrance}/${(player.maxCarry + (player.equipment.mule?EQUIPMENT.mule.cap:0))} kg</span></div>
    <div><span>Position</span><span class="stat">(${player.pos.x}, ${player.pos.y})</span></div>
  </div>`;
}
function renderInv(){
  const items = [];
  items.push(`<span class="badge">Gold dust: ${player.inventory.gold_dust.toFixed(1)} g</span>`);
  for (const k of Object.keys(player.equipment)){ if (player.equipment[k]) items.push(`<span class="badge">${EQUIPMENT[k].name}</span>`); }
  el("#inv").innerHTML = items.join(" ");
}
function renderSkills(){
  const rows = Object.entries(player.skills).map(([k,v])=>`<div><span>${k}</span><span class="stat">Lv ${v.lvl} (${v.xp} xp)</span></div>`).join("");
  el("#skills").innerHTML = `<div class="kv">${rows}</div>`;
}
function renderMarket(){
  const delta = world.pricePerGram - world.lastPrice;
  el("#market").innerHTML = `<div class="kv">
    <div><span>Spot price</span><span class="stat ${delta>0?'priceUp':(delta<0?'priceDown':'')}">$${world.pricePerGram.toFixed(2)}/g</span></div>
    <div><span>Supply pressure</span><span class="stat">${world.supplyPressure.toFixed(0)} g</span></div>
    <div><span>Demand pressure</span><span class="stat">${world.demandPressure.toFixed(0)}</span></div>
  </div>
  <div class="row gap" style="margin-top:8px">
    <button id="sellGoldBtn" ${player.inventory.gold_dust<=0?'disabled':''}>Sell Gold</button>
    <button id="buyPanBtn" ${player.equipment.pan?'disabled':''}>Buy Pan ($${EQUIPMENT.pan.price})</button>
    <button id="buyShovelBtn" ${player.equipment.shovel?'disabled':''}>Buy Shovel ($${EQUIPMENT.shovel.price})</button>
    <button id="buyPickaxeBtn" ${player.equipment.pickaxe?'disabled':''}>Buy Pickaxe ($${EQUIPMENT.pickaxe.price})</button>
    <button id="buyRockerBtn" ${player.equipment.rocker?'disabled':''}>Buy Rocker ($${EQUIPMENT.rocker.price})</button>
    <button id="buySluiceBtn" ${player.equipment.sluice?'disabled':''}>Buy Sluice ($${EQUIPMENT.sluice.price})</button>
    <button id="buyMuleBtn" ${player.equipment.mule?'disabled':''}>Buy Mule ($${EQUIPMENT.mule.price})</button>
  </div>`;
  el("#sellGoldBtn")?.addEventListener("click", sellGold);
  el("#buyPanBtn")?.addEventListener("click", ()=>buyEquip("pan"));
  el("#buyShovelBtn")?.addEventListener("click", ()=>buyEquip("shovel"));
  el("#buyPickaxeBtn")?.addEventListener("click", ()=>buyEquip("pickaxe"));
  el("#buyRockerBtn")?.addEventListener("click", ()=>buyEquip("rocker"));
  el("#buySluiceBtn")?.addEventListener("click", ()=>buyEquip("sluice"));
  el("#buyMuleBtn")?.addEventListener("click", ()=>buyEquip("mule"));
}
function renderBiz(){
  el("#biz").innerHTML = `<p>Create a <strong>General Store</strong> (prototype).</p>
    <div class="row gap">
      <button id="openStoreBtn">Open Store ($150)</button>
      <button id="tunePricesBtn">Tune Prices</button>
    </div>
    <div id="storePanel"></div>`;
  el("#openStoreBtn").addEventListener("click", openStore);
  el("#tunePricesBtn").addEventListener("click", tunePrices);
  updateStorePanel();
}
function updateStorePanel(){
  if (!player.store) { el("#storePanel").innerHTML = `<em>No store yet.</em>`; return; }
  const s = player.store;
  el("#storePanel").innerHTML = `<div class="kv">
      <div><span>Cash on hand</span><span class="stat">$${s.cash.toFixed(2)}</span></div>
      <div><span>Inventory (pan)</span><span class="stat">${s.stock.pan||0}</span></div>
      <div><span>Pan price</span><span class="stat">$${s.prices.pan.toFixed(2)}</span></div>
    </div>
    <div class="row gap" style="margin-top:8px">
      <button id="buyForStore" ${player.money < 20 ? 'disabled':''}>Buy pan wholesale ($20)</button>
      <button id="simulateDemand">Simulate NPC demand</button>
    </div>`;
  el("#buyForStore")?.addEventListener("click", ()=>{
    if (player.money >= 20){ player.money -= 20; s.stock.pan = (s.stock.pan||0)+1; renderAll(); }
  });
  el("#simulateDemand")?.addEventListener("click", simulateDemand);
}

// --- Market & actions ---
function sellGold(){
  if (player.inventory.gold_dust <= 0) return;
  const grams = player.inventory.gold_dust; world.lastPrice = world.pricePerGram;
  const proceeds = grams * world.pricePerGram; player.money += proceeds; player.inventory.gold_dust = 0;
  world.supplyPressure += grams;
  const change = (-0.01 * grams) + (0.005 * world.demandPressure) + (Math.random()-0.5)*0.5;
  world.pricePerGram = clamp(world.pricePerGram + change, 5, 120);
  log(`Sold ${grams.toFixed(1)} g for $${proceeds.toFixed(2)}. Price now $${world.pricePerGram.toFixed(2)}/g.`);
  renderAll();
}
function buyEquip(key){
  const item = EQUIPMENT[key]; if (!item) return;
  if (player.money < item.price){ status("Not enough money."); return; }
  player.money -= item.price; player.equipment[key] = true; world.demandPressure += 1;
  log(`Bought ${item.name}.`); renderAll();
}
function ensureSelected(){ if (!selected){ status("Select a tile first."); return false;} return true; }
function spendStamina(n){ if (player.stamina < n) return false; player.stamina -= n; return true; }
function prospect(){
  if (!ensureSelected()) return; const t = selected;
  if (t.terrain==="town"){ status("Can't prospect in town."); return; }
  if (!spendStamina(6)) { status("Too tired."); return; }
  const skill = player.skills.prospecting.lvl;
  const toolBoost = (player.equipment.pickaxe?1.15:1.0) * (player.equipment.shovel?1.05:1.0);
  const effort = 1 * toolBoost * (1 + skill*0.02) / t.difficulty;
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*3,t.y*5)*8 + Math.random()*4) * effort)));
  if (found > 0){ t.goldRemaining -= found; player.inventory.gold_dust += found; player.encumbrance += found/1000; gainXP("prospecting", 6 + Math.floor(found/2)); log(`Prospected and found ${found} g.`); }
  else { log("Prospected and found nothing."); gainXP("prospecting", 2); }
  renderTile(); renderInv(); renderSkills();
}
function pan(){
  if (!ensureSelected()) return; const t = selected;
  if (t.terrain!=="river"){ status("Panning works best in rivers."); return; }
  if (!spendStamina(5)) { status("Too tired."); return; }
  const skill = player.skills.panning.lvl;
  const toolBoost = (player.equipment.pan?1.0:0.8) * (player.equipment.rocker?1.2:1.0);
  const effort = 1.0 * toolBoost * (1 + skill*0.03);
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*7,t.y*9)*6 + Math.random()*3) * effort)));
  if (found > 0){ t.goldRemaining -= found; player.inventory.gold_dust += found; player.encumbrance += found/1000; gainXP("panning", 8 + Math.floor(found/2)); log(`Panned and found ${found} g.`); }
  else { log("Panned and found nothing."); gainXP("panning", 2); }
  renderTile(); renderInv(); renderSkills();
}
function sluice(){
  if (!ensureSelected()) return; const t = selected;
  if (t.terrain!=="river"){ status("Sluicing requires flowing water."); return; }
  if (!player.equipment.sluice){ status("You need a sluice."); return; }
  if (!spendStamina(10)) { status("Too tired."); return; }
  const skill = (player.skills.panning.lvl + player.skills.excavation.lvl)/2;
  const effort = 2.0 * (1 + skill*0.04);
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*11,t.y*13)*12 + Math.random()*5) * effort)));
  if (found > 0){ t.goldRemaining -= found; player.inventory.gold_dust += found; player.encumbrance += found/1000; gainXP("panning", 10 + Math.floor(found/2)); gainXP("excavation", 5 + Math.floor(found/3)); log(`Sluiced and found ${found} g.`); }
  else { log("Sluiced and found nothing."); gainXP("panning", 3); gainXP("excavation", 3); }
  renderTile(); renderInv(); renderSkills();
}
function stakeClaim(){
  if (!ensureSelected()) return; const t = selected;
  if (t.claimedBy){ status("Already claimed."); return; }
  if (t.goldRemaining < 10){ status("Not worth claiming."); return; }
  if (player.money < 15){ status("Claim filing costs $15."); return; }
  player.money -= 15; t.claimedBy = player.id; player.claims.push({ x: t.x, y: t.y, filed: Date.now() });
  log("Claim staked!"); renderAll();
}

// --- Logging & status ---
function log(msg){ const p = document.createElement("div"); const ts = new Date().toLocaleTimeString(); p.textContent = `[${ts}] ${msg}`; actionLog.prepend(p); }
function status(msg){ const s = document.getElementById("status"); s.textContent = msg; setTimeout(()=> s.textContent="", 2500); }

// --- Leaflet IIIF deep-zoom mode ---
let leaflet = { map:null, iiif:null, playerMarker:null, imgW:0, imgH:0 };
async function initLeaflet(){
  if (leaflet.map) return;
  const map = L.map("leafletMap", { zoomSnap: 0.25 });
  // Pull the IIIF image service from the manifest
  const manifest = await fetch(HIST_MANIFEST_URL).then(r=>r.json());
  const canvas = manifest.sequences?.[0]?.canvases?.[0];
  const serviceId = canvas.images?.[0]?.resource?.service?.['@id'];
  const width = canvas.width, height = canvas.height;
  if (!serviceId) { status("IIIF service not found."); return; }
  leaflet.imgW = width; leaflet.imgH = height;
  const infoUrl = serviceId.replace(/\/$/, '') + "/info.json";
  const layer = L.tileLayer.iiif(infoUrl, { fitBounds: true }).addTo(map);
  leaflet = { map, iiif:layer, playerMarker:null, imgW:width, imgH:height };

  // click -> grid coords
  map.on("click", (e)=>{
    // e.latlng is in CRS set by leaflet-iiif; unproject to pixel coords via layer
    const pt = map.project(e.latlng, map.getMaxZoom()); // high-res mercator pixels
    // Convert to image pixel space using layer's transformation
    // leaflet-iiif exposes _scaleAtResolution; but simpler: use layer.coordsToLatLng/LatLngToCoords is not public.
    // Approximation: use layer.x / y scale via image size and projected bounds.
    const b = layer._imageSizes[layer._imageSizes.length-1]; // max level width/height
    const px = pt.x / (map.project(layer._imageBounds.getNorthEast(), map.getMaxZoom()).x - map.project(layer._imageBounds.getSouthWest(), map.getMaxZoom()).x) * b.x;
    const py = pt.y / (map.project(layer._imageBounds.getSouthWest(), map.getMaxZoom()).y - map.project(layer._imageBounds.getNorthEast(), map.getMaxZoom()).y) * b.y;
    const gx = Math.floor( clamp(px / leaflet.imgW * WORLD.width, 0, WORLD.width-1) );
    const gy = Math.floor( clamp(py / leaflet.imgH * WORLD.height, 0, WORLD.height-1) );
    selectTile(gx,gy);
    renderTile();
  });

  updateLeafletPlayer();
}
function updateLeafletPlayer(){
  if (!leaflet.map || !leaflet.iiif) return;
  const latlngBounds = leaflet.iiif._bounds;
  const ne = latlngBounds.getNorthEast(), sw = latlngBounds.getSouthWest();
  const latSpan = ne.lat - sw.lat, lngSpan = ne.lng - sw.lng;
  const lat = sw.lat + (player.pos.y + 0.5)/WORLD.height * latSpan;
  const lng = sw.lng + (player.pos.x + 0.5)/WORLD.width * lngSpan;
  if (!leaflet.playerMarker){
    leaflet.playerMarker = L.circleMarker([lat,lng], {radius: 5, weight: 2}).addTo(leaflet.map);
  } else {
    leaflet.playerMarker.setLatLng([lat,lng]);
  }
}

// --- Mode toggle ---
const modeGridBtn = el("#modeGrid");
const modeHistBtn = el("#modeHist");
modeGridBtn.addEventListener("click", ()=>{ modeGridBtn.classList.add("active"); modeHistBtn.classList.remove("active"); lMapEl.hidden = true; mapEl.hidden = false; });
modeHistBtn.addEventListener("click", ()=>{ modeHistBtn.classList.add("active"); modeGridBtn.classList.remove("active"); mapEl.hidden = true; lMapEl.hidden = false; initLeaflet(); });

// --- Wiring ---
function renderAll(){ renderMap(); renderChar(); renderInv(); renderSkills(); renderMarket(); renderBiz(); if (selected) renderTile(); updateLeafletPlayer(); }

document.getElementById("saveBtn").addEventListener("click", save);
document.getElementById("resetBtn").addEventListener("click", reset);
document.getElementById("campBtn").addEventListener("click", camp);
document.getElementById("townBtn").addEventListener("click", ()=>{ /* nearest town in grid */ renderMap(); updateLeafletPlayer(); });
document.getElementById("prospectBtn").addEventListener("click", prospect);
document.getElementById("panBtn").addEventListener("click", pan);
document.getElementById("sluiceBtn").addEventListener("click", sluice);
document.getElementById("claimBtn").addEventListener("click", stakeClaim);
document.getElementById("zoom").addEventListener("input", (e)=>{
  const z = Number(e.target.value); const size = 14 * z; const gap = 2 * z;
  document.querySelectorAll(".tile").forEach(d=>{ d.style.width = `${size}px`; d.style.height = `${size}px`; });
  document.getElementById("map").style.gap = `${gap}px`;
});

if (!load()){ renderAll(); } else { renderAll(); }

console.log("Pay Dirt v3 with IIIF deep-zoom loaded.");
