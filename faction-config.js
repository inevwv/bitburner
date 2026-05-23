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
  "Tian Di Hui",   // Priority 1: Neuroreceptor (removes unfocused penalty) + SNA (rep gain)
  "Sector-12",     // Priority 2: CashRoot (BruteSSH + starting money)
  "Aevum",         // Priority 3: PCMatrix (DeepscanV1 + AutoLink + work money)
];

// ── City Faction Conflicts ─────────────────────────────────────────────────
// Groups of city factions that are mutually exclusive.
// faction-join.js uses this to avoid joining conflicting cities.
// Sector-12/Aevum are preferred early (program augs); score-based after.
export const CITY_CONFLICT_GROUPS = [
  ["Sector-12", "Aevum"],           // Group A — prefer early for program augs
  ["Chongqing", "New Tokyo", "Ishima"], // Group B
  ["Volhaven"],                     // Excludes all other cities
];

// Factions that give program-granting augs — always preferred over city rivals
// until you own all their unique program augs.
export const PROGRAM_FACTIONS = ["Sector-12", "Aevum", "BitRunners"];

// ── Aug Categories ─────────────────────────────────────────────────────────
// Maps AugmentationStats field names to stat categories.
// Used to group augs into buckets for preset-based prioritization.
export const STAT_CATEGORIES = {
  hacking: [
    "hacking_mult",
    "hacking_exp_mult",
    "hacking_chance_mult",
    "hacking_speed_mult",
    "hacking_money_mult",
    "hacking_grow_mult",
  ],
  combat: [
    "strength_mult",
    "strength_exp_mult",
    "defense_mult",
    "defense_exp_mult",
    "dexterity_mult",
    "dexterity_exp_mult",
    "agility_mult",
    "agility_exp_mult",
  ],
  charisma: [
    "charisma_mult",
    "charisma_exp_mult",
  ],
  rep: [
    "faction_rep_mult",
    "company_rep_mult",
    "work_money_mult",
  ],
  money: [
    "crime_money_mult",
    "crime_success_mult",
    "work_money_mult",
    "hacknet_node_money_mult",
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
  "CashRoot Starter Kit",           // BruteSSH.exe + $1m start (Sector-12)
  "PCMatrix",                       // DeepscanV1 + AutoLink (Aevum)
  "BitRunners Neurolink",           // FTPCrack + RelaySMTP (BitRunners)
  // Debuff-removing
  "Neuroreceptor Management Implant", // Removes unfocused work penalty (Tian Di Hui)
];
