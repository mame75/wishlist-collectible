// Sonde : structure d'une page d'extension TCG Republic (bloc produit, pagination)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const get = async u => (await fetch(u, { headers: UA })).text();
const out = {};
const s = await get('https://tcgrepublic.com/category/subcategory_page_3486.html');
const i = s.indexOf('308940');
out.around = i >= 0 ? s.slice(Math.max(0, i - 2500), i + 1500) : null;
out.firstProduct = s.slice(s.indexOf('product_page_') - 1500, s.indexOf('product_page_') + 1500);
out.pager = [...s.matchAll(/href="([^"]*subcategory_page_3486[^"]*)"/g)].map(m => m[1]).slice(0, 40);
out.count = (s.match(/product_page_\d+/g) || []).length;
out.title = (s.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
const q = await get('https://tcgrepublic.com/product/text_search.html?category=35&q=Heracross');
out.search = q.slice(q.indexOf('product_page_') - 1500, q.indexOf('product_page_') + 1500);
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/tr.json', JSON.stringify(out, null, 1));
