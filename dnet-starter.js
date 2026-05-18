// dnet-starter.js
const SCRIPTS = [
  "dnet-probe.js",
  "dnet-rider.js",
  "dnet-interactive-solver.js",
  "dnet-stasis.js",
  "dnet-cache-opener.js",
  "dnet-deploy-rider.js",
  "dnet-storm.js",
  "dnet-mapper.js",
];

export async function main(ns) {
  ns.clearPort(21); // clear rider port so probe can redeploy

  // scp all scripts to darkweb
  for (const script of SCRIPTS) {
    await ns.scp(script, "darkweb");
  }

  ns.exec("dnet-probe.js", "darkweb");
  ns.exec("dnet-mapper.js", "home");
  ns.tprint("Probe and mapper launched");
}
