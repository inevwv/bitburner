// dnet-stasis.js
export async function main(ns) {
  const limit = ns.dnet.getStasisLinkLimit();
  const linked = ns.dnet.getStasisLinkedServers();
  ns.tprint(`Stasis limit: ${limit}`);
  ns.tprint(`Currently linked: ${JSON.stringify(linked)}`);
}