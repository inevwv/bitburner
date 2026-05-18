// dnet-deploy-rider.js
// Handles induceServerMigration and rider deployment
// Split from dnet-probe.js to reduce probe RAM cost
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();

  ns.print(`[${hostname}] deploy-rider starting`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    from: hostname,
    status: "riderAlive",
    depth: ns.dnet.getDepth(hostname),
  }));

  // exec the actual rider on this server
  ns.exec("dnet-rider.js", hostname, 1, [], { preventDuplicates: true });

  // stack migration charges on all neighbors
  const neighbors = ns.dnet.probe();
  ns.print(`[${hostname}] inducing migration on ${neighbors.length} neighbors`);

  for (let i = 0; i < 30; i++) {
    for (const neighbor of neighbors) {
      try {
        await ns.dnet.induceServerMigration(neighbor);
      } catch (e) {
        // neighbor may have moved
      }
    }
    await ns.sleep(100);
  }

  ns.print(`[${hostname}] deploy-rider done`);
}
