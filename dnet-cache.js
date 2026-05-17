// dnet-cache.js
export async function main(ns) {
  const hostname = ns.getHostname();
  const cacheFiles = ns.ls(hostname, ".cache");

  if (cacheFiles.length === 0) {
    ns.tprint(`[${hostname}] No .cache files found`);
    return;
  }

  ns.tprint(`[${hostname}] Found ${cacheFiles.length} cache(s): ${cacheFiles.join(", ")}`);
  for (const file of cacheFiles) {
    const result = await ns.dnet.openCache(file);
    ns.tprint(`[${hostname}] Opened ${file}: ${JSON.stringify(result)}`);
  }
}