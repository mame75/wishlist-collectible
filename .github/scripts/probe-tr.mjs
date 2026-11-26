// Sonde : raretés TCGdex (fr/en/ja) et icônes de rareté Poképédia
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const J = u => fetch(u, { headers: UA }).then(r => r.json());
const out = {};
for (const l of ['fr', 'en', 'ja']) out['tcgdex_' + l] = await J(`https://api.tcgdex.net/v2/${l}/rarities`).catch(e => String(e));
// comptage par rareté FR (échantillon : toutes les cartes fr, champ rarity absent de la liste → par rareté via filtre)
out.counts_fr = {};
for (const r of Array.isArray(out.tcgdex_fr) ? out.tcgdex_fr : []){
  const l = await J(`https://api.tcgdex.net/v2/fr/cards?rarity=eq:${encodeURIComponent(r)}`).catch(() => []);
  out.counts_fr[r] = Array.isArray(l) ? l.length : -1;
}
const rar = {};
for (const f of await readdir('data/tcgpj')) for (const list of Object.values(JSON.parse(await readFile(`data/tcgpj/${f}`, 'utf8')))) for (const e of list) rar[e[3]] = (rar[e[3]] || 0) + 1;
out.tcgpj = rar;
let files = [], cont = '';
for (let k = 0; k < 10; k++){
  const j = await J(`https://www.pokepedia.fr/api.php?format=json&action=query&list=allimages&aiprefix=Rareté_&ailimit=500&aiprop=url|size${cont}`);
  files.push(...j.query.allimages.map(i => [i.name, i.width, i.height, i.url]));
  if (!j.continue) break; cont = `&aicontinue=${encodeURIComponent(j.continue.aicontinue)}`;
}
out.pokepedia = files;
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/rar.json', JSON.stringify(out, null, 1));
