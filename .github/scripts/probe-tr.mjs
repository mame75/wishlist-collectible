// Sonde : raretés manquantes (TCGdex) et format des listes Bulbapedia
import { writeFile, mkdir } from 'node:fs/promises';
const J = u => fetch(u, { headers: { 'user-agent': 'wishlist-collectible (github.com/mame75/wishlist-collectible)' } }).then(r => r.json());
const out = { nullBySet: {} };
const sets = (await J('https://api.tcgdex.net/v2/fr/sets')).filter(s => !/^([AB]\d|P-A)/.test(s.id));
for (const s of sets){
  const d = await J(`https://api.tcgdex.net/v2/fr/sets/${encodeURIComponent(s.id)}`).catch(() => null);
  if (!d) continue;
  // la liste de l'extension ne donne pas la rareté : on échantillonne les dernières cartes (secrètes / illustrations)
  const tail = d.cards.slice(-25);
  let n = 0;
  for (const c of tail){ const x = await J(`https://api.tcgdex.net/v2/fr/cards/${encodeURIComponent(c.id)}`).catch(() => null); if (x && !x.rarity) n++; }
  if (n) out.nullBySet[s.id] = `${n}/${tail.length} (sur ${d.cards.length})`;
}
const bp = await J('https://bulbapedia.bulbagarden.net/w/api.php?format=json&action=query&prop=revisions&rvprop=content&rvslots=main&titles=' + encodeURIComponent('Mega Evolution (TCG)'));
const t = Object.values(bp.query.pages)[0].revisions[0].slots.main['*'];
out.bulba = t.split('\n').filter(l => /Setlist/.test(l)).slice(0, 12).concat(t.split('\n').filter(l => /Setlist/.test(l)).slice(-30));
await mkdir('data/probe', { recursive: true });
await writeFile('data/probe/rar3.json', JSON.stringify(out, null, 1));
