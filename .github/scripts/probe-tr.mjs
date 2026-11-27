// Logos des jeux pour la page Sets (téléchargés une fois) : Poképédia (Pokémon) et Wikimedia Commons (Yu-Gi-Oh!)
import { writeFile, mkdir } from 'node:fs/promises';
const UA = { headers: { 'User-Agent': 'WishlistCollectible/1.0 (github.com/mame75/wishlist-collectible)' } };
await mkdir('data/game', { recursive: true });
const get = async (u, f) => { const r = await fetch(u, UA); if (!r.ok) throw new Error(u + ' ' + r.status); await writeFile(f, Buffer.from(await r.arrayBuffer())); console.log(f, r.status); };
await get('https://www.pokepedia.fr/images/thumb/5/53/Logo_Pok%C3%A9mon.png/600px-Logo_Pok%C3%A9mon.png', 'data/game/pkm.png');
await get('https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Yu-Gi-Oh%21.png/600px-Yu-Gi-Oh%21.png', 'data/game/ygo.png');
