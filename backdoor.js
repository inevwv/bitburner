/** backdoor.js
 * Automatically backdoors faction servers when hacking level is sufficient.
 * Traces the path to each server via BFS since connect() only works hop-by-hop.
 *
 * Targets: CSEC, avmnite-02h, I.I.I.I, run4theh111z
 * RAM: ~5GB
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== backdoor.js started ===");

  const targets = [
    { host: "CSEC",           reqHack: 59  },
    { host: "avmnite-02h",    reqHack: 202 },
    { host: "I.I.I.I",        reqHack: 340 },
    { host: "run4theh111z",   reqHack: 505 },
  ];

  while (true) {
    const hackLevel = ns.getHackingLevel();
    let allDone = true;

    for (const target of targets) {
      const server = ns.getServer(target.host);

      if (server.backdoorInstalled) {
        ns.print(`✓ ${target.host} already backdoored.`);
        continue;
      }

      if (hackLevel < target.reqHack) {
        ns.print(`Waiting for hacking ${target.reqHack} for ${target.host} (have ${hackLevel})`);
        allDone = false;
        continue;
      }

      if (!server.hasAdminRights) {
        ns.print(`Waiting for root on ${target.host}...`);
        allDone = false;
        continue;
      }

      // Trace path and connect hop by hop
      const path = findPath(ns, target.host);
      if (!path) {
        ns.print(`✗ Could not find path to ${target.host}`);
        allDone = false;
        continue;
      }

      ns.print(`Connecting to ${target.host} via ${path.join(" → ")}`);
      for (const hop of path) {
        ns.singularity.connect(hop);
      }

      await ns.singularity.installBackdoor();
      ns.singularity.connect("home"); // return home after backdooring
      ns.print(`✓ Backdoored ${target.host}!`);
      ns.toast(`Backdoored ${target.host}!`, "success", 5000);
    }

    if (allDone) {
      ns.print("✓ All faction servers backdoored. Script exiting.");
      ns.toast("All faction servers backdoored!", "success", 6000);
      break;
    }

    await ns.sleep(30_000);
  }
}

/** BFS from home to find the path to a target server */
function findPath(ns, target) {
  const visited = new Set(["home"]);
  const queue = [["home"]];

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    for (const neighbor of ns.scan(current)) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);

      const newPath = [...path, neighbor];
      if (neighbor === target) return newPath.slice(1); // exclude "home"

      queue.push(newPath);
    }
  }

  return null; // not found
}
