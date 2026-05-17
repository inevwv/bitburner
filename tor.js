export async function main(ns) {
    ns.disableLog("ALL");

    const openers = [
        { file: "BruteSSH.exe",  cost: 500000 },
        { file: "FTPCrack.exe",  cost: 1500000 },
        { file: "relaySMTP.exe", cost: 5000000 },
        { file: "HTTPWorm.exe",  cost: 30000000 },
        { file: "SQLInject.exe", cost: 250000000 },
    ];

    while (true) {
        const next = openers.find(o => !ns.fileExists(o.file));

        if (!next) {
            ns.tprint("All port openers purchased!");
            break;
        }

        const money = ns.getServerMoneyAvailable("home");
        const pct = Math.round((money / next.cost) * 100);

        if (money >= next.cost) {
            ns.tprint(`✓ You can afford ${next.file}! Buy it from the dark web.`);
        } else {
            ns.tprint(`Saving for ${next.file} — ${pct}% there`);
        }

        await ns.sleep(10000);
    }
}