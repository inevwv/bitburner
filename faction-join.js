/** faction-join.js
 * Monitors faction invitations and automatically joins the right ones.
 * Respects city faction conflicts, prioritizes bucket factions, and scores
 * non-bucket invitations by aug value so nothing useful gets missed.
 *
 * Reads faction bucket + conflict groups from faction-config.js
 * RAM: ~5GB
 */

import {
  FACTION_BUCKET,
  FACTION_BLOCKLIST,
  CITY_CONFLICT_GROUPS,
  CITY_FACTION_LOCATIONS,
  PROGRAM_FACTIONS,
  PRIORITY_AUGS,
  STAT_CATEGORIES,
} from "faction-config.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");
  ns.print("=== faction-join.js started ===");

  // Flatten city conflict groups for quick lookup
  const allCityFactions = new Set(CITY_CONFLICT_GROUPS.flat());

  // Track which city conflict group we've committed to (if any)
  // Key: group index, Value: faction name we joined
  const joinedCityGroups = new Map();

  // Seed joinedCityGroups from factions we're already in
  const alreadyIn = ns.getPlayer().factions;
  for (let i = 0; i < CITY_CONFLICT_GROUPS.length; i++) {
    for (const faction of CITY_CONFLICT_GROUPS[i]) {
      if (alreadyIn.includes(faction)) {
        joinedCityGroups.set(i, faction);
        ns.print(`Already in city faction: ${faction} (group ${i})`);
      }
    }
  }

  while (true) {
    const invitations = ns.singularity.checkFactionInvitations();
    const currentFactions = ns.getPlayer().factions;
    const ownedAugs = new Set(ns.singularity.getOwnedAugmentations(true));

    // ── Travel to bucket city factions ────────────────────────────────
    for (const faction of FACTION_BUCKET) {
      if (!(faction in CITY_FACTION_LOCATIONS)) continue;        // not a city faction
      if (currentFactions.includes(faction)) continue;           // already joined
      if (FACTION_BLOCKLIST.includes(faction)) continue;         // blocked
      if (invitations.includes(faction)) continue;               // already invited

      const city = CITY_FACTION_LOCATIONS[faction];
      const currentCity = ns.getPlayer().city;

      if (currentCity === city) continue; // already there

      const money = ns.getServerMoneyAvailable("home");
      if (money * 0.1 < 200_000) {
        ns.print(`Waiting — traveling to ${city} would spend more than 10% of funds.`);
        continue;
      }

      ns.singularity.travelToCity(city);
      ns.print(`✈ Traveled to ${city} for ${faction} invitation.`);
    }

    for (const faction of invitations) {
      if (currentFactions.includes(faction)) continue;

      // ── Blocklist check ──────────────────────────────────────────────
      if (FACTION_BLOCKLIST.includes(faction)) {
        ns.print(`Skipping ${faction} — on blocklist.`);
        continue;
      }
      if (allCityFactions.has(faction)) {
        const groupIdx = CITY_CONFLICT_GROUPS.findIndex(g => g.includes(faction));

        // Check if we're already in a conflicting city faction
        if (joinedCityGroups.has(groupIdx)) {
          ns.print(`Skipping ${faction} — already in ${joinedCityGroups.get(groupIdx)} (same conflict group)`);
          continue;
        }

        // Check if this faction is an enemy of one we're already in
        const enemies = ns.singularity.getFactionEnemies(faction);
        const hasEnemy = currentFactions.some(f => enemies.includes(f));
        if (hasEnemy) {
          ns.print(`Skipping ${faction} — enemy of a faction we've already joined`);
          continue;
        }

        // Check if another city group is already joined and this one conflicts
        let blockedByOtherGroup = false;
        for (const [idx, joined] of joinedCityGroups) {
          if (idx !== groupIdx) {
            const joinedEnemies = ns.singularity.getFactionEnemies(joined);
            if (joinedEnemies.includes(faction)) {
              blockedByOtherGroup = true;
              ns.print(`Skipping ${faction} — conflicts with already-joined ${joined}`);
              break;
            }
          }
        }
        if (blockedByOtherGroup) continue;

        // Should we join this city faction?
        // Early preference: Sector-12 and Aevum if we still need their program augs
        const needsProgramAugs = PROGRAM_FACTIONS.includes(faction) &&
          getUniqueAugs(ns, faction, ownedAugs).some(a => PRIORITY_AUGS.includes(a));

        const bucketIdx = FACTION_BUCKET.indexOf(faction);
        const inBucket = bucketIdx !== -1;

        // Score all city factions in this group that are also invited
        const groupCandidates = CITY_CONFLICT_GROUPS[groupIdx]
          .filter(f => invitations.includes(f) || currentFactions.includes(f));

        const bestInGroup = scoreBest(ns, groupCandidates, ownedAugs, FACTION_BUCKET, PRIORITY_AUGS);

        if (bestInGroup !== faction) {
          ns.print(`Skipping ${faction} — ${bestInGroup} scores higher in same city group`);
          continue;
        }

        // Join it
        ns.singularity.joinFaction(faction);
        joinedCityGroups.set(groupIdx, faction);
        ns.print(`✓ Joined city faction: ${faction}`);
        ns.toast(`Joined ${faction}!`, "success", 4000);
        continue;
      }

      // ── Non-city faction ─────────────────────────────────────────────
      // Check for enemies
      const enemies = ns.singularity.getFactionEnemies(faction);
      const hasEnemy = currentFactions.some(f => enemies.includes(f));
      if (hasEnemy) {
        ns.print(`Skipping ${faction} — enemy of a faction we've already joined`);
        continue;
      }

      // Join if it's in our bucket OR has unowned augs worth having
      const inBucket = FACTION_BUCKET.includes(faction);
      const unownedAugs = getAllUnownedAugs(ns, faction, ownedAugs);

      if (inBucket || unownedAugs.length > 0) {
        ns.singularity.joinFaction(faction);
        ns.print(`✓ Joined ${faction}${inBucket ? " (in bucket)" : " (has unowned augs)"}`);
        ns.toast(`Joined ${faction}!`, "success", 4000);
      } else {
        ns.print(`Skipping ${faction} — no unowned augs and not in bucket`);
      }
    }

    await ns.sleep(30_000);
  }
}

/** Score a list of factions and return the name of the best one */
function scoreBest(ns, factions, ownedAugs, bucket, priorityAugs) {
  let best = null;
  let bestScore = -Infinity;

  for (const faction of factions) {
    const score = scoreFaction(ns, faction, ownedAugs, bucket, priorityAugs);
    if (score > bestScore) {
      bestScore = score;
      best = faction;
    }
  }
  return best;
}

/** Score a faction based on unowned aug value */
function scoreFaction(ns, faction, ownedAugs, bucket, priorityAugs) {
  const augs = getAllUnownedAugs(ns, faction, ownedAugs);
  let score = 0;

  // Bucket membership is a major bonus
  const bucketIdx = bucket.indexOf(faction);
  if (bucketIdx !== -1) score += 10000 - bucketIdx * 100;

  for (const aug of augs) {
    // Priority augs (program-granting, debuff-removing) score very high
    if (priorityAugs.includes(aug)) {
      score += 5000;
      continue;
    }

    // Score by rep efficiency: aug stat value / rep requirement
    const repReq = ns.singularity.getAugmentationRepReq(aug);
    const stats = ns.singularity.getAugmentationStats(aug);
    const statValue = Object.values(stats).reduce((sum, v) => sum + (v - 1), 0);
    score += repReq > 0 ? (statValue / repReq) * 1e6 : statValue;
  }

  return score;
}

/** Get augs from a faction that we don't own yet */
function getAllUnownedAugs(ns, faction, ownedAugs) {
  return ns.singularity.getAugmentationsFromFaction(faction)
    .filter(a => !ownedAugs.has(a) && a !== "NeuroFlux Governor");
}

/** Get augs from a faction that are unique to it (not available elsewhere) */
function getUniqueAugs(ns, faction, ownedAugs) {
  const unowned = getAllUnownedAugs(ns, faction, ownedAugs);
  // An aug is "unique" here if it's in PRIORITY_AUGS — good enough for early check
  return unowned.filter(a => PRIORITY_AUGS.includes(a));
}
