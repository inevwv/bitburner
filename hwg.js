export async function main(ns) {
    const target = ns.args[0] ?? "n00dles";
    
    while (true) {
        const moneyAvail = ns.getServerMoneyAvailable(target);
        const moneyMax = ns.getServerMaxMoney(target);
        const secLevel = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);

        if (secLevel > minSec + 5) {
            await ns.weaken(target);
        } else if (moneyAvail < moneyMax * 0.75) {
            await ns.grow(target);
        } else {
            await ns.hack(target);
        }
    }
}