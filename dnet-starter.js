export async function main(ns) {
  ns.clearPort(21); // clear rider port so probe can redeploy
  await ns.scp("dnet-probe.js", "darkweb");
  await ns.scp("dnet-rider.js", "darkweb");
  ns.exec("dnet-probe.js", "darkweb");
  ns.exec("dnet-mapper.js", "home");
  ns.tprint("Probe and mapper launched");
}