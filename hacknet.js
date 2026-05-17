import { } from "./utils.js"; // no utils needed yet but good habit to have

export async function main(ns) {
  ns.disableLog("ALL");
  const maxNodes = 12; // don't go crazy early, hacknet gets expensive
  const moneyBuffer = 0.5; // only spend 50% of money on hacknet

  while (true) {
    const money = ns.getServerMoneyAvailable("home");
    const spendable = money * (1 - moneyBuffer);
    const nodeCount = ns.hacknet.numNodes();

    // buy a new node if we have room and can afford it
    if (nodeCount < maxNodes) {
      const cost = ns.hacknet.getPurchaseNodeCost();
      if (spendable >= cost) {
        ns.hacknet.purchaseNode();
        ns.tprint(`Bought hacknet node ${nodeCount}`);
        await ns.sleep(200);
        continue; // restart loop so we don't also upgrade this tick
      }
    }

    if (nodeCount === 0) {
      await ns.sleep(5000);
      continue; // nothing to upgrade yet
    }

    // find cheapest upgrade across all nodes
    let bestNode = null;
    let bestCost = Infinity;
    let bestType = null;

    for (let i = 0; i < nodeCount; i++) {
      const costs = {
        level: ns.hacknet.getLevelUpgradeCost(i, 1),
        ram: ns.hacknet.getRamUpgradeCost(i, 1),
        core: ns.hacknet.getCoreUpgradeCost(i, 1),
      };

      for (const [type, cost] of Object.entries(costs)) {
        if (cost < bestCost) {
          bestCost = cost;
          bestNode = i;
          bestType = type;
        }
      }
    }

    if (spendable >= bestCost) {
      if (bestType === "level") ns.hacknet.upgradeLevel(bestNode, 1);
      if (bestType === "ram") ns.hacknet.upgradeRam(bestNode, 1);
      if (bestType === "core") ns.hacknet.upgradeCore(bestNode, 1);
    }

    await ns.sleep(5000);
  }
}