// Where the vault lives from the page's point of view.
//
// On the Vite dev server (localhost) the vault /api/vault/* endpoints are served
// same-origin by the dev plugin (vite.config.js). The deployed Cloudflare Worker
// cannot write local files, so from any other origin (the live *.workers.dev
// page) vault calls go to the loopback bridge — `npm run bridge`, see bridge.mjs.
// AI (/api/ai/*) always stays same-origin: dev plugin locally, Worker in prod.
//
// Keep the port here in sync with BRIDGE_PORT in bridge.mjs (default 8790).

export const VAULT_BASE =
  typeof location !== "undefined" &&
  (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ? ""
    : "http://127.0.0.1:8790"
