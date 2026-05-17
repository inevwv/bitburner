export async function main(ns) {
    ns.tprint(`8GB server cost: $${ns.cloud.getServerCost(8)}`);
    ns.tprint(`Current money: $${ns.getServerMoneyAvailable("home")}`);
    ns.tprint(`Spendable (50% buffer): $${ns.getServerMoneyAvailable("home") * 0.5}`);
}