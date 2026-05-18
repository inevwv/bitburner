// storm-trigger.js
export async function main(ns) {
  ns.writePort(22, "FIRE");
  ns.tprint("Storm trigger set on port 22 — will fire next time probe runs on a server with STORM_SEED.exe");
}
