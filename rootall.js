import { getAllServers, tryNuke } from "./utils.js";

export async function main(ns) {
  const servers = getAllServers(ns);
  let nuked = 0;

  for (const server of servers) {
    if (ns.hasRootAccess(server)) continue;

    tryNuke(ns, server);

    if (ns.hasRootAccess(server)) {
      ns.tprint(`Nuked: ${server}`);
      nuked++;
    }
  }

  ns.tprint(`Done — nuked ${nuked} new servers`);
}