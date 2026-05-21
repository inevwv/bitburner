// dnet-interactive-solver.js
const REPORT_PORT = 20;

export async function main(ns) {
  ns.disableLog("ALL");
  const hostname = ns.getHostname();

  ns.print(`[${hostname}] solver started`);

  while (true) {
    const neighbors = ns.dnet.probe();

    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      status: "solverAlive",
      neighbors: neighbors,
    }));

    for (const neighbor of neighbors) {
      const details = ns.dnet.getServerDetails(neighbor);
      ns.print(`[${hostname}] checking ${neighbor} | model: ${details.modelId} | hasSession: ${details.hasSession}`);
      if (details.hasSession) continue;

      if (details.modelId === "The Labyrinth" || details.modelId === "(The Labyrinth)") {
        await solveLabyrinth(ns, hostname, neighbor);
      } else if (details.modelId === "KingOfTheHill" && details.passwordLength > 4) {
        await solveKingOfTheHill(ns, hostname, neighbor, details);
      } else if (details.modelId === "RateMyPix.Auth") {
        await solveRateMyPix(ns, hostname, neighbor, details);
      } else if (details.modelId === "BellaCuore") {
        await solveBellaCuore(ns, hostname, neighbor, details);
      } else if (details.modelId === "2G_cellular") {
        await solve2GCellular(ns, hostname, neighbor, details);
      }
    }

    await ns.dnet.nextMutation();
  }
}

async function solveLabyrinth(ns, hostname, neighbor) {
  const log = async (msg) => {
    ns.print(msg);
    await ns.write("labyrinth-log.txt", `${new Date().toISOString()} ${msg}\n`, "a");
  };

  await log(`[${hostname}] solving labyrinth on ${neighbor}`);

  const marks = {}; // passage marks: "x,y->dir" = count
  const opposite = { north: "south", south: "north", east: "west", west: "east" };
  const directions = ["north", "east", "south", "west"];

  const mark = (pos, dir) => {
    const key = `${pos}->${dir}`;
    marks[key] = (marks[key] || 0) + 1;
    return marks[key];
  };

  const getMarks = (pos, dir) => marks[`${pos}->${dir}`] || 0;

  while (true) {
    const report = await ns.dnet.labreport();
    if (!report.success) { await log(`labreport failed`); break; }

    const pos = `${report.coords[0]},${report.coords[1]}`;
    await log(`[${hostname}] at ${pos} | n:${report.north} e:${report.east} s:${report.south} w:${report.west}`);

    const available = directions.filter(d => report[d]);

    // Tremaux: prefer unmarked passages, then once-marked, never twice-marked
    let next = available.find(d => getMarks(pos, d) === 0);

    if (!next) {
      // no unmarked — take least marked that isn't twice marked
      next = available
        .filter(d => getMarks(pos, d) < 2)
        .sort((a, b) => getMarks(pos, a) - getMarks(pos, b))[0];
    }

    if (!next) {
      await log(`[${hostname}] all passages twice marked — dead end, maze unsolvable`);
      break;
    }

    mark(pos, next);

    const result = await ns.dnet.authenticate(neighbor, `go ${next}`);
    if (result.success) {
      await log(`[${hostname}] labyrinth solved!`);
      await ns.dnet.memoryReallocation(neighbor);
      const ram = ns.getServerMaxRam(neighbor);
      const files = ns.ls(neighbor);
      ns.writePort(REPORT_PORT, JSON.stringify({
        host: neighbor,
        from: hostname,
        status: "authenticated",
        depth: ns.dnet.getDepth(neighbor),
        password: "maze",
        ram: ram,
        files: files,
      }));
      await Promise.all(["dnet-probe.js","dnet-rider.js","dnet-interactive-solver.js",
        "dnet-stasis.js","dnet-cache-opener.js","dnet-deploy-rider.js","dnet-storm.js"]
        .map(s => ns.scp(s, neighbor)));
      ns.exec("dnet-cache-opener.js", neighbor);
      ns.exec("dnet-probe.js", neighbor);
      return;
    }

    // mark the arrival side too
    const newReport = await ns.dnet.labreport();
    if (newReport.success) {
      const newPos = `${newReport.coords[0]},${newReport.coords[1]}`;
      mark(newPos, opposite[next]);
    }
  }

  await log(`[${hostname}] labyrinth failed`);
}
function move(coords, direction) {
  const [x, y] = coords;
  switch (direction) {
    case "north": return [x, y - 1];
    case "south": return [x, y + 1];
    case "east":  return [x + 1, y];
    case "west":  return [x - 1, y];
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
      await Promise.all(["dnet-probe.js","dnet-rider.js","dnet-interactive-solver.js",
        "dnet-stasis.js","dnet-cache-opener.js","dnet-deploy-rider.js","dnet-storm.js"]
        .map(s => ns.scp(s, neighbor)));
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
      await Promise.all(["dnet-probe.js","dnet-rider.js","dnet-interactive-solver.js",
        "dnet-stasis.js","dnet-cache-opener.js","dnet-deploy-rider.js","dnet-storm.js"]
        .map(s => ns.scp(s, neighbor)));
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

async function solveBellaCuore(ns, hostname, neighbor, details) {
  const match = details.passwordHint.match(/between '(\w+)' and '(\w+)'/);
  if (!match) return;

  let lo = romanToInt(match[1]) || 0; // nulla = 0
  let hi = romanToInt(match[2]);

  ns.print(`[${hostname}] BellaCuore binary search ${lo}-${hi}`);

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const guess = String(mid);

    const result = await ns.dnet.authenticate(neighbor, guess);
    if (result.success) {
      ns.print(`[${hostname}] BellaCuore solved: ${guess}`);
      // ... standard post-auth block
      return;
    }

    const logs = await ns.dnet.heartbleed(neighbor, { peek: false });
    const feedback = logs?.data || "";
    ns.print(`[${hostname}] BellaCuore guess ${guess} feedback: ${feedback}`);

    if (feedback.includes("ALTUS NIMIS")) {
      hi = mid - 1;
    } else if (feedback.includes("PARUM BREVIS")) {
      lo = mid + 1;
    } else {
      lo = mid + 1; // unknown feedback, just advance
    }
  }

  ns.print(`[${hostname}] BellaCuore failed`);
}

async function solve2GCellular(ns, hostname, neighbor, details) {
  const len = details.passwordLength;
  ns.print(`[${hostname}] 2G_cellular timing attack on ${neighbor} length ${len}`);

  let known = "";

  for (let pos = 0; pos < len; pos++) {
    let bestDigit = "0";
    let bestTime = -1;

    for (let d = 0; d <= 9; d++) {
      const guess = known + String(d).repeat(len - pos);
      await ns.dnet.authenticate(neighbor, guess);
      const logs = await ns.dnet.heartbleed(neighbor, { peek: false });
      const timeMatch = logs?.data?.match(/Response time: (\d+)ms/);
      const time = timeMatch ? parseInt(timeMatch[1]) : 0;
      ns.print(`[${hostname}] pos ${pos} digit ${d} time: ${time}ms`);

      if (time > bestTime) {
        bestTime = time;
        bestDigit = String(d);
      }
    }

    known += bestDigit;
    ns.print(`[${hostname}] position ${pos} = ${bestDigit}, known so far: ${known}`);
  }

  // try the full password
  const result = await ns.dnet.authenticate(neighbor, known);
  if (result.success) {
    ns.print(`[${hostname}] 2G_cellular solved: ${known}`);
    await ns.dnet.memoryReallocation(neighbor);
    const ram = ns.getServerMaxRam(neighbor);
    const files = ns.ls(neighbor);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: neighbor,
      from: hostname,
      status: "authenticated",
      depth: ns.dnet.getDepth(neighbor),
      password: known,
      ram: ram,
      files: files,
    }));
    await Promise.all(["dnet-probe.js","dnet-rider.js","dnet-interactive-solver.js",
      "dnet-stasis.js","dnet-cache-opener.js","dnet-deploy-rider.js","dnet-storm.js"]
      .map(s => ns.scp(s, neighbor)));
    ns.exec("dnet-probe.js", neighbor);
  }
}
