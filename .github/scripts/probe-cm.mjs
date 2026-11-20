// Sonde : les fichiers publics de Cardmarket (guide des prix, catalogue) sont-ils accessibles, et que contiennent-ils ?
import { writeFile } from 'node:fs/promises';
const urls = [
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_3.json',
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_3.json',
  'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
];
const out = {};
for (const u of urls){
  try {
    const r = await fetch(u, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } });
    const t = await r.text();
    const o = { status: r.status, size: t.length, head: t.slice(0, 700) };
    try {
      const j = JSON.parse(t);
      o.keys = Object.keys(j);
      const arr = j.priceGuides || j.products || [];
      o.count = arr.length; o.first = arr.slice(0, 2);
      if (j.products) o.sample = arr.filter(p => /Pharaoh's Servant|Kuriboh - Multiply|Unchained Soul Lord of Yama/.test(p.name)).slice(0, 12);
      if (j.priceGuides) o.sample = arr.filter(p => [886496].includes(p.idProduct)).slice(0, 3);
    } catch {}
    out[u] = o;
  } catch (e){ out[u] = { error: String(e) }; }
}
// Si le catalogue est là, on cherche les prix des produits de l'exemple
const pl = out[urls[1]], pg = out[urls[0]];
await writeFile('data/probe-cm.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out).slice(0, 2000));
