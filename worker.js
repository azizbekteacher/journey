/* Journey static site worker — serves ./dist assets.
 * (The old notebook KV sync was removed; answers/tips now sync to the local
 * Obsidian vault at C:\Users\bluep\Azizbek via the Vite dev-server plugin.)
 */

export default {
  async fetch(req, env) {
    try {
      if (env.ASSETS) return await env.ASSETS.fetch(req);
    } catch (e) {}
    return new Response("Not found", { status: 404 });
  },
};
