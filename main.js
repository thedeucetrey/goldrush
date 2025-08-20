// Pay Dirt — local prototype. No frameworks; GitHub Pages-friendly.
// World: deterministic generation via seeded RNG. Client-only for now.

const WORLD = { width: 64, height: 48, seed: 1849 };
const TERRAINS = ["plains","forest","river","mountain"];
const EQUIPMENT = {
  pan: { name: "Pan", price: 20, yield: 1.0 },
  shovel: { name: "Shovel", price: 60, yield: 1.15 },
  pickaxe: { name: "Pickaxe", price: 100, yield: 1.25 },
  rocker: { name: "Rocker", price: 220, yield: 1.45 },
  sluice: { name: "Sluice", price: 400, yield: 1.7 },
  mule: { name: "Pack Mule", price: 180, cap: 250 }
};

// --- Utilities: seeded RNG (xmur3 + mulberry32) ---
function xmur3(str){ for(var i=0,h=1779033703^str.length;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=h<<13|h>>>19 } return function(){ h=Math.imul(h^h>>>16,2246822507); h=Math.imul(h^h>>>13,3266489909); return (h^h>>>16)>>>0 } }
function mulberry32(a){ return function(){ var t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296 } }
const hash = xmur3(String(WORLD.seed));
const randBase = mulberry32(hash());

function seeded(x,y){ // a simple coordinate-based RNG
  const h = xmur3(`${WORLD.seed}:${x},${y}`)();
  return mulberry32(h)();
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

// --- World generation ---
function genTile(x,y){
  const r = seeded(x,y);
  // crude river bands: sine curve
  const riverBand = Math.sin((x/10)) * 3 + (WORLD.height/2 - 2);
  const distToRiver = Math.abs(y - riverBand);
  let terrain = "plains";
  if (distToRiver < 0.8) terrain = "river";
  else if (r < 0.15) terrain = "forest";
  else if (r > 0.85) terrain = "mountain";

  // base gold density higher near rivers/mountains
  let goldDensity = 0;
  if (terrain === "river") goldDensity = 0.55 + (0.45 * (0.8 - distToRiver));
  else if (terrain === "mountain") goldDensity = 0.35 + (r * 0.2);
  else if (terrain === "forest") goldDensity = 0.18 + (r * 0.12);
  else goldDensity = 0.1 + (r * 0.1);
  goldDensity = clamp(goldDensity, 0, 0.95);

  // total grams present (procedural) — small placer deposits
  const deposit = Math.floor(goldDensity * 120) + (r > 0.97 ? 100 : 0);
  const town = (x===Math.floor(WORLD.width*0.15) && y===Math.floor(WORLD.height*0.7))
            || (x===Math.floor(WORLD.width*0.8) && y===Math.floor(WORLD.height*0.3));

  return {
    x,y, terrain: town ? "town" : terrain,
    discovered: false,
    claimedBy: null,
    goldRemaining: town ? 0 : deposit, // grams
    difficulty: terrain === "mountain" ? 1.25 : terrain === "river" ? 0.9 : 1.0,
  };
}

let world = {
  tiles: [],
  pricePerGram: 20,   // dollars per gram; floats with supply/demand
  lastPrice: 20,
  supplyPressure: 0,  // grams sold recently
  demandPressure: 0,  // equipment bought recently
};

function buildWorld(){
  world.tiles = new Array(WORLD.height);
  for (let y=0;y<WORLD.height;y++){
    world.tiles[y] = new Array(WORLD.width);
    for (let x=0;x<WORLD.width;x++){ world.tiles[y][x] = genTile(x,y); }
  }
}
buildWorld();

// --- Player ---
function newID(){ return crypto.getRandomValues(new Uint32Array(1))[0].toString(16)+Date.now().toString(16); }
const initialPlayer = () => ({
  id: newID(),
  name: "Argonaut",
  money: 50,
  stamina: 100, maxStamina: 100,
  encumbrance: 0, maxCarry: 100,
  inventory: { gold_dust: 0 },
  equipment: { pan: true },
  skills: {
    prospecting: { xp: 0, lvl: 1 },
    panning: { xp: 0, lvl: 1 },
    excavation: { xp: 0, lvl: 1 },
    trading: { xp: 0, lvl: 1 },
    fitness: { xp: 0, lvl: 1 },
  },
  pos: { x: Math.floor(WORLD.width*0.18), y: Math.floor(WORLD.height*0.68) }, // start near town
  claims: [],
});

let player = initialPlayer();

// --- Persistence ---
function save(){
  localStorage.setItem("paydirt_save", JSON.stringify({ world, player }));
  status("Saved.");
}
function load(){
  const s = localStorage.getItem("paydirt_save");
  if (!s) return false;
  try {
    const data = JSON.parse(s);
    world = data.world; player = data.player;
    status("Loaded local save.");
    return true;
  } catch(e){ console.warn(e); return false; }
}
function reset(){
  localStorage.removeItem("paydirt_save");
  buildWorld(); player = initialPlayer(); renderAll(); status("Reset.");
}

// --- Level calc ---
function levelFromXP(xp){
  // gentle curve: lvl 1 at 0xp, lvl 2 at 50xp, lvl 5 at ~600xp
  return Math.floor(1 + Math.sqrt(xp) / 7);
}
function gainXP(skill, amount){
  player.skills[skill].xp += amount;
  player.skills[skill].lvl = levelFromXP(player.skills[skill].xp);
}

// --- UI rendering ---
const el = (sel) => document.querySelector(sel);
const mapEl = el("#map");
const tileCard = el("#tileCard");
const tileInfo = el("#tileInfo");
const actionLog = el("#actionLog");
let selected = null;

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
      if (player.pos.x===x && player.pos.y===y){
        d.style.outline = "2px solid #16a34a";
      }
      mapEl.appendChild(d);
    }
  }
}
function selectTile(x,y, node){
  selected = world.tiles[y][x];
  for (const c of mapEl.children) c.classList.remove("selected");
  node.classList.add("selected");
  selected.discovered = true;
  tileCard.hidden = false;
  renderTile();
}
function renderTile(){
  const t = selected;
  const claimed = t.claimedBy ? "Yes" : "No";
  tileInfo.innerHTML = `
    <div class="kv">
      <div><span>Coords</span><span class="stat">(${t.x}, ${t.y})</span></div>
      <div><span>Terrain</span><span>${t.terrain}</span></div>
      <div><span>Gold left</span><span class="stat">${t.goldRemaining} g</span></div>
      <div><span>Claimed</span><span>${claimed}</span></div>
      <div><span>Difficulty</span><span class="stat">${t.difficulty.toFixed(2)}×</span></div>
    </div>`;
  // action buttons enablement
  el("#prospectBtn").disabled = t.terrain==="town" || player.stamina<5;
  el("#panBtn").disabled = t.terrain!=="river" || player.stamina<4;
  el("#sluiceBtn").disabled = !player.equipment.sluice || t.terrain!=="river" || player.stamina<8;
  el("#claimBtn").disabled = !!t.claimedBy || (t.goldRemaining<10);
}
function renderChar(){
  el("#charInfo").innerHTML = `
    <div class="kv">
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
  for (const k of Object.keys(player.equipment)){
    if (player.equipment[k]) items.push(`<span class="badge">${EQUIPMENT[k].name}</span>`);
  }
  el("#inv").innerHTML = items.join(" ");
}
function renderSkills(){
  const rows = Object.entries(player.skills).map(([k,v])=>{
    return `<div><span>${k}</span><span class="stat">Lv ${v.lvl} (${v.xp} xp)</span></div>`;
  }).join("");
  el("#skills").innerHTML = `<div class="kv">${rows}</div>`;
}
function renderMarket(){
  const delta = world.pricePerGram - world.lastPrice;
  el("#market").innerHTML = `
    <div class="kv">
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
  el("#biz").innerHTML = `
    <p>Create a <strong>General Store</strong> (prototype): Buy low, sell high. NPC demand will occasionally purchase items.</p>
    <div class="row gap">
      <button id="openStoreBtn">Open Store ($150)</button>
      <button id="tunePricesBtn">Tune Prices</button>
    </div>
    <div id="storePanel"></div>
  `;
  el("#openStoreBtn").addEventListener("click", openStore);
  el("#tunePricesBtn").addEventListener("click", tunePrices);
  updateStorePanel();
}
function updateStorePanel(){
  if (!player.store) { el("#storePanel").innerHTML = `<em>No store yet.</em>`; return; }
  const s = player.store;
  el("#storePanel").innerHTML = `
    <div class="kv">
      <div><span>Cash on hand</span><span class="stat">$${s.cash.toFixed(2)}</span></div>
      <div><span>Inventory (pan)</span><span class="stat">${s.stock.pan||0}</span></div>
      <div><span>Pan price</span><span class="stat">$${s.prices.pan.toFixed(2)}</span></div>
    </div>
    <div class="row gap" style="margin-top:8px">
      <button id="buyForStore" ${player.money< E EQUIPMENT.pan.price ? 'disabled':''}>Buy pan wholesale ($${EQUIPMENT.pan.price})</button>
      <button id="simulateDemand">Simulate NPC demand</button>
    </div>
  `;
  el("#buyForStore")?.addEventListener("click", ()=>{
    if (player.money >= EQUIPMENT.pan.price){
      player.money -= EQUIPMENT.pan.price;
      player.store.stock.pan = (player.store.stock.pan||0)+1;
      player.store.cash -= EQUIPMENT.pan.price; // cost recorded
      renderAll();
    }
  });
  el("#simulateDemand")?.addEventListener("click", simulateDemand);
}

// --- Market logic ---
function sellGold(){
  if (player.inventory.gold_dust <= 0) return;
  const grams = player.inventory.gold_dust;
  world.lastPrice = world.pricePerGram;
  const proceeds = grams * world.pricePerGram;
  player.money += proceeds;
  player.inventory.gold_dust = 0;
  world.supplyPressure += grams;
  // price impact (very simple): more supply lowers price; demand pushes up slowly
  const change = (-0.01 * grams) + (0.005 * world.demandPressure) + (Math.random()-0.5)*0.5;
  world.pricePerGram = clamp(world.pricePerGram + change, 5, 120);
  log(`Sold ${grams.toFixed(1)} g for $${proceeds.toFixed(2)}. Price now $${world.pricePerGram.toFixed(2)}/g.`);
  renderAll();
}

function buyEquip(key){
  const item = EQUIPMENT[key];
  if (!item) return;
  if (player.money < item.price){ status("Not enough money."); return; }
  player.money -= item.price;
  player.equipment[key] = true;
  world.demandPressure += 1;
  log(`Bought ${item.name}.`);
  renderAll();
}

// --- Actions ---
function ensureSelected(){ if (!selected){ status("Select a tile first."); return false;} return true; }
function spendStamina(n){ if (player.stamina < n) return false; player.stamina -= n; return true; }

function prospect(){
  if (!ensureSelected()) return;
  const t = selected;
  if (t.terrain==="town"){ status("Can't prospect in town."); return; }
  if (!spendStamina(6)) { status("Too tired."); return; }
  const skill = player.skills.prospecting.lvl;
  const toolBoost = (player.equipment.pickaxe?1.15:1.0) * (player.equipment.shovel?1.05:1.0);
  const effort = 1 * toolBoost * (1 + skill*0.02) / t.difficulty;
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*3,t.y*5)*8 + Math.random()*4) * effort)));
  if (found > 0){
    t.goldRemaining -= found;
    player.inventory.gold_dust += found;
    player.encumbrance += found/1000; // 1g ~ 0.001kg
    gainXP("prospecting", 6 + Math.floor(found/2));
    log(`Prospected and found ${found} g.`);
  } else {
    log("Prospected and found nothing.");
    gainXP("prospecting", 2);
  }
  renderTile(); renderInv(); renderSkills();
}

function pan(){
  if (!ensureSelected()) return;
  const t = selected;
  if (t.terrain!=="river"){ status("Panning works best in rivers."); return; }
  if (!spendStamina(5)) { status("Too tired."); return; }
  const skill = player.skills.panning.lvl;
  const toolBoost = (player.equipment.pan?1.0:0.8) * (player.equipment.rocker?1.2:1.0);
  const effort = 1.0 * toolBoost * (1 + skill*0.03);
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*7,t.y*9)*6 + Math.random()*3) * effort)));
  if (found > 0){
    t.goldRemaining -= found;
    player.inventory.gold_dust += found;
    player.encumbrance += found/1000;
    gainXP("panning", 8 + Math.floor(found/2));
    log(`Panned and found ${found} g.`);
  } else {
    log("Panned and found nothing.");
    gainXP("panning", 2);
  }
  renderTile(); renderInv(); renderSkills();
}

function sluice(){
  if (!ensureSelected()) return;
  const t = selected;
  if (t.terrain!=="river"){ status("Sluicing requires flowing water."); return; }
  if (!player.equipment.sluice){ status("You need a sluice."); return; }
  if (!spendStamina(10)) { status("Too tired."); return; }
  const skill = (player.skills.panning.lvl + player.skills.excavation.lvl)/2;
  const effort = 2.0 * (1 + skill*0.04);
  let found = Math.min(t.goldRemaining, Math.max(0, Math.round((seeded(t.x*11,t.y*13)*12 + Math.random()*5) * effort)));
  if (found > 0){
    t.goldRemaining -= found;
    player.inventory.gold_dust += found;
    player.encumbrance += found/1000;
    gainXP("panning", 10 + Math.floor(found/2));
    gainXP("excavation", 5 + Math.floor(found/3));
    log(`Sluiced and found ${found} g.`);
  } else {
    log("Sluiced and found nothing.");
    gainXP("panning", 3); gainXP("excavation", 3);
  }
  renderTile(); renderInv(); renderSkills();
}

function stakeClaim(){
  if (!ensureSelected()) return;
  const t = selected;
  if (t.claimedBy){ status("Already claimed."); return; }
  if (t.goldRemaining < 10){ status("Not worth claiming."); return; }
  if (player.money < 15){ status("Claim filing costs $15."); return; }
  player.money -= 15;
  t.claimedBy = player.id;
  player.claims.push({ x: t.x, y: t.y, filed: Date.now() });
  log("Claim staked!");
  renderAll();
}

// --- Town / Rest ---
function camp(){
  const gain = Math.min(player.maxStamina - player.stamina, 40);
  player.stamina += gain;
  gainXP("fitness", 2);
  status(`Restored ${gain} stamina.`);
  renderChar();
}
function goTown(){
  // teleport to nearest town tile (prototype)
  let nearest = { x:0, y:0, d:1e9 };
  for (let y=0;y<WORLD.height;y++){
    for (let x=0;x<WORLD.width;x++){
      const t = world.tiles[y][x];
      if (t.terrain==="town"){
        const d = Math.hypot(player.pos.x-x, player.pos.y-y);
        if (d < nearest.d){ nearest = { x, y, d }; }
      }
    }
  }
  player.pos = { x: nearest.x, y: nearest.y };
  renderMap();
}

// --- Store (prototype business) ---
function openStore(){
  if (player.store){ status("You already run a store."); return; }
  if (player.money < 150){ status("Need $150 to open."); return; }
  player.money -= 150;
  player.store = { cash: 0, stock: { pan: 0 }, prices: { pan: 45 } };
  renderAll();
}
function tunePrices(){
  if (!player.store){ status("Open a store first."); return; }
  const p = prompt("Pan price ($)", String(player.store.prices.pan));
  if (!p) return;
  const v = Number(p);
  if (isFinite(v) && v > 0){ player.store.prices.pan = v; renderAll(); }
}
function simulateDemand(){
  if (!player.store) return;
  const s = player.store;
  // very simple: chance to sell depends on markup vs equipment base price
  const markup = s.prices.pan / EQUIPMENT.pan.price;
  const demand = clamp(1.5 - (markup-1.0)*1.2, 0.05, 1.2); // higher price -> lower demand
  const rolls = Math.floor(1 + Math.random()*3);
  let sold = 0;
  for (let i=0;i<rolls;i++){
    if ((Math.random()) < demand && (s.stock.pan||0) > 0){
      s.stock.pan--; s.cash += s.prices.pan; sold++;
    }
  }
  world.demandPressure += sold*0.5;
  log(`NPCs bought ${sold} pan(s). Store cash +$${(sold*s.prices.pan).toFixed(2)}.`);
  renderAll();
}

// --- Logging & status ---
function log(msg){
  const p = document.createElement("div");
  const ts = new Date().toLocaleTimeString();
  p.textContent = `[${ts}] ${msg}`;
  actionLog.prepend(p);
}
function status(msg){
  const s = document.getElementById("status");
  s.textContent = msg;
  setTimeout(()=> s.textContent="", 2500);
}

// --- Wiring ---
function renderAll(){
  renderMap(); renderChar(); renderInv(); renderSkills(); renderMarket(); renderBiz();
  if (selected) renderTile();
}

document.getElementById("saveBtn").addEventListener("click", save);
document.getElementById("resetBtn").addEventListener("click", reset);
document.getElementById("campBtn").addEventListener("click", camp);
document.getElementById("townBtn").addEventListener("click", goTown);
document.getElementById("prospectBtn").addEventListener("click", prospect);
document.getElementById("panBtn").addEventListener("click", pan);
document.getElementById("sluiceBtn").addEventListener("click", sluice);
document.getElementById("claimBtn").addEventListener("click", stakeClaim);

document.getElementById("zoom").addEventListener("input", (e)=>{
  const z = Number(e.target.value);
  const size = 14 * z;
  const gap = 2 * z;
  document.querySelectorAll(".tile").forEach(d=>{
    d.style.width = `${size}px`; d.style.height = `${size}px`;
  });
  document.getElementById("map").style.gap = `${gap}px`;
});

// Attempt load from localStorage, else start fresh
if (!load()){ renderAll(); } else { renderAll(); }

console.log("Pay Dirt prototype loaded.");
