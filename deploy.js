import { getAllServers, tryNuke } from "./utils.js";
export async function main(ns) {
  const servers = getAllServers(ns);
  const script = "hack.js"; // your HGW script
  const scriptRam = ns.getScriptRam(script);

  for (const server of servers) {
    if (server === "home") continue; // skip home

    // try to open ports and nuke
    tryNuke(ns, server);

    // if we have root, deploy
    if (ns.hasRootAccess(server)) {
      const maxRam = ns.getServerMaxRam(server);
      const threads = Math.floor(maxRam / scriptRam);
      if (threads < 1) continue; // server too small

      await ns.scp(script, server); // copy script over
      ns.exec(script, server, threads, server); // run it, targeting itself
    }
  }
}