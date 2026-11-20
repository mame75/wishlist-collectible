// Sonde ponctuelle : les fichiers publics de Cardmarket (guide des prix, liste des produits) sont-ils accessibles ?
import { writeFile, mkdir } from 'node:fs/promises';
const urls = [
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_3.json',
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_3.json',
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json'
];
const out = {};
for (const u of urls){
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } });
    const t = await r.text();
    const o = { status: r.status, size: t.length, head: t.slice(0, 600) };
    try {
      const j = JSON.parse(t);
      const list = j.priceGuides || j.products || [];
      o.keys = Object.keys(j); o.count = list.length; o.first = list.slice(0, 3);
      o.match = list.filter(x => /Pharaoh's Servant|Kuriboh - Multiply/i.test(x.name || '')).slice(0, 12);
      if (j.priceGuides){ const ids = new Set([886496]); o.pkm = j.priceGuides.filter(x => ids.has(x.idProduct)); }
    } catch {}
    out[u] = o;
  } catch (e){ out[u] = { error: String(e) }; }
}
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/cardmarket.json', JSON.stringify(out, null, 1));
