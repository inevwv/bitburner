// dnet-quickls.js
export async function main(ns) {
  const target = ns.args[0];
  await ns.scp("dnet-ls.js", target);
  const pid = ns.exec("dnet-ls.js", target);
  ns.tail(pid);
}