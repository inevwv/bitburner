/** faction-buy.js
 * Run manually when ready to prestige.
 * Builds a globally sorted aug buy queue across all joined factions and
 * executes it in order to minimize the price multiplier impact.
 *
 * Buy order:
 *   1. Priority augs (program-granting, debuff-removing) — cheapest rep first
 *   2. Regular augs grouped by preset stat category, sorted by rep efficiency
 *
 * Prompts for stat preset at startup (auto-recommended from BN multipliers).
 * RAM: ~7GB
 */

import {
  PRIORITY_AUGS,
  PRESETS,
} from "faction-config.js";
import {
  collectPurchasableAugs,
  buildRegularQueue,
  recommendPreset,
  fmt,
} from "faction-utils.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== faction-buy.js started ===");

  // ── Step 1: Recommend and confirm preset ──────────────────────────────
  const recommended = recommendPreset(ns);
  const preset = await ns.prompt(
    `Recommended stat preset for this BN: ${recommended}\n\nConfirm or choose a different preset:`,
    { type: "select", choices: Object.keys(PRESETS) }
  ) || recommended;
  ns.print(`Using preset: ${preset}`);

  // ── Step 2: Build buy queue ────────────────────────────────────────────
  const ownedAugs = new Set(ns.singularity.getOwnedAugmentations(true));
  const joinedFactions = ns.getPlayer().factions;

  // Collect all purchasable augs: {aug, faction, repReq, price, statValue}
  const available = collectPurchasableAugs(ns, joinedFactions, ownedAugs);

  if (available.length === 0) {
    ns.tprint("No augs available to purchase. Exiting.");
    return;
  }

  // Split into priority and regular
  const priorityQueue = available
    .filter(a => PRIORITY_AUGS.includes(a.aug))
    .sort((a, b) => a.repReq - b.repReq); // cheapest rep first

  const regularQueue = buildRegularQueue(ns, available.filter(a => !PRIORITY_AUGS.includes(a.aug)), preset);

  const fullQueue = [...priorityQueue, ...regularQueue];

  // ── Step 3: Preview queue ──────────────────────────────────────────────
  ns.tprint("=== Aug Buy Queue ===");
  let multiplier = 1;
  for (const entry of fullQueue) {
    const adjustedPrice = entry.price * multiplier;
    ns.tprint(`  [${entry.faction}] ${entry.aug} — ${ns.format.number(adjustedPrice, 2)} (rep: ${ns.format.number(entry.repReq, 2)})`);
    multiplier *= 1.9; // each aug increases price by 90%
  }
  ns.tprint(`Total augs to buy: ${fullQueue.length}`);

  // ── Step 4: Confirm ────────────────────────────────────────────────────
  const confirm = await ns.prompt(
    `Buy ${fullQueue.length} augmentations in the order shown in the log?\n` +
    `Priority augs: ${priorityQueue.length} | Regular augs: ${regularQueue.length}`,
    { type: "boolean" }
  );

  if (!confirm) {
    ns.tprint("Purchase cancelled.");
    return;
  }

  // ── Step 5: Execute buy queue ──────────────────────────────────────────
  let bought = 0;
  let failed = 0;

  for (const entry of fullQueue) {
    // Re-check ownership in case something changed
    if (ns.singularity.getOwnedAugmentations(true).includes(entry.aug)) {
      ns.print(`Skipping ${entry.aug} — already owned.`);
      continue;
    }

    const success = ns.singularity.purchaseAugmentation(entry.faction, entry.aug);
    if (success) {
      bought++;
      ns.print(`✓ Bought ${entry.aug} from ${entry.faction}`);
    } else {
      failed++;
      ns.print(`✗ Failed to buy ${entry.aug} from ${entry.faction} — insufficient rep or funds?`);
    }
  }

  ns.tprint(`=== Purchase complete: ${bought} bought, ${failed} failed ===`);
  if (failed === 0) {
    ns.toast("All augs purchased! Ready to prestige.", "success", 10_000);
  } else {
    ns.toast(`${bought} augs bought, ${failed} failed. Check logs.`, "warning", 10_000);
  }
}
