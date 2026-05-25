/** faction-work.js
 * Grinds faction rep in priority order from auto-built bucket.
 * Prompts at startup with recommended bucket — confirm or reorder.
 * Waits for factions you haven't joined yet rather than skipping them.
 *
 * Work type: hacking → security fallback
 * Run alongside faction-join.js. When done, run faction-buy.js to purchase.
 *
 * RAM: ~8GB
 */

import { FACTION_BLOCKLIST } from "faction-config.js";
import { buildBucket, getUnownedAugs, fmt } from "faction-utils.js";

const WORK_TYPES = ["hacking", "security"];

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== faction-work.js started ===");

  // ── Build and confirm bucket ───────────────────────────────────────────
  const recommended = buildBucket(ns);

  ns.print("Recommended bucket:");
  recommended.forEach((f, i) => ns.print(`  ${i + 1}. ${f}`));

  const confirm = await ns.prompt(
    `Recommended faction work order:\n${recommended.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nProceed with this order?`,
    { type: "boolean" }
  );

  const bucket = confirm ? recommended : await chooseBucket(ns, recommended);
  ns.print(`Bucket confirmed: ${bucket.join(", ")}`);

  // ── Main work loop ─────────────────────────────────────────────────────
  while (true) {
    const ownedAugs      = new Set(ns.singularity.getOwnedAugmentations(true));
    const joinedFactions = ns.getPlayer().factions;

    // Bucket factions first, then any other joined factions with unowned augs
    const otherFactions = joinedFactions.filter(f =>
      !bucket.includes(f) &&
      !FACTION_BLOCKLIST.includes(f) &&
      getUnownedAugs(ns, f, ownedAugs).length > 0
    );

    const workQueue = [...bucket, ...otherFactions];
    let anyWorkDone = false;

    for (const faction of workQueue) {
      const unowned = getUnownedAugs(ns, faction, ownedAugs);
      if (unowned.length === 0) {
        ns.print(`✓ ${faction}: no unowned augs, skipping.`);
        continue;
      }

      // Wait for faction join if not yet a member
      if (!joinedFactions.includes(faction)) {
        ns.print(`⏳ ${faction}: not yet joined, waiting...`);
        anyWorkDone = true; // keep looping
        continue;
      }

      const targetRep  = Math.max(...unowned.map(a => ns.singularity.getAugmentationRepReq(a)));
      const currentRep = ns.singularity.getFactionRep(faction);

      if (currentRep >= targetRep) {
        ns.print(`✓ ${faction}: rep sufficient (${fmt(ns, currentRep)} / ${fmt(ns, targetRep)})`);
        continue;
      }

      ns.print(`Working ${faction}: ${fmt(ns, currentRep)} / ${fmt(ns, targetRep)} rep needed`);
      anyWorkDone = true;

      if (!startWork(ns, faction)) {
        ns.print(`✗ Could not start work for ${faction}, skipping.`);
        continue;
      }

      while (true) {
        await ns.sleep(10_000);

        // Re-fetch joined factions in case something changed
        const currentJoined = ns.getPlayer().factions;
        if (!currentJoined.includes(faction)) break; // lost faction somehow

        const rep    = ns.singularity.getFactionRep(faction);
        const target = Math.max(
          ...getUnownedAugs(ns, faction, new Set(ns.singularity.getOwnedAugmentations(true)))
            .map(a => ns.singularity.getAugmentationRepReq(a))
        );
        const pct = Math.min(100, Math.floor((rep / target) * 100));
        ns.print(`  ${faction}: ${fmt(ns, rep)} / ${fmt(ns, target)} (${pct}%)`);

        if (rep >= target) {
          ns.singularity.stopAction();
          ns.print(`✓ ${faction}: target rep reached!`);
          ns.toast(`${faction} rep complete!`, "success", 4000);
          break;
        }
      }
    }

    if (!anyWorkDone) {
      ns.print("All factions at target rep. Run faction-buy.js when ready to prestige.");
      ns.toast("All faction rep targets met! Ready for faction-buy.js", "success", 8000);
    }

    await ns.sleep(30_000);
  }
}

/** Fallback: let user pick order from the recommended list */
async function chooseBucket(ns, recommended) {
  // For now just reverse as a simple alternative — full reordering via prompt
  // is limited by ns.prompt's select type. User can edit config if needed.
  const choice = await ns.prompt(
    "Choose an alternative order:",
    { type: "select", choices: ["Reverse order", "Keep recommended"] }
  );
  return choice === "Reverse order" ? [...recommended].reverse() : recommended;
}

/** Try hacking work first, fall back to security */
function startWork(ns, faction) {
  for (const type of WORK_TYPES) {
    if (ns.singularity.workForFaction(faction, type, false)) return true;
  }
  return false;
}
