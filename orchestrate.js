import { getAllServers, tryNuke } from "./utils.js";

const HOME_RESERVED_RAM = 256; // adjust to taste


function getBestTarget(ns, servers) {
  let bestTarget = null;
  let bestScore = 0;
  for (const server of servers) {
    if (!ns.hasRootAccess(server)) continue;
    if (ns.getServerMaxMoney(server) === 0) continue;
    if (ns.getServerRequiredHackingLevel(server) > ns.getHackingLevel()) continue;
    const maxMoney = ns.getServerMaxMoney(server);
    const minSec = ns.getServerMinSecurityLevel(server);
    const hackChance = ns.hackAnalyzeChance(server);
    const score = (maxMoney / minSec) * hackChance;
    if (score > bestScore) {
      bestScore = score;
      bestTarget = server;
    }
  }
  return bestTarget;
}

export async function main(ns) {
  ns.disableLog("ALL");
  let currentTarget = null;
  while (true) {
    const servers = getAllServers(ns);
    const bestTarget = getBestTarget(ns, servers);
    if (bestTarget === null) {
      ns.tprint("ERROR: no valid target found");
      await ns.sleep(60000);
      continue;
    }
    const hasIdleServer = servers.some(s =>
      ns.hasRootAccess(s) &&
      ns.getServerMaxRam(s) > 0 &&
      !ns.isRunning("hack.js", s)
    );
    if (bestTarget !== currentTarget) {
      currentTarget = bestTarget;
      ns.tprint(`New target: ${currentTarget}, redeploying all`);
      for (const server of servers) {
        if (!ns.hasRootAccess(server)) continue;
        tryNuke(ns, server);
        const ram = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server);
        const reserved = server === "home" ? HOME_RESERVED_RAM : 0;
        const availRam = ram - usedRam - reserved;
        const scriptRam = ns.getScriptRam("hack.js");
        const threads = Math.floor(availRam / scriptRam);
        if (threads < 1) continue;
        ns.killall(server);
        await ns.scp("hack.js", server);
        ns.exec("hack.js", server, threads, currentTarget);
      }
    } else if (hasIdleServer) {
      ns.print(`Picking up idle servers`);
      for (const server of servers) {
        if (!ns.hasRootAccess(server)) continue;
        if (ns.isRunning("hack.js", server)) continue;
        tryNuke(ns, server);
        const ram = ns.getServerMaxRam(server);
        const usedRam = ns.getServerUsedRam(server);
        const reserved = server === "home" ? HOME_RESERVED_RAM : 0;
        const availRam = ram - usedRam - reserved;
        const scriptRam = ns.getScriptRam("hack.js");
        const threads = Math.floor(availRam / scriptRam);
        if (threads < 1) continue;
        await ns.scp("hack.js", server);
        ns.exec("hack.js", server, threads, currentTarget);
      }
    }
    await ns.sleep(60000);
  }
}
