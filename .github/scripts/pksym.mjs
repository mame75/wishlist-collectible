// Symboles d'extension Pokémon (Poképédia, « Symbole <Série> <Extension> JCC.png »), téléchargés dans data/sym/<id TCGdex>.png
// et index data/sym.json { "<id TCGdex>": 1 }. Rapprochement par le nom français de l'extension (TCGdex).
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' };
const API = 'https://www.pokepedia.fr/api.php?format=json&';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const J = u => fetch(u, { headers: UA }).then(r => r.json());
const nm = s => String(s || '').toLowerCase().replace(/ᵉ/g, 'e').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// 1) Fichiers « Symbole_…_JCC.png »
const files = [];
let cont = '';
for (let k = 0; k < 20; k++){
  const j = await J(`${API}action=query&list=allimages&aiprefix=Symbole_&ailimit=500&aiprop=url|size${cont}`);
  files.push(...j.query.allimages.filter(i => /_JCC\.png$/i.test(i.name)));
  if (!j.continue) break;
  cont = `&aicontinue=${encodeURIComponent(j.continue.aicontinue)}`;
}
const F = files.map(f => ({ ...f, k: nm(f.name.replace(/^Symbole_/, '').replace(/_JCC\.png$/i, '')) }));
console.log('symboles Poképédia :', F.length);

// 2) Extensions TCGdex (français), hors TCG Pocket
const SERIES = { sv: 'ecarlateetviolet', swsh: 'epeeetbouclier', sm: 'soleiletlune', xy: 'xy', bw: 'noir&blanc', dp: 'diamant&perle', pl: 'platine',
  hgss: 'heartgoldsoulsilver', me: 'megaevolution', ex: 'ex', ecard: 'expedition', neo: 'neo', base: '' };
const MANUAL = { svp: 'promosv', mep: 'promome', basep: 'promowizards', '30th': '30eanniversaire' };
const sets = (await J('https://api.tcgdex.net/v2/fr/sets')).filter(s => !/^([AB]\d|P-A)/.test(s.id));
const out = {}, miss = [];
await mkdir('data/sym', { recursive: true });
for (const s of sets){
  const n = nm(s.name), pre = Object.entries(SERIES).find(([p]) => s.id.startsWith(p));
  const ser = pre ? nm(pre[1]) : '';
  let f = MANUAL[s.id] ? F.find(x => x.k === MANUAL[s.id]) : null;
  f ||= F.find(x => x.k === n) || F.find(x => ser && x.k === ser + n)
    || F.filter(x => x.k.endsWith(n) && n.length >= 3).sort((a, b) => (b.k.startsWith(ser) ? 1 : 0) - (a.k.startsWith(ser) ? 1 : 0) || a.k.length - b.k.length)[0];
  if (!f){ miss.push(`${s.id} ${s.name}`); continue; }
  try {
    const r = await fetch(f.url, { headers: UA });
    if (!r.ok) throw new Error(r.status);
    await writeFile(`data/sym/${s.id}.png`, Buffer.from(await r.arrayBuffer()));
    out[s.id] = f.name;
  } catch { miss.push(`${s.id} ${s.name} (téléchargement)`); }
  await sleep(300);
}
await writeFile('data/sym.json', JSON.stringify(out));
console.log(`Symboles : ${Object.keys(out).length} extensions sur ${sets.length} — sans symbole : ${miss.length}`);
console.log(JSON.stringify(miss));
