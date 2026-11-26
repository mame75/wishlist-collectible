// Construit data/tcgp/<PREFIXE>.json : « CODE|rareté[|EA] » → n° de produit TCGplayer (photo de la carte)
// Source : tcgcsv.com, copie publique quotidienne du catalogue TCGplayer (catégorie 2 = Yu-Gi-Oh!)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const BASE = 'https://tcgcsv.com/tcgplayer/2';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url){
  for (let i = 0; i < 4; i++){
    try { const r = await fetch(url, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } });
      if (r.ok) return r.json(); } catch {}
    await sleep(1500 * (i + 1));
  }
  throw new Error('échec ' + url);
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const groups = (await get(`${BASE}/groups`)).results;
const out = {};
let done = 0;
const queue = groups.slice();
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length){
    const g = queue.shift();
    let res;
    try { res = (await get(`${BASE}/${g.groupId}/products`)).results || []; } catch { continue; }
    for (const p of res){
      const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
      const code = String(ex.Number || '').trim().toUpperCase();
      if (!/^[A-Z0-9]+-[A-Z]{0,2}\d+[A-Z]?$/.test(code) || !ex.Rarity || !p.imageCount) continue;
      const key = `${code}|${norm(ex.Rarity)}${/extended art/i.test(p.name) ? '|EA' : ''}`;
      const pre = code.split('-')[0];
      (out[pre] ||= {});
      if (!(key in out[pre])) out[pre][key] = p.productId;
    }
    if (++done % 100 === 0) console.log(done, '/', groups.length);
  }
}));
await mkdir('data/tcgp', { recursive: true });
let changed = 0;
for (const [pre, map] of Object.entries(out)){
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const txt = JSON.stringify(sorted);
  const f = `data/tcgp/${pre}.json`;
  const old = await readFile(f, 'utf8').catch(() => null);
  if (old !== txt){ await writeFile(f, txt); changed++; }
}
console.log('extensions :', Object.keys(out).length, '— fichiers modifiés :', changed);

// ---- Pokémon japonais (catégorie TCGplayer « Pokemon Japan ») : index par nom anglais de la carte
// data/tcgpj/<1re lettre>.json : nom normalisé → [[n° produit, extension, numéro, rareté, photo ?], …]
// Sert à retrouver les éditions OCG des cartes sans numéro de Pokédex (Dresseurs, Objets, Énergies…)
const cats = (await get('https://tcgcsv.com/tcgplayer/categories')).results || [];
const jp = cats.find(c => /pok[eé]mon japan/i.test(c.name || c.displayName || ''));
if (jp){
  const cleanName = s => String(s || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+[A-Z]*\d+\/[A-Z]*\d+\s*$/i, '').trim();
  const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const jgroups = (await get(`https://tcgcsv.com/tcgplayer/${jp.categoryId}/groups`)).results || [];
  const idx = {}, jg = {};   // jg : extension japonaise TCGplayer → cartes (pour le lien avec Cardmarket)
  const q = jgroups.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (q.length){
      const g = q.shift();
      let res; try { res = (await get(`https://tcgcsv.com/tcgplayer/${jp.categoryId}/${g.groupId}/products`)).results || []; } catch { continue; }
      for (const p of res){
        const ex = Object.fromEntries((p.extendedData || []).map(e => [e.name, e.value]));
        if (!ex.Number) continue;
        const k = key(cleanName(p.name)); if (!k) continue;
        const f = /[a-z]/.test(k[0]) ? k[0] : '0';
        // Numéro du nom (« Mew ex - 002/043 ») différent du champ Number (151/165) : réimpression d'un deck/coffret rangée dans l'extension du moment
        const nn = (p.name.match(/ - ([A-Z]*\d+\/[A-Z]*\d+)\s*$/) || [])[1], odd = nn && nn !== String(ex.Number).trim();
        ((idx[f] ||= {})[k] ||= []).push([p.productId, odd ? `Deck ou coffret (${g.name})` : g.name, odd ? nn : String(ex.Number), ex.Rarity || '', p.imageCount > 0 ? 1 : 0, /mirror|reverse/i.test(p.name) ? 1 : 0, ...(odd ? [String(ex.Number).trim()] : [])]);
        if (!/mirror|reverse/i.test(p.name)) (jg[g.groupId] ||= []).push({ pid: p.productId, k, num: parseInt(String(ex.Number), 10) || 0 });   // versions miroir : même produit Cardmarket (prix reverse)
      }
    }
  }));
  await mkdir('data/tcgpj', { recursive: true });
  for (const [f, m] of Object.entries(idx)) await writeFile(`data/tcgpj/${f}.json`, JSON.stringify(m));
  console.log('Pokémon japonais :', jgroups.length, 'extensions');

  // ---- Lien avec Cardmarket : data/cmjp/<tranche>.json (n° de produit TCGplayer japonais → n° de produit Cardmarket)
  // Extension Cardmarket = celle qui partage le plus de cartes (même nom anglais) avec l'extension TCGplayer, à taille comparable ;
  // versions d'une même carte : rangées par numéro chez TCGplayer, par n° de produit chez Cardmarket (V1, V2…)
  const pl = ((await get('https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json')) || {}).products || [];
  const ck = s => key(String(s || '').replace(/\s*\[.*?\]\s*/g, ' '));
  const byExp = {}, expsOf = {};
  for (const p of pl){ const k = ck(p.name); if (!k) continue;
    ((byExp[p.idExpansion] ||= {})[k] ||= []).push(p.idProduct);
    (expsOf[k] ||= new Set()).add(p.idExpansion); }
  const out = {};
  let linked = 0;
  for (const cards of Object.values(jg)){
    const names = new Set(cards.map(c => c.k));
    const score = {};
    for (const k of names) for (const e of expsOf[k] || []) score[e] = (score[e] || 0) + 1;
    let best = null, bj = 0;
    for (const [e, n] of Object.entries(score)){ const size = Object.keys(byExp[e]).length;
      const j = n / (names.size + size - n); if (j > bj){ bj = j; best = e; } }
    if (!best || bj < 0.5) continue;
    for (const k of names){
      const tp = cards.filter(c => c.k === k).sort((a, b) => a.num - b.num || a.pid - b.pid);
      const cm = (byExp[best][k] || []).slice().sort((a, b) => a - b);
      if (!cm.length || tp.length !== cm.length) continue;
      tp.forEach((c, i) => { (out[Math.floor(c.pid / 20000)] ||= {})[c.pid] = cm[i]; linked++; });
    }
  }
  await mkdir('data/cmjp', { recursive: true });
  for (const [b, m] of Object.entries(out)) await writeFile(`data/cmjp/${b}.json`, JSON.stringify(m));
  console.log('cartes japonaises reliées à Cardmarket :', linked);
}
