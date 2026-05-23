/** programs.js
 * Dynamically acquires all hacking programs by racing creation vs purchase —
 * whichever condition is met first wins. Works across bitnodes where either
 * hacking speed or money generation may be nerfed.
 *
 * RAM: ~6GB (singularity functions at SF4 level 1)
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // All programs we want, in priority order.
  // The script figures out dynamically whether each can be bought, created, or both.
  const wantedPrograms = [
    "NUKE.exe",
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "DeepscanV1.exe",
    "DeepscanV2.exe",
    "AutoLink.exe",
    "Formulas.exe",
  ];

  ns.print("=== programs.js started ===");

  for (const program of wantedPrograms) {
    if (ns.fileExists(program, "home")) {
      ns.print(`✓ ${program} already owned, skipping.`);
      continue;
    }

    const darkwebCost = ns.singularity.getDarkwebProgramCost(program);
    const canBuy    = darkwebCost > 0;  // -1 = not on darkweb, 0 = already owned
    const canCreate = ns.singularity.createProgram(program, false);

    if (!canBuy && !canCreate) {
      // Not on darkweb AND hacking too low to create — wait and retry
      ns.print(`Waiting for requirements for ${program}...`);
      let acquired = false;
      while (!acquired) {
        await ns.sleep(30_000);
        if (ns.fileExists(program, "home")) { acquired = true; break; }

        const cost = ns.singularity.getDarkwebProgramCost(program);
        if (cost > 0 && ns.getServerMoneyAvailable("home") >= cost) {
          ns.singularity.purchaseProgram(program);
        } else if (cost <= 0) {
          ns.singularity.createProgram(program, false);
        }
      }
      ns.print(`✓ ${program} acquired!`);
      ns.toast(`${program} acquired!`, "success", 4000);
      continue;
    }

    if (canCreate) {
      ns.print(`Racing creation vs purchase for ${program}...`);
    } else {
      ns.print(`Saving to buy ${program} ($${ns.format.number(darkwebCost)})...`);
    }

    // Race loop: every 5s check if creation finished OR we can now afford it
    while (!ns.fileExists(program, "home")) {
      const cost  = ns.singularity.getDarkwebProgramCost(program);
      const money = ns.getServerMoneyAvailable("home");

      if (cost === 0) break; // getDarkwebProgramCost returns 0 when already owned

      if (cost > 0 && money >= cost) {
        // Can afford it — buy it (cancels any ongoing creation automatically)
        ns.singularity.purchaseProgram(program);
        break;
      }

      await ns.sleep(5_000);
    }

    if (ns.fileExists(program, "home")) {
      ns.print(`✓ ${program} acquired!`);
      ns.toast(`${program} acquired!`, "success", 4000);
    }
  }

  ns.print("✓ All programs acquired. Script exiting.");
  ns.toast("All programs acquired!", "success", 6000);
}
