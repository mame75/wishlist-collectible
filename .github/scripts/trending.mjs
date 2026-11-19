// Construit data/trending.json : cartes Pokémon et Yu-Gi-Oh! des extensions récentes dont le prix TCGplayer monte.
// Source : tcgcsv.com (copie publique du catalogue TCGplayer) et ses archives de prix quotidiennes
// (prix du marché aujourd'hui comparé à il y a 7 jours). Chaque carte est reliée à nos bases (TCGdex / YGOPRODeck)
// pour ouvrir sa page sur le site.
import { writeFile, readFile, mkdir, rm, readdir } from 'node:fs/promises';
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
// Extensions récentes d'après nos bases (dates de sortie fiables), retrouvées par leur nom chez TCGplayer
const n = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
async function recentNames(cat){
  if (cat === 3){
    const sets = (await get('https://api.tcgdex.net/v2/en/sets')) || [];
    const det = [];
    for (const s of sets.slice(-20)){ const d = await get(`https://api.tcgdex.net/v2/en/sets/${encodeURIComponent(s.id)}`); if (d) det.push(d); }
    return det.filter(d => d.releaseDate && d.releaseDate <= now && (d.cardCount && d.cardCount.official) >= 60)
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 6).map(d => ({ name: d.name, tid: d.id }));
  }
  const ys = (await get('https://db.ygoprodeck.com/api/v7/cardsets.php')) || [];
  return ys.filter(s => s.tcg_date && s.tcg_date <= now && s.num_of_cards >= 20)
    .sort((a, b) => b.tcg_date.localeCompare(a.tcg_date)).slice(0, 8).map(s => ({ name: s.set_name }));
}
const stats = {};
async function movers(cat){
  const groups = ((await get(`${TCG}/${cat}/groups`)) || {}).results || [];
  let names = await recentNames(cat);
  if (!names.length){ await sleep(5000); names = await recentNames(cat); }   // base momentanément injoignable : on réessaie
  // « ME02: Phantasmal Flames » ↔ « Phantasmal Flames »
  const recent = names.map(x => { const g = groups.find(g => n(g.name) === n(x.name)) || groups.find(g => n(g.name).endsWith(' ' + n(x.name)));
    return g && { ...g, tid: x.tid }; }).filter(Boolean);
  stats[cat] = { names: names.map(x => x.name), groups: recent.map(g => g.name), cards: 0 };
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
        if (!best || v > best.price) best = { price: v, change: old ? v / old - 1 : null, sub: k.split('|')[1] };
      }
      if (!best || best.price < MIN || best.change == null) continue;
      stats[cat].cards++;
      list.push({ pid: p.productId, pimg: p.imageCount > 0, tid: g.tid, ea: /extended art/i.test(p.name), name: p.name, number: String(ex.Number), rarity: ex.Rarity, set: g.name, ...best });
    }
    console.log(cat, g.name);
  }
  return list.sort((a, b) => b.change - a.change).slice(0, 40);
}

// ---- Liens avec nos bases
// « Mega Golurk ex - 137/103 », « Rainbow Bridge Bifrost (Starlight Rare) » → nom de la carte
const clean = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+[A-Z]*\d+\/[A-Z]*\d+\s*$/i, '').replace(/\s+/g, ' ').trim();
async function linkYgo(c){
  const s = await get(`https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(c.number)}`);
  return s && s.id ? { id: s.id } : null;
}
async function linkPkm(c){
  const num = c.number.split('/')[0].replace(/^0+(?=\d)/, '');
  const all = await get(`https://api.tcgdex.net/v2/en/cards?name=eq:${encodeURIComponent(clean(c.name))}`);
  const list = (Array.isArray(all) ? all : []).filter(b => Number(b.localId) === Number(num));
  if (!list.length) return null;
  const same = c.tid && list.find(b => b.id.startsWith(c.tid + '-'));   // même extension que chez TCGplayer
  if (same || list.length === 1) return { id: (same || list[0]).id };
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
  const seen = new Set(); let k = 0;
  for (const c of await movers(cat)){
    if (k >= 12) break;
    const l = await link(c).catch(() => null);
    const key = l ? l.id : clean(c.name);
    if (seen.has(key)) continue;   // une seule fois par carte (la rareté qui monte le plus)
    seen.add(key); k++;
    out.push({ game, id: l ? l.id : null, q: clean(c.name), name: clean(c.name), set: c.set, rarity: c.rarity, number: c.number, ea: c.ea, sub: c.sub,
      img: c.pimg ? `https://tcgplayer-cdn.tcgplayer.com/product/${c.pid}_400w.jpg` : null,
      fb: game === 'ygo' && l ? `https://images.ygoprodeck.com/images/cards_small/${l.id}.jpg` : null, price: Math.round(c.price * 100) / 100, cur: 'USD', change: c.change });
  }
}
// Noms français quand ils existent
const fr = async c => {
  if (!c.id) return;
  if (c.game === 'pkm'){ const d = await get(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(c.id)}`);
    if (d && d.name) c.name = d.name; if (d && d.image) c.fb = d.image + '/low.webp'; }
  else { const d = await get(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${c.id}&language=fr`) || await get(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${c.id}`);
    if (d && d.data && d.data[0]) c.name = d.data[0].name; }
};
for (const c of out){ await fr(c).catch(() => {}); if (!c.img){ c.img = c.fb; c.fb = null; } }   // pas de photo TCGplayer : visuel de nos bases
// Les deux jeux en alternance
// Si un jeu n'a rien donné aujourd'hui (base injoignable), on garde ses tendances de la veille
const prev = JSON.parse(await readFile('data/trending.json', 'utf8').catch(() => '{}')).cards || [];
let P = out.filter(c => c.game === 'pkm'), Y = out.filter(c => c.game === 'ygo');
if (!P.length) P = prev.filter(c => c.game === 'pkm');
if (!Y.length) Y = prev.filter(c => c.game === 'ygo');
const cards = [];
for (let i = 0; i < Math.max(P.length, Y.length); i++){ if (P[i]) cards.push(P[i]); if (Y[i]) cards.push(Y[i]); }
await mkdir('data', { recursive: true });
await writeFile('data/trending.json', JSON.stringify({ updated: new Date().toISOString(), source: 'TCGplayer', from: then, to: now, stats, cards }));
await rm('data/history-ygo.json', { force: true });

// ---- Prix TCGplayer de toutes les impressions Yu-Gi-Oh! : data/tcgpx/<PRÉFIXE>.json
// « CODE|rareté[|EA] » → [prix du marché ($), évolution sur 7 jours] — même clé que data/tcgp (photos)
const pidMap = {};
for (const f of await readdir('data/tcgp').catch(() => [])){
  const m = JSON.parse(await readFile('data/tcgp/' + f, 'utf8').catch(() => '{}'));
  for (const [k, pid] of Object.entries(m)) pidMap[pid] = [f.replace(/\.json$/, ''), k];
}
async function readAll(date){
  const out = {}; if (!date) return out;
  const base = `/tmp/arch/${date}/2`;
  for (const g of await readdir(base).catch(() => [])){
    const j = JSON.parse(await readFile(`${base}/${g}/prices`, 'utf8').catch(() => '{}'));
    for (const p of j.results || []) if (p.marketPrice > 0) (out[p.productId] ||= {})[p.subTypeName] = p.marketPrice;
  }
  return out;
}
const A = await readAll(now), B = await readAll(then), px = {};
for (const [pid, subs] of Object.entries(A)){
  const m = pidMap[pid]; if (!m) continue;
  const [sub, v] = Object.entries(subs).sort((a, b) => b[1] - a[1])[0];   // version la plus chère (1re édition…)
  const old = B[pid] && B[pid][sub];
  (px[m[0]] ||= {})[m[1]] = [Math.round(v * 100) / 100, old ? Math.round((v / old - 1) * 1000) / 1000 : null];
}
await rm('data/tcgpx', { recursive: true, force: true });
await mkdir('data/tcgpx', { recursive: true });
for (const [pre, m] of Object.entries(px)) await writeFile(`data/tcgpx/${pre}.json`, JSON.stringify(m));
console.log('prix Yu-Gi-Oh! :', Object.keys(px).length, 'extensions');
console.log('tendances :', cards.length);
