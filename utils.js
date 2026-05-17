export function getAllServers(ns) {
    const visited = ["home"];
    const queue = ["home"];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const neighbor of ns.scan(current)) {
            if (!visited.includes(neighbor)) {
                visited.push(neighbor);
                queue.push(neighbor);
            }
        }
    }
    return visited;
}

export function tryNuke(ns, server) {
    const portsNeeded = ns.getServerNumPortsRequired(server);
    let portsOpened = 0;

    if (ns.fileExists("BruteSSH.exe")) { ns.brutessh(server); portsOpened++; }
    if (ns.fileExists("FTPCrack.exe")) { ns.ftpcrack(server); portsOpened++; }
    if (ns.fileExists("relaySMTP.exe")) { ns.relaysmtp(server); portsOpened++; }
    if (ns.fileExists("HTTPWorm.exe"))  { ns.httpworm(server);  portsOpened++; }
    if (ns.fileExists("SQLInject.exe")) { ns.sqlinject(server); portsOpened++; }

    if (portsOpened >= portsNeeded) {
        try { ns.nuke(server); } catch { }
    }
}