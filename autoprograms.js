/** autoprograms.js
 * Automatically creates all hacking programs as soon as you have
 * the required hacking level. Loops until all programs are done.
 * RAM: ~3.5GB (singularity.createProgram costs 3GB base)
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("ALL");

  // Programs in priority order — NUKE first so you can root servers ASAP,
  // then port openers, then utility programs.
  const programs = [
    "NUKE.exe",
    "BruteSSH.exe",
    "FTPCrack.exe",
    "relaySMTP.exe",
    "HTTPWorm.exe",
    "SQLInject.exe",
    "DeepscanV1.exe",
    "DeepscanV2.exe",
    "AutoLink.exe",
    "Formulas.exe",
  ];

  ns.print("=== autoprograms.js started ===");

  while (true) {
    let allDone = true;

    for (const program of programs) {
      // Skip if already owned
      if (ns.fileExists(program, "home")) continue;

      allDone = false;

      // createProgram returns true if it started, false if requirements not met
      const started = ns.singularity.createProgram(program, false);

      if (started) {
        ns.print(`Creating ${program}...`);

        // Wait until the program finishes (check every 5s)
        while (!ns.fileExists(program, "home")) {
          await ns.sleep(5000);
        }

        ns.print(`✓ ${program} created!`);
        ns.toast(`${program} created!`, "success", 4000);

        // Only work on one program at a time
        break;
      }
    }

    if (allDone) {
      ns.print("✓ All programs created. Script exiting.");
      ns.toast("All hacking programs created!", "success", 6000);
      break;
    }

    // If no program could be started yet (hacking too low), wait and retry
    await ns.sleep(30000);
  }
}
