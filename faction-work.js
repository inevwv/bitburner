/** faction-work.js
 * Grinds faction rep in priority order:
 *   1. Bucket factions (from faction-config.js) in order
 *   2. Any other joined factions with unowned augs
 *
 * Work type: hacking → security fallback
 * Run alongside faction-join.js. When done, run faction-buy.js to purchase.
 *
 * RAM: ~6GB
 */

import { FACTION_BUCKET, PRIORITY_AUGS } from "faction-config.js";

const WORK_TYPES = ["hacking", "security"];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== faction-work.js started ===");

  while (true) {
    const ownedAugs = new Set(ns.singularity.getOwnedAugmentations(true));
    const joinedFactions = ns.getPlayer().factions;

    // ── Build work queue ───────────────────────────────────────────────
    // 1. Bucket factions first (in config order), if joined
    // 2. Then any other joined factions with unowned augs
    const bucketQueue = FACTION_BUCKET.filter(f => joinedFactions.includes(f));

    const otherQueue = joinedFactions.filter(f =>
      !FACTION_BUCKET.includes(f) &&
      getUnownedAugs(ns, f, ownedAugs).length > 0
    );

    const workQueue = [...bucketQueue, ...otherQueue];

    if (workQueue.length === 0) {
      ns.print("No factions to work. Waiting...");
      await ns.sleep(60_000);
      continue;
    }

    let anyWorkDone = false;

    for (const faction of workQueue) {
      const unowned = getUnownedAugs(ns, faction, ownedAugs);
      if (unowned.length === 0) {
        ns.print(`✓ ${faction}: no unowned augs, skipping.`);
        continue;
      }

      // Target rep = highest rep requirement among unowned augs for this faction
      const targetRep = Math.max(
        ...unowned.map(a => ns.singularity.getAugmentationRepReq(a))
      );
      const currentRep = ns.singularity.getFactionRep(faction);

      if (currentRep >= targetRep) {
        ns.print(`✓ ${faction}: rep sufficient (${fmt(ns, currentRep)} / ${fmt(ns, targetRep)})`);
        continue;
      }

      // Work this faction until rep threshold is met
      ns.print(`Working ${faction}: ${fmt(ns, currentRep)} / ${fmt(ns, targetRep)} rep needed`);
      anyWorkDone = true;

      const started = startWork(ns, faction);
      if (!started) {
        ns.print(`✗ Could not start work for ${faction}, skipping.`);
        continue;
      }

      while (true) {
        await ns.sleep(10_000);

        const rep = ns.singularity.getFactionRep(faction);
        const pct = Math.min(100, Math.floor((rep / targetRep) * 100));
        ns.print(`  ${faction}: ${fmt(ns, rep)} / ${fmt(ns, targetRep)} rep (${pct}%)`);

        if (rep >= targetRep) {
          ns.singularity.stopAction();
          ns.print(`✓ ${faction}: target rep reached!`);
          ns.toast(`${faction} rep complete!`, "success", 4000);
          break;
        }

        // Re-check in case new augs unlocked from faction-join.js joining new factions
        const newUnowned = getUnownedAugs(ns, faction, new Set(ns.singularity.getOwnedAugmentations(true)));
        const newTarget = Math.max(...newUnowned.map(a => ns.singularity.getAugmentationRepReq(a)));
        if (newTarget > targetRep) {
          ns.print(`  ${faction}: target rep updated to ${fmt(ns, newTarget)}`);
          // Loop continues naturally with the higher target
        }
      }
    }

    if (!anyWorkDone) {
      ns.print("All factions at target rep. Run faction-buy.js when ready to prestige.");
      ns.toast("All faction rep targets met! Ready for faction-buy.js", "success", 8000);
      // Keep running in case new factions are joined
      await ns.sleep(60_000);
    }
  }
}

/** Try to start hacking work, fall back to security */
function startWork(ns, faction) {
  for (const type of WORK_TYPES) {
    if (ns.singularity.workForFaction(faction, type, false)) {
      return true;
    }
  }
  return false;
}

/** Get unowned augs from a faction, excluding NeuroFlux Governor */
function getUnownedAugs(ns, faction, ownedAugs) {
  return ns.singularity.getAugmentationsFromFaction(faction)
    .filter(a => !ownedAugs.has(a) && a !== "NeuroFlux Governor");
}

/** Format large numbers readably */
function fmt(ns, n) {
  return ns.format.number(n, "0.00a");
}
