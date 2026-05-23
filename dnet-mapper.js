// dnet-mapper.js
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  ns.clearLog();
  ns.clearPort(REPORT_PORT);

  const unsolved = {};
  const status = {
    rider: {},
    recentAuths: [],
  };

  const save = async () => {
    // unsolved models
    const unsolvedLines = Object.entries(unsolved).map(([model, info]) =>
      `${model} | ${info.host} | fmt:${info.format} len:${info.length} | "${info.hint}" | data:${info.data || ""}`
    ).join("\n");
    await ns.write("unsolved.txt", unsolvedLines || "none", "w");

    // status dashboard
    const linked = ns.dnet.getStasisLinkedServers();
    await ns.write("status.txt",
      `Generated: ${new Date().toISOString()}\n\n` +
      `=== STASIS LINKS (${linked.length}/${ns.dnet.getStasisLinkLimit()}) ===\n` +
      (linked.length ? linked.map(s => `  ${s} (depth ${ns.dnet.getDepth(s)})`).join("\n") : "  none") + "\n\n" +
      `=== RIDER ===\n` +
      `  host: ${status.rider.host || "unknown"}\n` +
      `  depth: ${status.rider.depth ?? "unknown"}\n\n` +
      `=== RECENT AUTHS ===\n` +
      (status.recentAuths.length
        ? status.recentAuths.slice(-10).map(a => `  ${a.host} (depth ${a.depth}) pw:${a.password}`).join("\n")
        : "  none"),
      "w"
    );
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

      if (report.status === "authenticated") {
        ns.print(`✓ ${report.host} (depth ${report.depth}) via ${report.from} | pw: ${report.password}`);
        status.recentAuths.push({ host: report.host, depth: report.depth, password: report.password });
        if (status.recentAuths.length > 50) status.recentAuths.shift();
        // remove from unsolved if it was there
        delete unsolved[report.host];

      } else if (report.status === "unsolvable") {
        ns.print(`? ${report.host} — ${report.modelId} | fmt: ${report.format} len: ${report.length} | "${report.hint}"`);
        if (report.modelId) {
          unsolved[report.modelId] = {
            host: report.host,
            hint: report.hint,
            data: report.data,
            format: report.format,
            length: report.length,
          };
        }

      } else if (report.status === "failed") {
        ns.print(`✗ ${report.host} — ${report.modelId} | tried: ${report.tried} | fmt: ${report.format} len: ${report.length}`);
        if (report.modelId) {
          unsolved[report.modelId] = {
            host: report.host,
            hint: report.hint,
            data: report.data,
            format: report.format,
            length: report.length,
          };
        }

      } else if (report.status === "deferred") {
        ns.print(`⏳ ${report.host} — ${report.modelId} deferred to interactive solver`);

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
        if (report.modelId && !unsolved[report.modelId]) {
          ns.print(`🔍 ${report.host} — model: ${report.modelId} | hint: "${report.hint}"`);
        }

      } else if (report.status === "lab") {
        if (report.radar?.success || report.report?.success) {
          ns.print(`🔬 LAB ACTIVE on ${report.host}`);
        }

      } else if (report.status === "rider") {
        status.rider = { host: report.host, depth: report.depth };
        ns.print(`🏄 ${report.host} depth:${report.depth} | neighbors: ${report.neighbors.join(", ")}`);

      } else if (report.status === "labUnlocked") {
        ns.print(`🔓 LAB UNLOCKED on ${report.host} depth:${report.depth}`);

      } else if (report.status === "riderDeployed") {
        ns.print(`🚀 rider deployed on ${report.host} (depth ${report.depth})`);

      } else if (report.status === "riderAlive") {
        ns.print(`🟢 rider alive on ${report.host} depth:${report.depth}`);

      } else if (report.status === "riderCrashed") {
        ns.print(`💀 rider crashed on ${report.host}: ${report.error}`);

      } else if (report.status === "blockedRam") {
        ns.print(`🔒 ${report.host} has ${report.blocked}GB blocked RAM`);

      } else if (report.status === "storm") {
        ns.print(`🌩️ STORM UNLEASHED on ${report.host}: ${JSON.stringify(report.result)}`);

      } else if (report.status === "stasisSet") {
        ns.print(`⚓ stasis set on ${report.host} depth:${report.depth}`);

      } else if (report.status === "solverAlive") {
        // suppress — too noisy
      } else if (report.status === "solverWorking") {
        ns.print(`🔧 ${report.host} → ${report.target} (${report.modelId}) | ${report.attempt || report.message}`);

      } else if (report.status === "solverHeartbleed") {
        // suppress — too noisy

      } else if (report.status === "solverFailed") {
        ns.print(`❌ solver failed on ${report.host} → ${report.target} (${report.modelId}): ${report.message}`);
        if (report.modelId) {
          unsolved[report.modelId] = {
            host: report.target,
            hint: "",
            format: "",
            length: "",
          };
        }

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
