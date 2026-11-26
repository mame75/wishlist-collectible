// Sonde : répartition des raretés TCGdex par extension (fr) et comparaison fr/en
import { writeFile, mkdir } from 'node:fs/promises';
const J = u => fetch(u).then(r => r.json());
const out = {};
const rar = ['Magnifique rare','Magnifique','Shiny rare','Holo Rare','Rare Holo','Ultra Rare','Hyper rare','Sans Rareté','Couronne','Une Étoile','Deux Diamants','Promo','Double rare','Illustration rare','Rare','Holo Rare V','Shiny rare V','Trois Étoiles','Un Chromatique','Dresseur Full Art','LÉGENDE','Rare Prime','Collection Classique'];
for (const r of rar){
  const l = await J(`https://api.tcgdex.net/v2/fr/cards?rarity=eq:${encodeURIComponent(r)}`).catch(() => []);
  const sets = {}; for (const c of l) { const s = c.id.slice(0, c.id.lastIndexOf('-')); sets[s] = (sets[s] || 0) + 1; }
  out[r] = Object.entries(sets).sort((a, b) => b[1] - a[1]).map(x => x.join(':')).join(' ');
}
// fr vs en sur quelques extensions récentes et anciennes
out.cmp = {};
for (const s of ['sv03.5','swsh12','sm12','xy12','bw7','dp1','ex13','neo1','me01','sv08.5','swsh7','sm115','30th']){
  const [f, e] = await Promise.all(['fr','en'].map(l => J(`https://api.tcgdex.net/v2/${l}/sets/${s}`).catch(() => null)));
  if (!f || !e) continue;
  const cnt = {};
  for (const c of f.cards){
    const [cf, ce] = await Promise.all(['fr','en'].map(l => J(`https://api.tcgdex.net/v2/${l}/cards/${c.id}`).catch(() => null)));
    const k = `${cf && cf.rarity} | ${ce && ce.rarity}`; cnt[k] = (cnt[k] || 0) + 1;
  }
  out.cmp[s] = cnt;
}
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/rar2.json', JSON.stringify(out, null, 1));
