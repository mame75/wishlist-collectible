// Test : les fichiers publiés par Cardmarket (guide des prix, liste des produits) sont-ils accessibles ?
import { writeFile, mkdir } from 'node:fs/promises';
const base = 'https://downloads.s3.cardmarket.com/productCatalog';
const urls = [`${base}/priceGuide/price_guide_3.json`, `${base}/priceGuide/price_guide_6.json`,
  `${base}/productList/products_singles_3.json`, `${base}/productList/products_singles_6.json`];
const out = {};
let prods = null, guide = null;
for (const u of urls){
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } });
    const t = await r.text();
    const e = { status: r.status, bytes: t.length };
    try { const j = JSON.parse(t); e.keys = Object.keys(j); const arr = Object.values(j).find(Array.isArray) || []; e.count = arr.length; e.sample = arr.slice(0, 2);
      if (/products_singles_3/.test(u)) prods = arr; if (/price_guide_3/.test(u)) guide = arr; } catch { e.head = t.slice(0, 300); }
    out[u] = e;
  } catch (err) { out[u] = { error: String(err) }; }
}
if (prods){
  const hits = prods.filter(p => /Pharaoh's Servant|Kuriboh - Multiply/i.test(p.name || '')).slice(0, 12);
  out.examples = hits.map(p => ({ ...p, price: guide ? guide.find(g => g.idProduct === p.idProduct) : null }));
}
await mkdir('data', { recursive: true });
await writeFile('data/cmtest.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 2000));
