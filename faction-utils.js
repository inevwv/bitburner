/** faction-utils.js
 * Shared helpers for faction automation scripts.
 * Imported by: faction-work.js, faction-buy.js, faction-report.js
 *
 * Also exports buildBucket(ns) which replaces manual FACTION_BUCKET config.
 */

import {
  FACTION_BLOCKLIST,
  FACTION_POOL,
  PRIORITY_AUGS,
  STAT_CATEGORIES,
  PRESETS,
  BN_MULT_FIELDS,
  CITY_CONFLICT_GROUPS,
} from "faction-config.js";

// ── Auto-bucket ────────────────────────────────────────────────────────────

/**
 * Builds a prioritized faction work queue for this run.
 * Scores factions from FACTION_POOL by:
 *   1. Program-granting / debuff-removing augs (PRIORITY_AUGS)
 *   2. Strictly unique augs weighted by BN stat needs
 *   3. Shared augs by rep efficiency (sweep)
 * Resolves city/enemy conflicts, skips blocklisted and cleared factions.
 */
export function buildBucket(ns) {
  const ownedAugs   = new Set(ns.singularity.getOwnedAugmentations(true));
  const allFactions = ns.singularity.getFactions ? ns.singularity.getFactions() : FACTION_POOL;

  // Build a map of aug → all factions that offer it (for uniqueness check)
  const augSources = buildAugSourceMap(ns, allFactions);

  const candidates = FACTION_POOL.filter(f => {
    if (FACTION_BLOCKLIST.includes(f)) return false;
    const unowned = getUnownedAugs(ns, f, ownedAugs);
    return unowned.length > 0;
  });

  const statPriority = getStatPriority(ns);

  const scored = candidates.map(f => ({
    faction: f,
    score:   scoreFaction(ns, f, ownedAugs, augSources, statPriority),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Resolve conflicts — keep highest scorer, drop conflicting lower scorers
  const bucket = [];
  const blocked = new Set();

  for (const { faction } of scored) {
    if (blocked.has(faction)) continue;

    bucket.push(faction);

    // Block enemy factions
    try {
      const enemies = ns.singularity.getFactionEnemies(faction);
      for (const e of enemies) blocked.add(e);
    } catch (_) {
      // getFactionEnemies may not be available — fall back to conflict groups
      for (const group of CITY_CONFLICT_GROUPS) {
        if (group.includes(faction)) {
          for (const other of group) {
            if (other !== faction) blocked.add(other);
          }
        }
      }
    }
  }

  return bucket;
}

/** Score a faction for bucket priority */
function scoreFaction(ns, faction, ownedAugs, augSources, statPriority) {
  const unowned = getUnownedAugs(ns, faction, ownedAugs);
  let score = 0;

  for (const aug of unowned) {
    const isUnique   = (augSources.get(aug) ?? []).length === 1;
    const isPriority = PRIORITY_AUGS.includes(aug);
    const repReq     = ns.singularity.getAugmentationRepReq(aug);
    const stats      = ns.singularity.getAugmentationStats(aug);

    if (isPriority) {
      score += 100_000;
      continue;
    }

    // Stat value weighted by BN stat priority
    let statValue = 0;
    for (const [field, value] of Object.entries(stats)) {
      if (value === 1) continue;
      const categoryIdx = statPriority.findIndex(cat =>
        STAT_CATEGORIES[cat]?.includes(field)
      );
      // Higher priority category = higher weight (5 - idx, so idx 0 = weight 5)
      const weight = categoryIdx >= 0 ? (statPriority.length - categoryIdx) : 1;
      statValue += (value - 1) * weight;
    }

    const repEfficiency = repReq > 0 ? statValue / repReq : 0;

    if (isUnique) {
      score += 10_000 + repEfficiency * 1e6;
    } else {
      score += repEfficiency * 1e5; // shared augs worth less
    }
  }

  return score;
}

/** Build a map of aug name → array of factions that offer it */
function buildAugSourceMap(ns, factions) {
  const map = new Map();
  for (const faction of factions) {
    try {
      for (const aug of ns.singularity.getAugmentationsFromFaction(faction)) {
        if (!map.has(aug)) map.set(aug, []);
        map.get(aug).push(faction);
      }
    } catch (_) { /* faction may not be accessible */ }
  }
  return map;
}

/** Get stat category priority order based on BN multipliers */
export function getStatPriority(ns) {
  const bnMults = ns.getBitNodeMultipliers();
  const scores  = {};

  for (const [cat, fields] of Object.entries(BN_MULT_FIELDS)) {
    const vals = fields.map(f => bnMults[f] ?? 1);
    scores[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  // Sort categories by BN score ascending (most nerfed first = highest priority)
  return Object.entries(scores)
    .sort((a, b) => a[1] - b[1])
    .map(([cat]) => cat);
}

/** Recommend a preset name based on most nerfed BN stat */
export function recommendPreset(ns) {
  const priority = getStatPriority(ns);
  const mostNerfed = priority[0];
  for (const [name, order] of Object.entries(PRESETS)) {
    if (order[0] === mostNerfed) return name;
  }
  return "Balanced";
}

// ── Aug helpers ────────────────────────────────────────────────────────────

/** Get unowned augs from a faction, excluding NeuroFlux Governor */
export function getUnownedAugs(ns, faction, ownedAugs) {
  return ns.singularity.getAugmentationsFromFaction(faction)
    .filter(a => !ownedAugs.has(a) && a !== "NeuroFlux Governor");
}

/** Collect purchasable augs (rep filter) across factions, deduped, bucket faction preferred */
export function collectPurchasableAugs(ns, factions, ownedAugs) {
  const seen = new Map();

  for (const faction of factions) {
    const currentRep = ns.singularity.getFactionRep(faction);
    const augs = getUnownedAugs(ns, faction, ownedAugs)
      .filter(a => currentRep >= ns.singularity.getAugmentationRepReq(a));

    for (const aug of augs) {
      const repReq    = ns.singularity.getAugmentationRepReq(aug);
      const price     = ns.singularity.getAugmentationPrice(aug);
      const stats     = ns.singularity.getAugmentationStats(aug);
      const statValue = Object.values(stats).reduce((sum, v) => sum + (v - 1), 0);
      const entry     = { aug, faction, repReq, price, statValue };

      if (!seen.has(aug)) {
        seen.set(aug, entry);
      } else {
        // Prefer bucket factions as source
        const oldIsBucket = factions.indexOf(seen.get(aug).faction) < factions.indexOf(faction);
        if (!oldIsBucket) seen.set(aug, entry);
      }
    }
  }

  return Array.from(seen.values());
}

/** Sort regular augs by preset category then rep efficiency */
export function buildRegularQueue(ns, augs, preset) {
  const categoryOrder = PRESETS[preset];

  const tagged = augs.map(entry => {
    const stats    = ns.singularity.getAugmentationStats(entry.aug);
    const statKeys = Object.keys(stats).filter(k => stats[k] !== 1);

    let bestCategoryIdx = categoryOrder.length;
    for (let i = 0; i < categoryOrder.length; i++) {
      const fields = STAT_CATEGORIES[categoryOrder[i]];
      if (statKeys.some(k => fields?.includes(k))) {
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
export function calcStatGains(ns, augNames) {
  const gains = {};
  for (const aug of augNames) {
    const stats = ns.singularity.getAugmentationStats(aug);
    for (const [field, value] of Object.entries(stats)) {
      if (value !== 1) gains[field] = (gains[field] ?? 1) * value;
    }
  }
  return gains;
}

/** Format large numbers readably */
export function fmt(ns, n) {
  return ns.format.number(n, 2);
}
