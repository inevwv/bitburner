// dnet-lab.js
export async function main(ns) {
  const radar = await ns.dnet.labradar();
  const report = await ns.dnet.labreport();
  ns.tprint("RADAR: " + JSON.stringify(radar));
  ns.tprint("REPORT: " + JSON.stringify(report));
}