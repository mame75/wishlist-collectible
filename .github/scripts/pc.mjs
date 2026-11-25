// Visuels PriceCharting (images seulement, pas les prix : ce sont les données qu'ils vendent).
// 1) Cartes japonaises encore sans visuel (ni photo TCGplayer, ni TCG Republic) : data/pcj.json
//    { "<extension TCGplayer>|<n°>": [id image, nom PriceCharting, page PriceCharting] }
// 2) Cartes anglaises de l'époque Wizards : vrai visuel 1re édition et édition illimitée : data/pced.json
//    { "<id TCGdex>": { "1st": id image, "unl": id image } }
// Une image n'est gardée que si le nom anglais ET le numéro correspondent. Une page par seconde.
import { readFile, readdir, writeFile } from 'node:fs/promises';

const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const BASE = 'https://www.pricecharting.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(url, body){
  for (let k = 0; k < 3; k++){
    try {
      const r = await fetch(url, body ? { method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' }, body } : { headers: UA });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {}
    await sleep(4000 * (k + 1));
  }
  return null;
}
const key = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const stem = w => w.slice(0, 5);
const words = s => String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/%27/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter(w => w && !['the', 'of', 'and', 'a', 'to', 'pokemon', 'japanese', 'pack', 'expansion', 'card', 'ex', 'amp'].includes(w)).map(stem);
const num = s => parseInt(String(s).split('/')[0], 10);

// Toutes les cartes d'une extension PriceCharting (pagination : formulaire « cursor »)
async function setRows(slug){
  const rows = [], seen = new Set(), raw = [];
  let cursor = null;
  for (let p = 0; p < 30; p++){
    const html = await req(`${BASE}/console/${slug}`, cursor ? `cursor=${cursor}` : null);
    await sleep(1000);
    if (!html) break;
    let fresh = 0;
    for (const chunk of html.split('<tr id="product-').slice(1)){
      const id = chunk.match(/^(\d+)/)?.[1];
      if (!id || seen.has(id)) continue;
      seen.add(id); fresh++;
      const t = chunk.match(/<td class="title"[^>]*>\s*<a href="([^"]+)">([^<]+)<\/a>/);
      const img = chunk.match(/images\.pricecharting\.com\/([^/"]+)\/\d+\.jpg/)?.[1] || null;
      if (!t) continue;
      const title = t[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
      raw.push({ title, img, href: t[1] });
      const m = title.match(/^(.*?)\s*(?:\[([^\]]+)\])?\s*#\s*([A-Za-z]*\d+)\s*$/);
      if (m) rows.push({ id, name: m[1].trim(), variant: (m[2] || '').trim(), n: parseInt(m[3].replace(/^[A-Za-z]+/, ''), 10), img, href: t[1] });
    }
    const next = html.match(/name="cursor" value="(\d+)"/)?.[1];
    if (!fresh || !next || next === cursor) break;
    cursor = next;
  }
  rows.raw = raw;
  return rows;
}

// Extensions PriceCharting (liste de la catégorie Pokémon)
const cat = await req(`${BASE}/category/pokemon-cards`);
if (!cat){ console.log('PriceCharting injoignable'); process.exit(0); }
const consoles = [...new Set([...cat.matchAll(/href="\/console\/([^"?#]+)"/g)].map(m => m[1].replace(/&amp;/g, '%26')))];
const jpCons = consoles.filter(c => c.startsWith('pokemon-japanese-')).map(c => ({ slug: c, w: words(decodeURIComponent(c).replace(/^pokemon-japanese-/, '').replace(/-/g, ' ')) }));
// Mots équivalents : identiques ou l'un préfixe de l'autre (« Fest » ↔ « Festival », « Revival » ↔ « Reviving »)
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const has = (list, x) => list.some(y => same(x, y));
const slugify = s => String(s).toLowerCase().replace(/&/g, '&amp;').replace(/'/g, '%27').replace(/[^a-z0-9&;%]+/g, '-').replace(/^-|-$/g, '');

// ---------- 1) Cartes japonaises sans visuel ----------
const trj = JSON.parse(await readFile('data/trj.json', 'utf8').catch(() => '{}'));
const need = {};   // extension → { n° → { names, mirror } }
let total = 0;
for (const f of await readdir('data/tcgpj')){
  const idx = JSON.parse(await readFile(`data/tcgpj/${f}`, 'utf8'));
  for (const [k, list] of Object.entries(idx)) for (const [, set, n, , photo, mirror] of list){
    if (photo || trj[`${set}|${n}`]) continue;
    const e = ((need[set] ||= {})[n] ||= { names: new Set(), mirror: false });
    if (!e.names.size) total++;
    e.names.add(k); if (mirror) e.mirror = true;
  }
}
function matchJp(set){
  const bare = set.replace(/^[A-Za-z0-9+-]+:\s/, '');
  const w = words(bare);
  if (!w.length) return [];
  const cand = jpCons.map(c => [c.slug, w.filter(x => has(c.w, x)).length / w.length, c.w.length]).filter(x => x[1] === 1).sort((a, b) => a[2] - b[2]).map(x => x[0]);
  const guess = `pokemon-japanese-${slugify(bare)}`;
  return [...new Set([...cand.slice(0, 1), guess])];
}
// Extension absente de la liste : recherche PriceCharting (« Revival Legends » → pokemon-japanese-reviving-legends)
async function searchJp(set, sample){
  const bare = set.replace(/^[A-Za-z0-9+-]+:\s/, '');
  const html = await req(`${BASE}/search-products?type=prices&q=${encodeURIComponent(`${sample} pokemon japanese ${bare}`)}`);
  await sleep(1000);
  if (!html) return null;
  const w = words(bare);
  const slugs = [...new Set([...html.matchAll(/\/(?:game|console)\/(pokemon-japanese-[^/"?#]+)/g)].map(m => m[1]))];
  const best = slugs.map(s => [s, w.filter(x => has(words(s.replace(/^pokemon-japanese-/, '').replace(/-/g, ' ')), x)).length / (w.length || 1)]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 0.5 ? best[0] : null;
}
const pcj = {}, logJ = [];
for (const [set, cards] of Object.entries(need)){
  let rows = [], used = null;
  for (const slug of matchJp(set)){ rows = await setRows(slug); if (rows.length){ used = slug; break; } }
  if (!rows.length){ const s = await searchJp(set, [...Object.values(cards)[0].names][0]); if (s){ rows = await setRows(s); if (rows.length) used = s; } }
  let ok = 0;
  for (const [n, e] of Object.entries(cards)){
    const pool = rows.filter(r => r.img && r.n === num(n) && [...e.names].some(k => key(r.name) === k));
    const plain = pool.find(r => !r.variant) || pool.find(r => !/mirror|reverse|1st/i.test(r.variant)) || pool[0];
    if (plain){ pcj[`${set}|${n}`] = [plain.img, plain.name + (plain.variant ? ` [${plain.variant}]` : ''), plain.href]; ok++; }
  }
  logJ.push([set, used, `${ok}/${Object.keys(cards).length}`]);
}
await writeFile('data/pcj.json', JSON.stringify(pcj));

// ---------- 2) Anglais, époque Wizards : 1re édition / illimitée ----------
const WOTC = { base1: 'pokemon-base-set', base2: 'pokemon-jungle', base3: 'pokemon-fossil', base5: 'pokemon-team-rocket',
  gym1: 'pokemon-gym-heroes', gym2: 'pokemon-gym-challenge', neo1: 'pokemon-neo-genesis', neo2: 'pokemon-neo-discovery',
  neo3: 'pokemon-neo-revelation', neo4: 'pokemon-neo-destiny' };
const pced = {}; let edCards = 0, edBoth = 0;
for (const [sid, slug] of Object.entries(WOTC)){
  const set = await fetch(`https://api.tcgdex.net/v2/en/sets/${sid}`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (!set) continue;
  // La 1re édition du Set de base est une extension à part chez PriceCharting
  const rows = [...await setRows(slug), ...(sid === 'base1' ? (await setRows('pokemon-base-set-1st-edition')).map(r => ({ ...r, variant: r.variant || '1st Edition' })) : [])];
  for (const c of set.cards || []){
    const n = parseInt(c.localId, 10);
    const pool = rows.filter(r => r.img && r.n === n && key(r.name) === key(c.name));
    const first = pool.find(r => /^1st edition$/i.test(r.variant)), unl = pool.find(r => !r.variant);
    if (!first && !unl) continue;
    edCards++; if (first && unl) edBoth++;
    pced[c.id] = { ...(first ? { '1st': first.img } : {}), ...(unl ? { unl: unl.img } : {}) };
  }
}
await writeFile('data/pced.json', JSON.stringify(pced));

// ---------- 3) Yu-Gi-Oh! japonais (OCG) : visuels par code d'impression et rareté ----------
// data/pcy.json  { "LOCR-JP001": [["Overframe Grand Master Rare", id image], …] }
const ycat = await req(`${BASE}/category/yugioh-cards`);
const ycons = ycat ? [...new Set([...ycat.matchAll(/href="\/console\/([^"?#]+)"/g)].map(m => m[1].replace(/&amp;/g, '%26')))].filter(c => c.startsWith('yugioh-japanese-')) : [];
const pcy = {};
for (const slug of ycons){
  const rows = await setRows(slug);
  for (const r of rows.raw || []){
    const m = r.title.match(/^(.*?)\s*(?:\[([^\]]+)\])?\s+([A-Z0-9]{2,6}-JP[A-Z]?\d{2,4})\s*$/);
    if (!m || !r.img) continue;
    (pcy[m[3]] ||= []).push([(m[2] || '').trim(), r.img]);
  }
}
await writeFile('data/pcy.json', JSON.stringify(pcy));
console.log(`Yu-Gi-Oh! japonais : ${ycons.length} extensions, ${Object.keys(pcy).length} codes, ${Object.values(pcy).reduce((n, l) => n + l.length, 0)} impressions avec visuel`);

// ---------- 4) Anciennes extensions japonaises (absentes de TCGplayer) : data/pcold.json ----------
// { "<extension TCGdex>": [[clé du nom anglais, n° (souvent le n° de Pokédex), variante, id image], …] }
const OLD = { pmcg1: 'pokemon-japanese-expansion-pack', pmcg2: 'pokemon-japanese-jungle', pmcg3: 'pokemon-japanese-mystery-of-the-fossils',
  pmcg4: 'pokemon-japanese-rocket-gang', pmcg5: 'pokemon-japanese-leaders%27-stadium', pmcg6: 'pokemon-japanese-challenge-from-the-darkness',
  neo1: 'pokemon-japanese-gold-silver-new-world', neo2: 'pokemon-japanese-crossing-the-ruins', neo3: 'pokemon-japanese-awakening-legends',
  neo4: 'pokemon-japanese-darkness-and-to-light', vs1: 'pokemon-japanese-vs', e1: 'pokemon-japanese-expedition-expansion-pack',
  e2: 'pokemon-japanese-the-town-on-no-map', e3: 'pokemon-japanese-wind-from-the-sea', e4: 'pokemon-japanese-split-earth', e5: 'pokemon-japanese-mysterious-mountains' };
const pcold = {};
for (const [sid, slug] of Object.entries(OLD)){
  const rows = await setRows(slug);
  pcold[sid] = rows.filter(r => r.img).map(r => [key(r.name), r.n, r.variant, r.img]);
}
await writeFile('data/pcold.json', JSON.stringify(pcold));
console.log(`Anciennes extensions japonaises : ${Object.values(pcold).reduce((n, l) => n + l.length, 0)} cartes avec visuel`);

const fixed = Object.keys(pcj).length;
console.log(`Japonais : ${fixed} visuels trouvés sur ${total} cartes sans visuel — reste ${total - fixed}`);
console.log(`Wizards (anglais) : ${edCards} cartes avec visuel PriceCharting, dont ${edBoth} avec 1re édition ET illimitée`);
console.log(JSON.stringify(logJ));
await writeFile('data/pc-bilan.json', JSON.stringify({ date: new Date().toISOString().slice(0, 10), jp: { sansVisuel: total, trouves: fixed, reste: total - fixed }, wizards: { cartes: edCards, deuxEditions: edBoth },
  yugioh: { extensions: ycons.length, codes: Object.keys(pcy).length, impressions: Object.values(pcy).reduce((n, l) => n + l.length, 0) }, extensions: logJ }, null, 1));
