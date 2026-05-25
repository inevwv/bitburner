/** faction-hud.js
 * Displays a persistent HUD overlay showing rep progress and aug count
 * for all factions being worked. Reads the current Bitburner theme live.
 *
 * Toggle visibility: F2
 * Run alongside faction-join.js and faction-work.js
 *
 * RAM: ~3GB
 */

import { PRIORITY_AUGS } from "faction-config.js";
import { getUnownedAugs, buildBucket } from "faction-utils.js";

const TOGGLE_KEY = "F2";
const UPDATE_INTERVAL = 5_000; // ms

/** @param {NS} ns */
export async function main(ns) {
  // Override RAM to exclude the 25GB document access cost.
  // Actual dynamic RAM usage is 17.10GB per the runtime error, so use 18GB to be safe.
  //// ns.ramOverride(18);

  ns.disableLog("ALL");

  // ── Create HUD element ───────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.id = "faction-hud";
  hud.style.cssText = `
    position: fixed;
    top: 64px;
    right: 16px;
    z-index: 9999;
    min-width: 280px;
    max-width: 340px;
    border-radius: 4px;
    font-family: "Courier New", monospace;
    font-size: 13px;
    padding: 10px 14px;
    pointer-events: none;
    transition: opacity 0.2s;
  `;
  document.body.appendChild(hud);

  // ── Toggle visibility on keypress ────────────────────────────────────
  let visible = true;
  const onKey = (e) => {
    if (e.key === TOGGLE_KEY) {
      visible = !visible;
      hud.style.opacity = visible ? "1" : "0";
    }
  };
  document.addEventListener("keydown", onKey);

  // ── Cleanup on script exit ───────────────────────────────────────────
  ns.atExit(() => {
    hud.remove();
    document.removeEventListener("keydown", onKey);
  });

  // Cache bucket — rebuild every 5 minutes since it's expensive
  let bucket = buildBucket(ns);
  let lastBucketBuild = Date.now();
  const BUCKET_REFRESH_MS = 5 * 60 * 1000;

  // ── Main update loop ─────────────────────────────────────────────────
  while (true) {
    const theme = ns.ui.getTheme();
    applyTheme(hud, theme);

    // Refresh bucket periodically
    if (Date.now() - lastBucketBuild > BUCKET_REFRESH_MS) {
      bucket = buildBucket(ns);
      lastBucketBuild = Date.now();
    }

    const ownedAugs = new Set(ns.singularity.getOwnedAugmentations(true));
    const joinedFactions = ns.getPlayer().factions;

    // Build display list: bucket factions first (joined only), then others with unowned augs
    const bucketFactions = bucket.filter(f => joinedFactions.includes(f));
    const otherFactions  = joinedFactions.filter(f =>
      !bucket.includes(f) &&
      getUnownedAugs(ns, f, ownedAugs).length > 0
    );
    const displayFactions = [...bucketFactions, ...otherFactions];

    if (displayFactions.length === 0) {
      hud.innerHTML = styledHTML(theme, `
        <div style="color:${theme.primary}; margin-bottom:6px; font-weight:bold;">
          ◈ FACTION HUD
        </div>
        <div style="color:${theme.secondary};">No active factions.</div>
      `);
      await ns.sleep(UPDATE_INTERVAL);
      continue;
    }

    // ── Money progress ───────────────────────────────────────────────
    const totalCost = calcTotalAugCost(ns, displayFactions, ownedAugs);
    const playerMoney = ns.getPlayer().money;
    const moneyPct = Math.min(100, (playerMoney / totalCost) * 100);
    const moneyDone = playerMoney >= totalCost;

    const moneyRow = `
      <div style="margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid ${theme.secondary};">
        <div style="display:flex; justify-content:space-between; color:${moneyDone ? theme.success : theme.primary};">
          <span>${moneyDone ? "✓" : "·"} Buy Queue Cost</span>
          <span style="font-size:11px; color:${theme.secondary};">${ns.format.number(totalCost, 2)}</span>
        </div>
        <div style="margin-top:3px;">${progressBar(moneyPct, theme)}</div>
        <div style="display:flex; justify-content:space-between; color:${theme.secondary}; font-size:11px; margin-top:2px;">
          <span>${ns.format.number(playerMoney, 2)}</span>
          <span>${ns.format.number(totalCost, 2)}</span>
        </div>
      </div>
    `;

    let rows = "";
    let allDone = true;

    for (const faction of displayFactions) {
      const unowned = getUnownedAugs(ns, faction, ownedAugs);
      if (unowned.length === 0) continue;

      const targetRep = Math.max(...unowned.map(a => ns.singularity.getAugmentationRepReq(a)));
      const currentRep = ns.singularity.getFactionRep(faction);
      const pct = Math.min(100, (currentRep / targetRep) * 100);
      const done = currentRep >= targetRep;

      if (!done) allDone = false;

      // Only count augs we have enough rep for
      const unlocked = unowned.filter(a => currentRep >= ns.singularity.getAugmentationRepReq(a));
      const priorityCount = unlocked.filter(a => PRIORITY_AUGS.includes(a)).length;
      const regularCount  = unlocked.length - priorityCount;

      const augLabel = [
        priorityCount > 0 ? `${priorityCount}★` : "",
        regularCount  > 0 ? `${regularCount}` : "",
      ].filter(Boolean).join(" + ");

      const inBucket = bucket.includes(faction);
      const factionColor = done ? theme.success : (inBucket ? theme.primary : theme.secondary);
      const statusIcon = done ? "✓" : "·";

      rows += `
        <div style="margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; color:${factionColor};">
            <span>${statusIcon} ${faction}</span>
            <span style="color:${theme.secondary}; font-size:11px;">${augLabel} aug${unowned.length !== 1 ? "s" : ""}</span>
          </div>
          <div style="margin-top:3px;">
            ${progressBar(pct, theme)}
          </div>
          <div style="display:flex; justify-content:space-between; color:${theme.secondary}; font-size:11px; margin-top:2px;">
            <span>${ns.format.number(currentRep, 2)}</span>
            <span>${ns.format.number(targetRep, 2)}</span>
          </div>
        </div>
      `;
    }

    const readyMsg = allDone
      ? `<div style="color:${theme.success}; margin-top:4px; text-align:center;">
           ✓ Ready — run faction-buy.js
         </div>`
      : "";

    hud.innerHTML = styledHTML(theme, `
      <div style="color:${theme.primary}; margin-bottom:8px; font-weight:bold; border-bottom: 1px solid ${theme.secondary}; padding-bottom:4px;">
        ◈ FACTION HUD <span style="font-size:10px; font-weight:normal; color:${theme.secondary};">[${TOGGLE_KEY} toggle]</span>
      </div>
      ${moneyRow}
      ${rows}
      ${readyMsg}
    `);

    await ns.sleep(UPDATE_INTERVAL);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function applyTheme(el, theme) {
  el.style.backgroundColor = hexToRgba(theme.backgroundsecondary, 1);
  el.style.backdropFilter   = "blur(6px)";
  el.style.border           = `1px solid ${theme.secondary}`;
  el.style.color            = theme.primary;
}

function styledHTML(theme, inner) {
  return `<div style="color:${theme.primary};">${inner}</div>`;
}

/** Render a simple ASCII progress bar using theme colors */
function progressBar(pct, theme) {
  const width   = 24; // characters
  const filled  = Math.round((pct / 100) * width);
  const empty   = width - filled;
  const bar     = "█".repeat(filled) + "░".repeat(empty);
  const color   = pct >= 100 ? theme.success : theme.infolight ?? theme.primary;
  return `<span style="color:${color}; letter-spacing:1px;">${bar}</span> <span style="color:${theme.secondary}; font-size:11px;">${pct.toFixed(1)}%</span>`;
}

/** Convert hex color to rgba string */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Calculate total cost of all purchasable unowned augs with price multiplier stacking */
function calcTotalAugCost(ns, factions, ownedAugs) {
  const seen = new Set();
  const prices = [];

  for (const faction of factions) {
    const currentRep = ns.singularity.getFactionRep(faction);
    for (const aug of getUnownedAugs(ns, faction, ownedAugs)) {
      if (!seen.has(aug) && currentRep >= ns.singularity.getAugmentationRepReq(aug)) {
        seen.add(aug);
        prices.push(ns.singularity.getAugmentationPrice(aug));
      }
    }
  }

  prices.sort((a, b) => a - b);
  let total = 0;
  let multiplier = 1;
  for (const price of prices) {
    total += price * multiplier;
    multiplier *= 1.9;
  }
  return total;
}
