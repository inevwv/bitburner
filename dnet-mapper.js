// dnet-mapper.js
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.clearPort(REPORT_PORT);

  let network = {};

  // load existing map if present
  const existing = ns.read("dnet-map.txt");
  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      network = parsed.servers || parsed;
      ns.print(`Loaded ${Object.keys(network).length} servers from existing map`);
    } catch (e) {
      ns.print(`Could not parse existing map: ${e.message}`);
    }
  }

  const save = async () => {
    await ns.write("dnet-map.txt", JSON.stringify({
      generated: new Date().toISOString(),
      status: "live",
      count: Object.keys(network).length,
      servers: network,
    }, null, 2), "w");
  };

  ns.print(`Darknet mapper running...`);

  while (true) {
    const raw = ns.readPort(REPORT_PORT);

    if (raw === "NULL PORT DATA") {
      await ns.sleep(500);
      continue;
    }

    try {
      const report = JSON.parse(raw);
      const existingEntry = network[report.host] || {};
      network[report.host] = { ...existingEntry, ...report };

      if (report.status === "authenticated") {
        ns.print(`✓ ${report.host} (depth ${report.depth}) via ${report.from} | pw: ${report.password}${report.files ? ` | files: ${report.files.join(", ")}` : ""}`);
      } else if (report.status === "unsolvable") {
        ns.print(`? ${report.host} — ${report.modelId} | fmt: ${report.format} len: ${report.length} | "${report.hint}"`);
      } else if (report.status === "deferred") {
        ns.print(`⏳ ${report.host} — ${report.modelId} deferred to interactive solver`);
      } else if (report.status === "failed") {
        ns.print(`✗ ${report.host} — tried: ${report.tried} | fmt: ${report.format} len: ${report.length} | ${report.message}`);
      } else if (report.status === "error") {
        ns.print(`! ${report.host} — error: ${report.message}`);
      } else if (report.status === "file") {
        ns.print(`📄 ${report.host} / ${report.filename}: ${report.content}`);
        const header = `=== ${report.host} / ${report.filename} ===`;
        const lootIndex = ns.read("loot-index.txt");
        if (!lootIndex.includes(header)) {
          await ns.write("loot-index.txt", `\n${header}\n${report.content}\n`, "a");
        }
      } else if (report.status === "cache") {
        ns.print(`💰 ${report.host} / ${report.filename}: ${JSON.stringify(report.result)}`);
      } else if (report.status === "recon") {
        if (!existingEntry.modelId && report.modelId) {
          ns.print(`🔍 ${report.host} — model: ${report.modelId} | hint: "${report.hint}"`);
        }
      } else if (report.status === "lab") {
        if (report.radar?.success || report.report?.success) {
          ns.print(`🔬 LAB ACTIVE on ${report.host} | radar: ${JSON.stringify(report.radar)} | report: ${JSON.stringify(report.report)}`);
        }
      } else if (report.status === "rider") {
        ns.print(`🏄 ${report.host} depth:${report.depth} | neighbors: ${report.neighbors.join(", ")}`);
      } else if (report.status === "labUnlocked") {
        ns.print(`🔓 LAB UNLOCKED on ${report.host} depth:${report.depth} | radar: ${JSON.stringify(report.radar)} | report: ${JSON.stringify(report.report)}`);
      } else if (report.status === "riderDeployed") {
        ns.print(`🚀 rider deployed on ${report.host} (depth ${report.depth})`);
        network[report.host] = { ...existingEntry, riderDeployed: true };
      } else if (report.status === "riderAlive") {
        ns.print(`🟢 rider alive on ${report.host} depth:${report.depth}`);
      } else if (report.status === "riderCrashed") {
        ns.print(`💀 rider crashed on ${report.host}: ${report.error}`);
      } else if (report.status === "blockedRam") {
        ns.print(`🔒 ${report.host} has ${report.blocked}GB blocked RAM`);
      } else if (report.status === "storm") {
        ns.print(`🌩️ STORM UNLEASHED on ${report.host}: ${JSON.stringify(report.result)}`);
      } else if (report.status === "stasisSet") {
        ns.print(`⚓ stasis link set on ${report.host}`);
      } else if (report.status === "solverAlive") {
        ns.print(`🔧 solver alive on ${report.host} | neighbors: ${report.neighbors.join(", ")}`);
      } else if (report.status === "solverWorking") {
        ns.print(`🔧 ${report.host} → ${report.target} (${report.modelId}) | ${report.attempt || report.message}`);
      } else if (report.status === "solverHeartbleed") {
        ns.print(`🩸 ${report.host} → ${report.target} guess:${report.guess} | ${JSON.stringify(report.logs)}`);
      } else if (report.status === "solverFailed") {
        ns.print(`❌ solver failed on ${report.host} → ${report.target} (${report.modelId}): ${report.message}`);
      } else if (report.status === "labyrinthLogs") {
        ns.print(`🌀 labyrinth logs from ${report.host}: ${JSON.stringify(report.logs)}`);
      } else if (report.status === "airgapCrossed") {
        ns.print(`🌉 AIRGAP CROSSED — ${report.host} at depth ${report.depth}`);
      }
    

      await save();

    } catch (e) {
      ns.print(`Bad report: ${raw} — ${e.message}`);
    }
  }
}
