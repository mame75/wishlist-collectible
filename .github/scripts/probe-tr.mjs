// Sonde : structure de TCG Republic (robots.txt, recherche, liste d'une extension)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const get = async u => { const r = await fetch(u, { headers: UA }); return { status: r.status, text: await r.text() }; };
const out = {};
out.robots = (await get('https://tcgrepublic.com/robots.txt')).text.slice(0, 3000);
for (const [k, u] of Object.entries({
  search: 'https://tcgrepublic.com/product/text_search.html?category=35&q=Heracross',
  set: 'https://tcgrepublic.com/category/subcategory_page_3486.html',
  cat: 'https://tcgrepublic.com/category/category_page_35.html',
  prod: 'https://tcgrepublic.com/product/product_page_2000302706.html',
})){
  const r = await get(u);
  const links = [...r.text.matchAll(/<a[^>]+href="([^"]*(?:product_page|subcategory_page|page=)[^"]*)"[^>]*>([\s\S]{0,200}?)<\/a>/g)].map(m => [m[1], m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]);
  out[k] = { status: r.status, size: r.text.length, links: links.slice(0, 80), nlinks: links.length,
    imgs: [...r.text.matchAll(/<img[^>]+src="([^"]+)"/g)].map(m => m[1]).filter(s => /binary/.test(s)).slice(0, 20),
    snippet: k === 'prod' ? r.text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000) : r.text.slice(0, 1500) };
}
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/tr.json', JSON.stringify(out, null, 1));
