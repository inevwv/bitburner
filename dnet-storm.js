// dnet-storm.js
// Watches for storm trigger on port 22 and unleashes STORM_SEED.exe
// Split from dnet-probe.js to reduce probe RAM cost
const REPORT_PORT = 20;
const STORM_PORT = 22;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();
  const files = ns.ls(hostname);

  if (!files.includes("STORM_SEED.exe")) return;

  const stormTrigger = ns.peek(STORM_PORT);
  if (stormTrigger !== "FIRE") return;

  ns.print(`[${hostname}] STORM TRIGGER DETECTED — unleashing storm seed!`);
  ns.readPort(STORM_PORT);
  const result = await ns.dnet.unleashStormSeed();
  ns.print(`[${hostname}] storm result: ${JSON.stringify(result)}`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    from: hostname,
    status: "storm",
    result: result,
  }));
}
