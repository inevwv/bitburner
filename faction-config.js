/** faction-config.js
 * Central config for faction automation.
 * Edit this file each reset to define which factions to target,
 * and to override stat priority if desired.
 *
 * Used by: faction-join.js, faction-work.js
 */

// ── Faction Buckets ────────────────────────────────────────────────────────
// Each entry is one prestige's worth of target factions, in work priority order.
// faction-work.js will work them in this order, sweeping all augs from each.
//
// Add/remove factions here each reset. Scripts never need editing.
export const FACTION_BUCKET = [
  "BitRunners",    // Priority 1: Neurolink (FTPCrack + RelaySMTP programs)
  "NiteSec",       // Priority 2: Cranial Gen V, Neural Accelerator, Hacknet augs
  "Chongqing",     // East Asia sweep — faction-join.js picks best scorer of the three
  "New Tokyo",
  "Ishima",
];

// ── City Faction → City Name mapping ──────────────────────────────────────
// Used by faction-join.js to travel to the right city before joining.
export const CITY_FACTION_LOCATIONS = {
  "Sector-12": "Sector-12",
  "Aevum":     "Aevum",
  "Chongqing": "Chongqing",
  "New Tokyo":  "New Tokyo",
  "Ishima":    "Ishima",
  "Volhaven":  "Volhaven",
};

const TRAVEL_COST = 200_000;


// Groups of city factions that are mutually exclusive.
// faction-join.js uses this to avoid joining conflicting cities.
// Sector-12/Aevum are preferred early (program augs); score-based after.
// City factions and their exclusions — used as a fallback if getFactionEnemies() is unavailable.
// In practice faction-join.js uses getFactionEnemies() at runtime which is more accurate.
export const CITY_CONFLICT_GROUPS = [
  ["Sector-12", "Aevum"],                         // mutually exclusive with each other
  ["Sector-12", "Chongqing", "New Tokyo", "Ishima"], // Sector-12 excludes east asia
  ["Aevum", "Chongqing", "New Tokyo", "Ishima"],     // Aevum excludes east asia
  ["Volhaven"],                                    // Volhaven excludes all other cities
];

// ── Faction Blocklist ──────────────────────────────────────────────────────
// Factions to never join — either cleared out or not relevant this run.
// Update each reset based on what you've already swept.
export const FACTION_BLOCKLIST = [
  "Sector-12",   // cleared run 1
  "Aevum",       // cleared run 1
  "Tian Di Hui", // cleared run 1
  "Tetrads",     // cleared run 1
  "Slum Snakes", // cleared run 1
  "The Black Hand", // cleared run 1
];
// until you own all their unique program augs.
export const PROGRAM_FACTIONS = ["BitRunners"];

// ── Aug Categories ─────────────────────────────────────────────────────────
// Maps AugmentationStats field names to stat categories.
// Used to group augs into buckets for preset-based prioritization.
export const STAT_CATEGORIES = {
  hacking: [
    "hacking",
    "hacking_exp",
    "hacking_chance",
    "hacking_speed",
    "hacking_money",
    "hacking_grow",
  ],
  combat: [
    "strength",
    "strength_exp",
    "defense",
    "defense_exp",
    "dexterity",
    "dexterity_exp",
    "agility",
    "agility_exp",
  ],
  charisma: [
    "charisma",
    "charisma_exp",
  ],
  rep: [
    "faction_rep",
    "company_rep",
    "work_money",
  ],
  money: [
    "crime_money",
    "crime_success",
    "work_money",
    "hacknet_node_money",
  ],
};

// ── Stat Presets ───────────────────────────────────────────────────────────
// Each preset is an ordered array of category names.
// faction-work.js uses this to sort the shared-aug bucket.
export const PRESETS = {
  "Hacking-first":  ["hacking", "rep",     "combat",  "charisma", "money"],
  "Combat-first":   ["combat",  "rep",     "hacking", "charisma", "money"],
  "Rep-first":      ["rep",     "hacking", "combat",  "charisma", "money"],
  "Balanced":       ["hacking", "combat",  "rep",     "charisma", "money"],
  "Money-first":    ["money",   "rep",     "hacking", "combat",   "charisma"],
};

// ── BN Multiplier → Recommended Preset ────────────────────────────────────
// faction-work.js reads ns.getBitNodeMultipliers() and picks the preset
// whose priority best compensates for the current BN's nerfs.
//
// Logic: find the stat category whose BN multipliers are lowest (most nerfed),
// then recommend the preset that prioritizes that category.
//
// Maps a category name to the BN multiplier fields that represent it.
export const BN_MULT_FIELDS = {
  hacking: ["HackingLevelMultiplier", "HackExpGain", "ScriptHackMoney"],
  combat:  ["StrengthLevelMultiplier", "DefenseLevelMultiplier",
            "DexterityLevelMultiplier", "AgilityLevelMultiplier"],
  charisma: ["CharismaLevelMultiplier"],
  rep:     ["FactionWorkRepGain", "CompanyWorkRepGain"],
  money:   ["CrimeMoney", "CompanyWorkMoney"],
};

// ── Special Augs ──────────────────────────────────────────────────────────
// Augs that grant programs or remove debuffs — always sorted to the top
// of the buy queue regardless of preset.
export const PRIORITY_AUGS = [
  // Program-granting
  "BitRunners Neurolink",           // FTPCrack + RelaySMTP (BitRunners)
];
