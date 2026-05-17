// dnet-ls.js
export async function main(ns) {
  const files = ns.ls(ns.getHostname());
  ns.tprint(`Files on ${ns.getHostname()}:`);
  for (const f of files) ns.tprint(`  ${f}`);
}