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
  const rows = [], seen = new Set();
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
      const m = title.match(/^(.*?)\s*(?:\[([^\]]+)\])?\s*#\s*([A-Za-z]*\d+)\s*$/);
      if (m) rows.push({ id, name: m[1].trim(), variant: (m[2] || '').trim(), n: parseInt(m[3].replace(/^[A-Za-z]+/, ''), 10), img, href: t[1] });
    }
    const next = html.match(/name="cursor" value="(\d+)"/)?.[1];
    if (!fresh || !next || next === cursor) break;
    cursor = next;
  }
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

const fixed = Object.keys(pcj).length;
console.log(`Japonais : ${fixed} visuels trouvés sur ${total} cartes sans visuel — reste ${total - fixed}`);
console.log(`Wizards (anglais) : ${edCards} cartes avec visuel PriceCharting, dont ${edBoth} avec 1re édition ET illimitée`);
console.log(JSON.stringify(logJ));
await writeFile('data/pc-bilan.json', JSON.stringify({ date: new Date().toISOString().slice(0, 10), jp: { sansVisuel: total, trouves: fixed, reste: total - fixed }, wizards: { cartes: edCards, deuxEditions: edBoth }, extensions: logJ }, null, 1));
