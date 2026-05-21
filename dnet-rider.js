// dnet-rider.js
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();

  ns.tprint(`[${hostname}] rider started`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "riderAlive",
    depth: ns.dnet.getDepth(hostname),
  }));

  try {
    while (true) {
      const depth = ns.dnet.getDepth(hostname);

      if (depth === -1) {
        ns.tprint(`[${hostname}] server went offline, rider terminating`);
        return;
      }
      // if we've crossed the airgap, stasis link ourselves
      if (depth >= 8) {
        const linked = ns.dnet.getStasisLinkedServers();
        if (!linked.includes(hostname) && linked.length < ns.dnet.getStasisLinkLimit()) {
          ns.dnet.setStasisLink(true);
          ns.tprint(`[${hostname}] CROSSED AIRGAP at depth ${depth} — stasis link set!`);
          ns.writePort(REPORT_PORT, JSON.stringify({
            host: hostname,
            status: "airgapCrossed",
            depth: depth,
          }));
        }
      }

      const neighbors = ns.dnet.probe();
      ns.tprint(`[${hostname}] depth:${depth} neighbors:${neighbors.length}`);

      ns.writePort(REPORT_PORT, JSON.stringify({
        host: hostname,
        status: "rider",
        depth: depth,
        neighbors: neighbors,
      }));

      // check lab functions
      const radar = await ns.dnet.labradar();
      const report = await ns.dnet.labreport();
      if (radar.success || report.success) {
        ns.writePort(REPORT_PORT, JSON.stringify({
          host: hostname,
          status: "labUnlocked",
          depth: depth,
          radar: radar,
          report: report,
        }));
      }

      // induce migration on all neighbors
      for (const neighbor of neighbors) {
        try {
          await ns.dnet.induceServerMigration(neighbor);
        } catch (e) {
          ns.tprint(`[${hostname}] induceServerMigration failed on ${neighbor}: ${e.message}`);
        }
      }

      await ns.dnet.nextMutation();
    }
  } catch (e) {
    ns.tprint(`[${hostname}] RIDER CRASHED: ${e.message}`);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "riderCrashed",
      error: e.message,
    }));
  }
}
