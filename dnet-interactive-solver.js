// dnet-interactive-solver.js
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();
  const neighbors = ns.dnet.probe();

  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "solverAlive",
    neighbors: neighbors,
  }));

  for (const neighbor of neighbors) {
    const details = ns.dnet.getServerAuthDetails(neighbor);
    if (details.hasSession) continue;

    if (details.modelId === "The Labyrinth") {
      await ns.dnet.authenticate(neighbor, "north");
      const logs = await ns.dnet.heartbleed(neighbor, { peek: true });
      ns.print(`[${hostname}] labyrinth logs: ${JSON.stringify(logs)}`);
      ns.writePort(REPORT_PORT, JSON.stringify({
        host: hostname,
        status: "labyrinthLogs",
        target: neighbor,
        logs: logs,
      }));
    } else if (details.modelId === "KingOfTheHill" && details.passwordLength > 4) {
      await solveKingOfTheHill(ns, hostname, neighbor, details);
    } else if (details.modelId === "RateMyPix.Auth") {
      await solveRateMyPix(ns, hostname, neighbor, details);
    }
  }
}

async function solveKingOfTheHill(ns, hostname, neighbor, details) {
  const len = details.passwordLength;
  let lo = 0;
  let hi = Math.pow(10, len) - 1;
  let lastAltitude = -1;

  ns.print(`[${hostname}] KingOfTheHill on ${neighbor} — binary searching ${lo}-${hi}`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "solverWorking",
    target: neighbor,
    modelId: "KingOfTheHill",
    message: `binary searching ${lo}-${hi}`,
  }));

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const guess = String(mid).padStart(len, "0");

    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "solverWorking",
      target: neighbor,
      modelId: "KingOfTheHill",
      attempt: guess,
      range: `${lo}-${hi}`,
    }));

    const result = await ns.dnet.authenticate(neighbor, guess);
    if (result.success) {
      ns.print(`[${hostname}] KingOfTheHill solved: ${guess}`);
      await ns.dnet.memoryReallocation(neighbor);
      const ram = ns.getServerMaxRam(neighbor);
      const files = ns.ls(neighbor);
      ns.writePort(REPORT_PORT, JSON.stringify({
        host: neighbor,
        from: hostname,
        status: "authenticated",
        depth: ns.dnet.getDepth(neighbor),
        password: guess,
        ram: ram,
        files: files,
      }));
      await ns.scp("dnet-probe.js", neighbor);
      await ns.scp("dnet-rider.js", neighbor);
      await ns.scp("dnet-interactive-solver.js", neighbor);
      await ns.scp("dnet-stasis.js", neighbor);
      await ns.scp("dnet-cache-opener.js", neighbor);
      await ns.scp("dnet-deploy-rider.js", neighbor);
      await ns.scp("dnet-storm.js", neighbor);
      ns.exec("dnet-probe.js", neighbor);
      return;
    }

    const logs = await ns.dnet.heartbleed(neighbor, { peek: false });
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "solverHeartbleed",
      target: neighbor,
      modelId: "KingOfTheHill",
      guess: guess,
      logs: logs,
    }));

    const altMatch = logs?.data?.match(/altitude[:\s]+(\d+)/i);
    const altitude = altMatch ? parseInt(altMatch[1]) : null;
    ns.print(`[${hostname}] guess ${guess} altitude: ${altitude}`);

    if (altitude === null) {
      lo = mid + 1;
      continue;
    }

    if (altitude > lastAltitude) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
    lastAltitude = altitude;
  }

  ns.print(`[${hostname}] KingOfTheHill failed on ${neighbor}`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "solverFailed",
    target: neighbor,
    modelId: "KingOfTheHill",
    message: "binary search exhausted",
  }));
}

async function solveRateMyPix(ns, hostname, neighbor, details) {
  const len = details.passwordLength;
  ns.print(`[${hostname}] RateMyPix.Auth on ${neighbor} length ${len}`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    status: "solverWorking",
    target: neighbor,
    modelId: "RateMyPix.Auth",
    message: `starting length ${len}`,
  }));

  const logs = await ns.dnet.heartbleed(neighbor, { peek: true });
  const knownDigits = [...new Set((logs?.data?.match(/\d/g) || []))];
  ns.print(`[${hostname}] RateMyPix known digits: ${knownDigits}`);

  let bestGuess = null;
  let bestScore = -1;
  const tried = new Set();
  const digitPool = knownDigits.length > 0 ? knownDigits : ["0","1","2","3","4","5","6","7","8","9"];

  for (let i = 0; i < 50; i++) {
    let candidate;
    if (bestGuess && bestScore > 0) {
      const arr = bestGuess.split("");
      const pos = Math.floor(Math.random() * len);
      arr[pos] = digitPool[Math.floor(Math.random() * digitPool.length)];
      candidate = arr.join("");
    } else {
      candidate = Array.from({length: len}, () =>
        digitPool[Math.floor(Math.random() * digitPool.length)]
      ).join("");
    }

    if (tried.has(candidate)) continue;
    tried.add(candidate);

    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "solverWorking",
      target: neighbor,
      modelId: "RateMyPix.Auth",
      attempt: candidate,
      bestScore: bestScore,
    }));

    const result = await ns.dnet.authenticate(neighbor, candidate);
    if (result.success) {
      ns.print(`[${hostname}] RateMyPix solved: ${candidate}`);
      await ns.dnet.memoryReallocation(neighbor);
      const ram = ns.getServerMaxRam(neighbor);
      const files = ns.ls(neighbor);
      ns.writePort(REPORT_PORT, JSON.stringify({
        host: neighbor,
        from: hostname,
        status: "authenticated",
        depth: ns.dnet.getDepth(neighbor),
        password: candidate,
        ram: ram,
        files: files,
      }));
      await ns.scp("dnet-probe.js", neighbor);
      await ns.scp("dnet-rider.js", neighbor);
      await ns.scp("dnet-interactive-solver.js", neighbor);
      await ns.scp("dnet-stasis.js", neighbor);
      await ns.scp("dnet-cache-opener.js", neighbor);
      await ns.scp("dnet-deploy-rider.js", neighbor);
      await ns.scp("dnet-storm.js", neighbor);
      ns.exec("dnet-probe.js", neighbor);
      return;
    }

    const spiceLogs = await ns.dnet.heartbleed(neighbor, { peek: false });
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "solverHeartbleed",
      target: neighbor,
      modelId: "RateMyPix.Auth",
      guess: candidate,
      logs: spiceLogs,
    }));

    const spiceMatch = spiceLogs?.data?.match(/🌶️+/);
    const score = spiceMatch ? spiceMatch[0].length : 0;
    ns.print(`[${hostname}] RateMyPix guess ${candidate} score: ${score}/${len}`);

    if (score > bestScore) {
      bestScore = score;
      bestGuess = candidate;
    }
  }

  ns.print(`[${hostname}] RateMyPix failed on ${neighbor} after 50 attempts`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: neighbor,
    status: "solverFailed",
    target: neighbor,
    modelId: "RateMyPix.Auth",
    message: "exceeded attempt limit",
  }));
}
