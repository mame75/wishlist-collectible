// Construit data/trending.json : cartes Pokémon et Yu-Gi-Oh! des extensions récentes dont le prix Cardmarket monte.
// Pokémon : TCGdex (moyenne 7 j vs 30 j de Cardmarket). Yu-Gi-Oh! : YGOPRODeck, comparé à notre propre historique
// (data/history-ygo.json, un relevé par jour) ; tant qu'il manque une semaine d'historique, on prend les cartes les plus chères.
import { writeFile, readFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url){
  for (let i = 0; i < 4; i++){
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); if (r.status === 400 || r.status === 404) return null; } catch {}
    await sleep(1200 * (i + 1));
  }
  return null;
}
async function mapLimit(items, n, fn){
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length){ const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}
const today = new Date().toISOString().slice(0, 10);
const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const MIN = 2;   // prix minimum (€) pour éviter le bruit des cartes communes
// Les plus fortes hausses d'abord ; sans historique (Yu-Gi-Oh! la première semaine), les cartes les plus chères
const rank = list => {
  const ok = list.filter(c => c.price >= MIN);
  const moving = ok.filter(c => c.change != null).sort((a, b) => b.change - a.change);
  const rest = ok.filter(c => c.change == null).sort((a, b) => b.price - a.price);
  return moving.length >= 12 ? moving : [...moving.filter(c => c.change > 0), ...rest, ...moving.filter(c => c.change <= 0)];
};

// ---- Pokémon
const psets = (await get('https://api.tcgdex.net/v2/fr/sets')) || [];
const pdet = (await mapLimit(psets.slice(-16), 4, s => get(`https://api.tcgdex.net/v2/fr/sets/${encodeURIComponent(s.id)}`))).filter(Boolean)
  .filter(s => s.releaseDate && s.releaseDate <= today).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 6);
const pk = [];
for (const s of pdet){
  const cards = await mapLimit(s.cards || [], 8, c => get(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(c.id)}`));
  for (const c of cards){
    if (!c || !c.image) continue;
    const cm = (c.pricing && c.pricing.cardmarket) || {};
    const n = k => { const v = Number(cm[k]); return v > 0 ? v : null; };
    const a7 = n('avg7'), a30 = n('avg30'), price = n('low') ?? n('avg1') ?? a7;
    if (!price) continue;
    pk.push({ game: 'pkm', id: c.id, name: c.name, set: s.name, img: c.image + '/low.webp', price, change: a7 && a30 ? a7 / a30 - 1 : null });
  }
  console.log('Pokémon', s.name, cards.length);
}

// ---- Yu-Gi-Oh!
const ysets = (await get('https://db.ygoprodeck.com/api/v7/cardsets.php')) || [];
const yrec = ysets.filter(s => s.tcg_date && s.tcg_date <= today && s.num_of_cards >= 20)
  .sort((a, b) => b.tcg_date.localeCompare(a.tcg_date)).slice(0, 6);
const hist = JSON.parse(await readFile('data/history-ygo.json', 'utf8').catch(() => '{}'));
const keep = {}, yg = [], seen = new Set();
for (const s of yrec){
  const [en, fr] = await Promise.all([
    get(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(s.set_name)}`),
    get(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(s.set_name)}&language=fr`)
  ]);
  const frName = Object.fromEntries(((fr && fr.data) || []).map(c => [c.id, c.name]));
  for (const c of (en && en.data) || []){
    if (seen.has(c.id)) continue; seen.add(c.id);
    const price = Number(c.card_prices && c.card_prices[0] && c.card_prices[0].cardmarket_price) || null;
    if (!price) continue;
    const h = (hist[c.id] || []).filter(x => x[0] !== today);
    h.push([today, price]); keep[c.id] = h.slice(-30);
    const ref = h.filter(x => x[0] <= daysAgo(6)).pop();   // relevé d'il y a environ une semaine
    yg.push({ game: 'ygo', id: c.id, name: frName[c.id] || c.name, set: s.set_name,
      img: `https://images.ygoprodeck.com/images/cards_small/${c.id}.jpg`, price, change: ref ? price / ref[1] - 1 : null });
  }
  console.log('Yu-Gi-Oh!', s.set_name, (en && en.data || []).length);
}

// ---- Mélange des deux jeux (12 + 12, en alternance)
const P = rank(pk).slice(0, 12), Y = rank(yg).slice(0, 12), cards = [];
for (let i = 0; i < Math.max(P.length, Y.length); i++){ if (P[i]) cards.push(P[i]); if (Y[i]) cards.push(Y[i]); }
await mkdir('data', { recursive: true });
await writeFile('data/trending.json', JSON.stringify({ updated: new Date().toISOString(), cards }));
await writeFile('data/history-ygo.json', JSON.stringify(keep));
console.log('tendances :', cards.length);
