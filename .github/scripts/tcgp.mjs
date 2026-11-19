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
