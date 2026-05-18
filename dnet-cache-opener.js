// dnet-cache-opener.js
// Handles opening .cache files on the current server
// Split from dnet-probe.js to reduce probe RAM cost
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();
  const files = ns.ls(hostname);
  const caches = files.filter(f => f.endsWith(".cache"));

  if (caches.length === 0) return;

  ns.print(`[${hostname}] found ${caches.length} cache(s)`);

  for (const f of caches) {
    ns.print(`[${hostname}] opening cache: ${f}`);
    const result = await ns.dnet.openCache(f);
    ns.print(`[${hostname}] cache result: ${JSON.stringify(result)}`);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      from: hostname,
      status: "cache",
      filename: f,
      result: result,
    }));
  }
}
