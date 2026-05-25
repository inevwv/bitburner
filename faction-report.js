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
  PRIORITY_AUGS,
  PRESETS,
} from "faction-config.js";
import {
  collectPurchasableAugs,
  buildRegularQueue,
  calcStatGains,
  recommendPreset,
  getUnownedAugs,
  fmt,
} from "faction-utils.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  await ns.sleep(100); // wait for tail to open before resizing
  const [ww, wh] = ns.ui.windowSize();
  ns.ui.resizeTail(Math.min(800, ww * 0.6), wh * 0.85);
  ns.ui.moveTail(ww / 2 - 400, wh * 0.05);

  const ownedAugs      = new Set(ns.singularity.getOwnedAugmentations(true));
  const joinedFactions = ns.getPlayer().factions;

  // All joined factions with unowned augs
  const allFactions = joinedFactions.filter(f =>
    getUnownedAugs(ns, f, ownedAugs).length > 0
  );

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
  ns.print("Run faction-buy.js to execute this queue.");
}
