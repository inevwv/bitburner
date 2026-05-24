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
  FACTION_BUCKET,
  PRIORITY_AUGS,
  STAT_CATEGORIES,
  PRESETS,
  BN_MULT_FIELDS,
} from "faction-config.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== faction-buy.js started ===");

  // ── Step 1: Recommend and confirm preset ──────────────────────────────
  const preset = await choosePreset(ns);
  ns.print(`Using preset: ${preset}`);

  // ── Step 2: Build buy queue ────────────────────────────────────────────
  const ownedAugs = new Set(ns.singularity.getOwnedAugmentations(true));
  const joinedFactions = ns.getPlayer().factions;

  // Collect all purchasable augs: {aug, faction, repReq, price, statValue}
  const available = collectAvailableAugs(ns, joinedFactions, ownedAugs);

  if (available.length === 0) {
    ns.tprint("No augs available to purchase. Exiting.");
    return;
  }

  // Split into priority and regular
  const priorityQueue = available
    .filter(a => PRIORITY_AUGS.includes(a.aug))
    .sort((a, b) => a.repReq - b.repReq); // cheapest rep first

  const regularQueue = buildRegularQueue(available.filter(a => !PRIORITY_AUGS.includes(a.aug)), preset);

  const fullQueue = [...priorityQueue, ...regularQueue];

  // ── Step 3: Preview queue ──────────────────────────────────────────────
  ns.tprint("=== Aug Buy Queue ===");
  let multiplier = 1;
  for (const entry of fullQueue) {
    const adjustedPrice = entry.price * multiplier;
    ns.tprint(`  [${entry.faction}] ${entry.aug} — ${ns.format.number(adjustedPrice, "$0.00a")} (rep: ${ns.format.number(entry.repReq, "0.00a")})`);
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

// ── Preset selection ───────────────────────────────────────────────────────

async function choosePreset(ns) {
  const recommended = recommendPreset(ns);
  const presetNames = Object.keys(PRESETS);

  const choice = await ns.prompt(
    `Recommended stat preset for this BN: ${recommended}\n\nConfirm or choose a different preset:`,
    { type: "select", choices: presetNames }
  );

  return choice || recommended;
}

/** Recommend a preset based on which stat category is most nerfed in this BN */
function recommendPreset(ns) {
  const bnMults = ns.getBitNodeMultipliers();

  // Average the BN multipliers for each category — lowest average = most nerfed
  const categoryScores = {};
  for (const [category, fields] of Object.entries(BN_MULT_FIELDS)) {
    const values = fields.map(f => bnMults[f] ?? 1);
    categoryScores[category] = values.reduce((a, b) => a + b, 0) / values.length;
  }

  // Find the most nerfed category
  const mostNerfed = Object.entries(categoryScores)
    .sort((a, b) => a[1] - b[1])[0][0];

  // Find the preset that prioritizes that category
  for (const [name, order] of Object.entries(PRESETS)) {
    if (order[0] === mostNerfed) return name;
  }

  return "Balanced";
}

// ── Aug collection ─────────────────────────────────────────────────────────

/** Collect all unowned augs available from joined factions, deduped by aug name */
function collectAvailableAugs(ns, factions, ownedAugs) {
  const seen = new Map(); // aug name → best entry (bucket faction preferred)

  for (const faction of factions) {
    const augs = ns.singularity.getAugmentationsFromFaction(faction)
      .filter(a => !ownedAugs.has(a) && a !== "NeuroFlux Governor");

    for (const aug of augs) {
      const repReq = ns.singularity.getAugmentationRepReq(aug);
      const currentRep = ns.singularity.getFactionRep(faction);

      // Only include if we have enough rep
      if (currentRep < repReq) continue;

      const price = ns.singularity.getAugmentationPrice(aug);
      const stats = ns.singularity.getAugmentationStats(aug);
      const statValue = Object.values(stats).reduce((sum, v) => sum + (v - 1), 0);

      const entry = { aug, faction, repReq, price, statValue };

      if (!seen.has(aug)) {
        seen.set(aug, entry);
      } else {
        // Prefer bucket factions as the source
        const existing = seen.get(aug);
        const newIsBucket = FACTION_BUCKET.includes(faction);
        const oldIsBucket = FACTION_BUCKET.includes(existing.faction);
        if (newIsBucket && !oldIsBucket) seen.set(aug, entry);
      }
    }
  }

  return Array.from(seen.values());
}

// ── Queue sorting ──────────────────────────────────────────────────────────

/** Sort regular augs by preset category order, then rep efficiency within each category */
function buildRegularQueue(augs, preset) {
  const categoryOrder = PRESETS[preset];

  // Tag each aug with its best matching category
  const tagged = augs.map(entry => {
    const stats = ns.singularity.getAugmentationStats(entry.aug);
    const statKeys = Object.keys(stats).filter(k => stats[k] !== 1);

    let bestCategoryIdx = categoryOrder.length; // uncategorized goes last
    for (let i = 0; i < categoryOrder.length; i++) {
      const categoryFields = STAT_CATEGORIES[categoryOrder[i]];
      if (statKeys.some(k => categoryFields.includes(k))) {
        bestCategoryIdx = i;
        break;
      }
    }

    const repEfficiency = entry.repReq > 0 ? entry.statValue / entry.repReq : 0;
    return { ...entry, categoryIdx: bestCategoryIdx, repEfficiency };
  });

  // Sort: category order first, then rep efficiency descending within category
  return tagged.sort((a, b) => {
    if (a.categoryIdx !== b.categoryIdx) return a.categoryIdx - b.categoryIdx;
    return b.repEfficiency - a.repEfficiency;
  });
}
