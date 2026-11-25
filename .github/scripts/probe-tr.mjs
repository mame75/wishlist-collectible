// Sonde : PriceCharting Yu-Gi-Oh! japonais (liste des extensions, format des lignes)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const get = async u => { const r = await fetch(u, { headers: UA }); return { s: r.status, t: await r.text() }; };
const out = {};
const cat = await get('https://www.pricecharting.com/category/yugioh-cards');
out.cat = { s: cat.s, consoles: [...new Set([...cat.t.matchAll(/href="\/console\/([^"?#]+)"/g)].map(m => m[1]))] };
const set = await get('https://www.pricecharting.com/console/yugioh-japanese-limit-over-collection-rivals');
out.rows = [];
for (const chunk of set.t.split('<tr id="product-').slice(1, 40)){
  const t = chunk.match(/<td class="title"[^>]*>\s*<a href="([^"]+)">([^<]+)<\/a>/);
  const img = chunk.match(/images\.pricecharting\.com\/([^/"]+)\/\d+\.jpg/)?.[1] || null;
  out.rows.push([t && t[2].trim(), t && t[1], img]);
}
out.next = set.t.match(/name="cursor" value="(\d+)"/)?.[1];
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/pcy.json', JSON.stringify(out, null, 1));
