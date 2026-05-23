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
      // if we've crossed an airgap, stasis link ourselves
const linked = ns.dnet.getStasisLinkedServers();
const limit = ns.dnet.getStasisLinkLimit();

if (!linked.includes(hostname) && linked.length < limit) {
  const hasGap1Link = linked.some(s => {
    const d = ns.dnet.getDepth(s);
    return d >= 8 && d < 15;
  });
  const hasGap2Link = linked.some(s => {
    const d = ns.dnet.getDepth(s);
    return d >= 15 && d < 21;
  });

  if (depth >= 8 && depth < 15 && !hasGap1Link) {
    ns.dnet.setStasisLink(true);
    ns.tprint(`[${hostname}] stasis set — airgap 1 at depth ${depth}`);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "stasisSet",
      depth: depth,
    }));
  } else if (depth >= 15 && depth < 21 && !hasGap2Link) {
    ns.dnet.setStasisLink(true);
    ns.tprint(`[${hostname}] stasis set — airgap 2 at depth ${depth}`);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "stasisSet",
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
