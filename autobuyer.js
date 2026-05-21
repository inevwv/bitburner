export async function main(ns) {
  ns.disableLog("ALL");
  const maxServers = ns.cloud.getServerLimit();
  const targetRam = 1024; // 8GB to start, we'll upgrade later
  const moneyBuffer = 0.1; // keep 10% of money in reserve

  while (true) {
    const myServers = ns.cloud.getServerNames();
    const money = ns.getServerMoneyAvailable("home");
    const keepAmount = money * moneyBuffer;
    const spendable = money - keepAmount;

    if (myServers.length < maxServers) {
      // still buying new servers
      const cost = ns.cloud.getServerCost(targetRam);
      if (spendable >= cost) {
        const name = `pserv-${myServers.length}`;
        ns.cloud.purchaseServer(name, targetRam);
        ns.tprint(`Bought ${name} with ${targetRam}GB RAM`);
      }
    } else {
      // all slots filled, find the weakest and upgrade it
      let weakest = null;
      let weakestRam = Infinity;

      for (const server of myServers) {
        const ram = ns.getServerMaxRam(server);
        if (ram < weakestRam) {
          weakestRam = ram;
          weakest = server;
        }
      }

      const upgradeRam = weakestRam * 2; // double the ram
      const cost = ns.cloud.getServerCost(upgradeRam);

      if (spendable >= cost) {
        ns.killall(weakest);
        ns.cloud.deleteServer(weakest);
        ns.cloud.purchaseServer(weakest, upgradeRam);
        ns.tprint(`Upgraded ${weakest} to ${upgradeRam}GB RAM`);
      }
    }

    await ns.sleep(5000); // check every 5 seconds
  }
}
