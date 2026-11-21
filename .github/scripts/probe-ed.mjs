// Sonde : où trouver les visuels 1re édition / illimitée dans le catalogue TCGplayer ?
import { writeFile, mkdir } from 'node:fs/promises';
const J = u => fetch(u, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } }).then(r => r.json());
const out = {};
for (const cat of [3, 85]){
  const g = (await J(`https://tcgcsv.com/tcgplayer/${cat}/groups`)).results;
  out['groups' + cat] = g.filter(x => /1st|first|shadowless|unlimited|base set|neo genesis|jungle|L1|heartgold/i.test(x.name)).map(x => [x.groupId, x.name, x.abbreviation]);
}
const pick = async (gid, re) => {
  const p = (await J(`https://tcgcsv.com/tcgplayer/3/${gid}/products`)).results.filter(x => re.test(x.name));
  const pr = (await J(`https://tcgcsv.com/tcgplayer/3/${gid}/prices`)).results;
  return p.map(x => ({ id: x.productId, name: x.name, img: x.imageUrl, n: x.imageCount, ext: x.extendedData, prices: pr.filter(y => y.productId === x.productId).map(y => [y.subTypeName, y.marketPrice]) }));
};
for (const [gid, name] of out.groups3){
  if (/base set|neo genesis|jungle/i.test(name)) out['g' + gid + ' ' + name] = await pick(gid, /^(Charizard|Lugia|Scyther)/);
}
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/ed.json', JSON.stringify(out, null, 1));
