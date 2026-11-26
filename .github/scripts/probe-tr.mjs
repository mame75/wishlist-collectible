// Sonde : produit TCGplayer 696171 (Mew ex 151/165 rangé dans M1L: Mega Brave)
import { writeFile, mkdir } from 'node:fs/promises';
const J = u => fetch(u, { headers: { 'User-Agent': 'WishlistCollectible/1.0 (github.com/mame75/wishlist-collectible)' } }).then(r => r.json());
const out = {};
const g = (await J('https://tcgcsv.com/tcgplayer/85/groups')).results;
out.groups = g.filter(x => /Mega Brave|151|M1L/i.test(x.name)).map(x => [x.groupId, x.name, x.publishedOn]);
for (const [gid, name] of out.groups.filter(x => /Mega Brave/i.test(x[1]))){
  const p = (await J(`https://tcgcsv.com/tcgplayer/85/${gid}/products`)).results;
  out[name] = p.filter(r => /mew/i.test(r.name) || r.productId === 696171).map(r => ({ id: r.productId, name: r.name, url: r.url, img: r.imageUrl, mod: r.modifiedOn, ext: r.extendedData }));
  const pr = (await J(`https://tcgcsv.com/tcgplayer/85/${gid}/prices`)).results;
  out[name + ' prix'] = pr.filter(r => r.productId === 696171);
}
for (const u of ['https://tcgplayer-cdn.tcgplayer.com/product/696171_in_1000x1000.jpg', 'https://tcgplayer-cdn.tcgplayer.com/product/696171_200w.jpg']){
  const r = await fetch(u).catch(e => ({ status: String(e) })); out[u] = r.status;
}
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/mew696171.json', JSON.stringify(out, null, 1));
