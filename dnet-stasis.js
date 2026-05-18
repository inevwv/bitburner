// dnet-stasis.js
// Sets a stasis link on the current server
// Run this on th3_l4byr1nth to lock it in place
const REPORT_PORT = 20;

export async function main(ns) {
  const hostname = ns.getHostname();

  // if called with "info" arg, just print status
  if (ns.args[0] === "info") {
    const limit = ns.dnet.getStasisLinkLimit();
    const linked = ns.dnet.getStasisLinkedServers();
    ns.tprint(`Stasis limit: ${limit}`);
    ns.tprint(`Currently linked: ${JSON.stringify(linked)}`);
    return;
  }

  // otherwise set stasis link on current server
  ns.dnet.setStasisLink(true);
  ns.tprint(`[${hostname}] stasis link set`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "stasisSet",
  }));
}
