// Construit data/trending.json : cartes Pokémon et Yu-Gi-Oh! des extensions récentes dont le prix TCGplayer monte.
// Source : tcgcsv.com (copie publique du catalogue TCGplayer) et ses archives de prix quotidiennes
// (prix du marché aujourd'hui comparé à il y a 7 jours). Chaque carte est reliée à nos bases (TCGdex / YGOPRODeck)
// pour ouvrir sa page sur le site.
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url){
  for (let i = 0; i < 4; i++){
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 400 || r.status === 404) return null; } catch {}
    await sleep(1200 * (i + 1));
  }
  return null;
}
const day = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const TCG = 'https://tcgcsv.com/tcgplayer';
const MIN = 2;   // prix minimum ($) pour éviter le bruit des cartes communes

// ---- Archives de prix : la plus récente disponible et celle d'une semaine avant
async function archive(date){
  const f = `/tmp/prices-${date}.7z`;
  try {
    const r = await fetch(`https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`, { headers: UA });
    if (!r.ok) return null;
    await writeFile(f, Buffer.from(await r.arrayBuffer()));
    execSync(`7z x -y -o/tmp/arch ${f}`, { stdio: "ignore" });
    return date;
  } catch { return null; }
}
let now = null, then = null;
for (let d = 0; d < 4 && !now; d++) now = await archive(day(d));
if (!now) throw new Error('aucune archive de prix récente');
const nowDate = new Date(now + 'T00:00:00Z').getTime();
for (let d = 7; d < 10 && !then; d++) then = await archive(new Date(nowDate - d * 864e5).toISOString().slice(0, 10));
console.log('archives :', now, then);
async function prices(date, cat, group){
  if (!date) return {};
  const j = JSON.parse(await readFile(`/tmp/arch/${date}/${cat}/${group}/prices`, 'utf8').catch(() => '{}'));
  const out = {};
  for (const p of j.results || []) if (p.marketPrice > 0) out[`${p.productId}|${p.subTypeName}`] = p.marketPrice;
  return out;
}

// ---- Cartes des extensions récentes qui montent
async function movers(cat){
  const groups = ((await get(`${TCG}/${cat}/groups`)) || {}).results || [];
  const recent = groups.filter(g => !g.isSupplemental && g.publishedOn && g.publishedOn.slice(0, 10) <= now)
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn)).slice(0, 8);
  const list = [];
  for (const g of recent){
    const [prods, pNow, pThen] = await Promise.all([get(`${TCG}/${cat}/${g.groupId}/products`), prices(now, cat, g.groupId), prices(then, cat, g.groupId)]);
    for (const p of (prods && prods.results) || []){
      const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
      if (!ex.Number || !ex.Rarity) continue;   // pas une carte (booster, coffret…)
      // Version la plus chère de la carte (normale, holo, 1re édition…)
      let best = null;
      for (const [k, v] of Object.entries(pNow)){
        if (!k.startsWith(p.productId + '|')) continue;
        const old = pThen[k];
        if (!best || v > best.price) best = { price: v, change: old ? v / old - 1 : null };
      }
      if (!best || best.price < MIN || best.change == null) continue;
      list.push({ pid: p.productId, name: p.cleanName || p.name, number: String(ex.Number), rarity: ex.Rarity, set: g.name, ...best });
    }
    console.log(cat, g.name);
  }
  return list.sort((a, b) => b.change - a.change).slice(0, 16);
}

// ---- Liens avec nos bases
const clean = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+\d+\/\d+$/, '').trim();
async function linkYgo(c){
  const s = await get(`https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(c.number)}`);
  return s && s.id ? { id: s.id } : null;
}
async function linkPkm(c){
  const num = c.number.split('/')[0].replace(/^0+(?=\d)/, '');
  const list = await get(`https://api.tcgdex.net/v2/en/cards?name=eq:${encodeURIComponent(clean(c.name))}&localId=eq:${encodeURIComponent(num)}`);
  if (!Array.isArray(list) || !list.length) return null;
  if (list.length === 1) return { id: list[0].id };
  // Plusieurs extensions : celle dont le nom ressemble à l'extension TCGplayer
  const words = s => new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2));
  const gw = words(c.set);
  let best = null, score = -1;
  for (const b of list.slice(0, 8)){
    const d = await get(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(b.id)}`);
    const sw = words(d && d.set && d.set.name);
    const sc = [...sw].filter(w => gw.has(w)).length;
    if (sc > score){ score = sc; best = b.id; }
  }
  return best ? { id: best } : null;
}

const out = [];
for (const [cat, game, link] of [[3, 'pkm', linkPkm], [2, 'ygo', linkYgo]]){
  for (const c of (await movers(cat)).slice(0, 12)){
    const l = await link(c).catch(() => null);
    out.push({ game, id: l ? l.id : null, q: clean(c.name), name: clean(c.name), set: c.set, rarity: c.rarity, number: c.number,
      img: `https://tcgplayer-cdn.tcgplayer.com/product/${c.pid}_400w.jpg`, price: Math.round(c.price * 100) / 100, cur: 'USD', change: c.change });
  }
}
// Noms français quand ils existent
const fr = async c => {
  if (!c.id) return;
  if (c.game === 'pkm'){ const d = await get(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(c.id)}`); if (d && d.name) c.name = d.name; }
  else { const d = await get(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${c.id}&language=fr`); if (d && d.data && d.data[0]) c.name = d.data[0].name; }
};
for (const c of out) await fr(c).catch(() => {});
// Les deux jeux en alternance
const P = out.filter(c => c.game === 'pkm'), Y = out.filter(c => c.game === 'ygo'), cards = [];
for (let i = 0; i < Math.max(P.length, Y.length); i++){ if (P[i]) cards.push(P[i]); if (Y[i]) cards.push(Y[i]); }
await mkdir('data', { recursive: true });
await writeFile('data/trending.json', JSON.stringify({ updated: new Date().toISOString(), source: 'TCGplayer', from: then, to: now, cards }));
await rm('data/history-ygo.json', { force: true });
console.log('tendances :', cards.length);
