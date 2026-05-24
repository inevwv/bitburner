/** faction-report.js
 * Read-only preview of what faction-buy.js would purchase and the
 * projected stat multiplier gains after installing everything.
 *
 * Same rep filter as faction-hud.js — only shows augs you can buy now.
 * Run manually anytime. Output goes to tail window.
 *
 * RAM: ~8GB
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
  ns.ui.openTail();
  await ns.sleep(100); // wait for tail to open before resizing
  const [ww, wh] = ns.ui.windowSize();
  ns.ui.resizeTail(Math.min(800, ww * 0.6), wh * 0.85);
  ns.ui.moveTail(ww / 2 - 400, wh * 0.05);

  const ownedAugs    = new Set(ns.singularity.getOwnedAugmentations(true));
  const joinedFactions = ns.getPlayer().factions;

  // ── Build faction list (bucket first, then others with unowned augs) ──
  const bucketFactions = FACTION_BUCKET.filter(f => joinedFactions.includes(f));
  const otherFactions  = joinedFactions.filter(f =>
    !FACTION_BUCKET.includes(f) &&
    getUnownedAugs(ns, f, ownedAugs).length > 0
  );
  const allFactions = [...bucketFactions, ...otherFactions];

  // ── Collect purchasable augs (rep filter) ─────────────────────────────
  const available = collectPurchasableAugs(ns, allFactions, ownedAugs);

  if (available.length === 0) {
    ns.print("No augs available to purchase at current rep levels.");
    return;
  }

  // ── Build buy queue (same logic as faction-buy.js) ────────────────────
  const preset = recommendPreset(ns);

  const priorityQueue = available
    .filter(e => PRIORITY_AUGS.includes(e.aug))
    .sort((a, b) => a.repReq - b.repReq);

  const regularQueue = buildRegularQueue(ns, available.filter(e => !PRIORITY_AUGS.includes(e.aug)), preset);

  const fullQueue = [...priorityQueue, ...regularQueue];

  // ── Calculate total cost with multiplier stacking ─────────────────────
  let totalCost   = 0;
  let multiplier  = 1;
  const withCost  = fullQueue.map(entry => {
    const adjustedPrice = entry.price * multiplier;
    totalCost  += adjustedPrice;
    multiplier *= 1.9;
    return { ...entry, adjustedPrice };
  });

  // ── Print report ───────────────────────────────────────────────────────
  ns.print("╔══════════════════════════════════════════╗");
  ns.print(`║         FACTION BUY REPORT               ║`);
  ns.print("╚══════════════════════════════════════════╝");
  ns.print(`  ${fullQueue.length} augs  |  Total cost: ${ns.format.number(totalCost, 2)}`);
  ns.print(`  Preset: ${preset}`);
  ns.print("");

  // ── Buy order ─────────────────────────────────────────────────────────
  ns.print("── BUY ORDER ──────────────────────────────");
  for (let i = 0; i < withCost.length; i++) {
    const { aug, faction, adjustedPrice, repReq } = withCost[i];
    const isPriority = PRIORITY_AUGS.includes(aug);
    const tag = isPriority ? "★" : " ";
    const num = String(i + 1).padStart(2, " ");
    const name = aug.length > 36 ? aug.slice(0, 35) + "…" : aug.padEnd(36);
    const src  = faction.length > 16 ? faction.slice(0, 15) + "…" : `[${faction}]`.padEnd(18);
    ns.print(`${num}${tag} ${name} ${src} ${ns.format.number(adjustedPrice, 2)}`);
  }

  ns.print("");

  // ── Stat summary ──────────────────────────────────────────────────────
  ns.print("── PROJECTED STAT GAINS ───────────────────");

  const gains = calcStatGains(ns, fullQueue.map(e => e.aug));

  for (const [category, fields] of Object.entries(STAT_CATEGORIES)) {
    // Find which fields actually have gains
    const affected = fields.filter(f => (gains[f] ?? 1) > 1);
    if (affected.length === 0) continue;

    // Average multiplier across affected fields in this category
    const avgMult = affected.reduce((sum, f) => sum + (gains[f] ?? 1), 0) / affected.length;

    // Human-readable field names
    const labels = affected.map(f => f
      .replace(/_mult$/, "")
      .replace(/_/g, " ")
    ).join(", ");

    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    ns.print(`  ${categoryLabel.padEnd(10)} x${avgMult.toFixed(3)}  (${labels})`);
  }

  ns.print("");
  ns.print("── UNAFFORDABLE AT CURRENT REP ────────────");

  // Show augs you're still grinding toward
  let lockedCount = 0;
  for (const faction of allFactions) {
    const currentRep = ns.singularity.getFactionRep(faction);
    const locked = getUnownedAugs(ns, faction, ownedAugs)
      .filter(a => currentRep < ns.singularity.getAugmentationRepReq(a));

    for (const aug of locked) {
      const repReq = ns.singularity.getAugmentationRepReq(aug);
      const pct = Math.min(99, Math.floor((currentRep / repReq) * 100));
      const augName = aug.length > 36 ? aug.slice(0, 35) + "…" : aug.padEnd(36);
      ns.print(`  ${augName} [${faction}] ${pct}%`);
      lockedCount++;
    }
  }

  if (lockedCount === 0) ns.print("  None — all augs unlocked!");

  ns.print("");
  ns.print("Run faction-buy.js to execute this queue.");
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Collect unowned augs where you have sufficient rep, deduped, bucket faction preferred */
function collectPurchasableAugs(ns, factions, ownedAugs) {
  const seen = new Map();

  for (const faction of factions) {
    const currentRep = ns.singularity.getFactionRep(faction);
    const augs = getUnownedAugs(ns, faction, ownedAugs)
      .filter(a => currentRep >= ns.singularity.getAugmentationRepReq(a));

    for (const aug of augs) {
      const repReq = ns.singularity.getAugmentationRepReq(aug);
      const price  = ns.singularity.getAugmentationPrice(aug);
      const stats  = ns.singularity.getAugmentationStats(aug);
      const statValue = Object.values(stats).reduce((sum, v) => sum + (v - 1), 0);
      const entry  = { aug, faction, repReq, price, statValue };

      if (!seen.has(aug)) {
        seen.set(aug, entry);
      } else {
        const oldIsBucket = FACTION_BUCKET.includes(seen.get(aug).faction);
        const newIsBucket = FACTION_BUCKET.includes(faction);
        if (newIsBucket && !oldIsBucket) seen.set(aug, entry);
      }
    }
  }

  return Array.from(seen.values());
}

/** Sort regular augs by preset category then rep efficiency */
function buildRegularQueue(ns, augs, preset) {
  const categoryOrder = PRESETS[preset];

  const tagged = augs.map(entry => {
    const stats    = ns.singularity.getAugmentationStats(entry.aug);
    const statKeys = Object.keys(stats).filter(k => stats[k] !== 1);

    let bestCategoryIdx = categoryOrder.length;
    for (let i = 0; i < categoryOrder.length; i++) {
      const fields = STAT_CATEGORIES[categoryOrder[i]];
      if (statKeys.some(k => fields.includes(k))) {
        bestCategoryIdx = i;
        break;
      }
    }

    const repEfficiency = entry.repReq > 0 ? entry.statValue / entry.repReq : 0;
    return { ...entry, categoryIdx: bestCategoryIdx, repEfficiency };
  });

  return tagged.sort((a, b) =>
    a.categoryIdx !== b.categoryIdx
      ? a.categoryIdx - b.categoryIdx
      : b.repEfficiency - a.repEfficiency
  );
}

/** Calculate cumulative stat multiplier gains from a list of aug names */
function calcStatGains(ns, augNames) {
  const gains = {};
  for (const aug of augNames) {
    const stats = ns.singularity.getAugmentationStats(aug);
    for (const [field, value] of Object.entries(stats)) {
      if (value !== 1) gains[field] = (gains[field] ?? 1) * value;
    }
  }
  return gains;
}

/** Recommend preset based on most nerfed BN stat */
function recommendPreset(ns) {
  const bnMults = ns.getBitNodeMultipliers();
  const categoryScores = {};
  for (const [category, fields] of Object.entries(BN_MULT_FIELDS)) {
    const values = fields.map(f => bnMults[f] ?? 1);
    categoryScores[category] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  const mostNerfed = Object.entries(categoryScores).sort((a, b) => a[1] - b[1])[0][0];
  for (const [name, order] of Object.entries(PRESETS)) {
    if (order[0] === mostNerfed) return name;
  }
  return "Balanced";
}

/** Get unowned augs from a faction, excluding NeuroFlux Governor */
function getUnownedAugs(ns, faction, ownedAugs) {
  return ns.singularity.getAugmentationsFromFaction(faction)
    .filter(a => !ownedAugs.has(a) && a !== "NeuroFlux Governor");
}
