// Sonde : structure de PriceCharting (liste des extensions Pokémon, page d'extension, pagination)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const get = async u => { const r = await fetch(u, { headers: UA }); return { s: r.status, t: await r.text() }; };
const out = {};
out.robots = (await get('https://www.pricecharting.com/robots.txt')).t.slice(0, 2500);
const cat = await get('https://www.pricecharting.com/category/pokemon-cards');
out.cat = { s: cat.s, n: cat.t.length, consoles: [...new Set([...cat.t.matchAll(/href="\/console\/([^"?#]+)"/g)].map(m => m[1]))] };
const set = await get('https://www.pricecharting.com/console/pokemon-japanese-reviving-legends');
const i = set.t.indexOf('<tr');
out.set = { s: set.s, n: set.t.length, rows: (set.t.match(/<tr[ >]/g) || []).length, first: set.t.slice(set.t.indexOf('id="games_table"'), set.t.indexOf('id="games_table"') + 3500),
  more: (set.t.match(/[^\n]*(cursor|next|load more|page=)[^\n]*/gi) || []).slice(0, 20) };
const neo = await get('https://www.pricecharting.com/console/pokemon-neo-genesis');
out.neo = { s: neo.s, rows: (neo.t.match(/<tr[ >]/g) || []).length, names: [...neo.t.matchAll(/<td class="title"[\s\S]{0,400}?<a[^>]*>([^<]+)</g)].map(m => m[1].trim()).slice(0, 40) };
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/pc.json', JSON.stringify(out, null, 1));
