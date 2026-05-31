import { tunnelStart, tunnelStop } from './tunnel.js';
/** @deprecated Use `ogp tunnel start`. Retained as a hidden alias. */
export async function expose(method = 'cloudflared', background = false) {
    console.log("[deprecated] 'ogp expose' is now 'ogp tunnel start'. Forwarding…");
    await tunnelStart(method, background);
}
/** @deprecated Use `ogp tunnel stop`. Retained as a hidden alias. */
export function stopExpose() {
    console.log("[deprecated] 'ogp expose-stop' is now 'ogp tunnel stop'. Forwarding…");
    tunnelStop();
}
//# sourceMappingURL=expose.js.map