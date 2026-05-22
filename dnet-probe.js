const REPORT_PORT = 20;
const RIDER_PORT = 21;

// scripts to scp to every authed server
const SCRIPTS = [
  "dnet-probe.js",
  "dnet-rider.js",
  "dnet-interactive-solver.js",
  "dnet-stasis.js",
  "dnet-cache-opener.js",
  "dnet-deploy-rider.js",
  "dnet-storm.js",
];

export async function main(ns) {
  ns.disableLog("ALL");
  ns.clearLog();

  const hostname = ns.getHostname();

  while (true) {
    await reportFiles(ns, hostname);
    const neighbors = ns.dnet.probe();

    ns.print(`[${hostname}] found ${neighbors.length} neighbors`);

    for (const neighbor of neighbors) {
      try {
        const details = ns.dnet.getServerDetails(neighbor);

        if (details.hasSession) {
          ns.print(`[${hostname}] already have session on ${neighbor}, rescanning`);
          const files = ns.ls(neighbor);
          ns.writePort(REPORT_PORT, JSON.stringify({
            host: neighbor,
            from: hostname,
            status: "authenticated",
            depth: ns.dnet.getDepth(neighbor),
            files: files,
          }));

          const availRam = ns.getServerMaxRam(neighbor) - ns.getServerUsedRam(neighbor);
          ns.print(`[${hostname}] ${neighbor} availRam: ${availRam}GB`);
          if (availRam >= 7) {
            ns.print(`[${hostname}] exec'ing solver on ${neighbor}`);
            await ns.scp("dnet-interactive-solver.js", neighbor);
            ns.exec("dnet-interactive-solver.js", neighbor, 1, [], { preventDuplicates: true });
          } else {
            ns.print(`[${hostname}] not enough RAM on ${neighbor} for solver`);
          }
          continue;
        }

        // defer interactive models to dedicated solver
        if (["KingOfTheHill", "RateMyPix.Auth", "The Labyrinth", "(The Labyrinth)", "2G_cellular", "BellaCuore"].includes(details.modelId)) {
          ns.print(`[${hostname}] interactive model ${details.modelId} on ${neighbor} — deferring to solver`);
          ns.writePort(REPORT_PORT, JSON.stringify({
            host: neighbor,
            from: hostname,
            status: "deferred",
            modelId: details.modelId,
            hint: details.passwordHint,
            format: details.passwordFormat,
            length: details.passwordLength,
          }));
          continue;
        }

        // heartbleed for models that need log data
        if (["OpenWebAccessPoint", "DeepGreen", "NIL"].includes(details.modelId)) {
          const logs = await ns.dnet.heartbleed(neighbor, { peek: true });
          ns.print(`[${hostname}] heartbleed ${neighbor}: ${JSON.stringify(logs)}`);

          if (details.modelId === "OpenWebAccessPoint") {
            const matches = logs?.data?.match(/\d+/g) || [];
            details._heartbleedCandidates = [...new Set(
              matches.filter(m => m.length === details.passwordLength)
            )];
          } else if (details.modelId === "DeepGreen" || details.modelId === "NIL") {
            const allDigits = [...new Set((logs?.data?.match(/\d/g) || []))];
            ns.print(`[${hostname}] ${details.modelId} known digits: ${allDigits}`);
            const candidates = [];
            const total = Math.pow(allDigits.length, details.passwordLength);
            for (let i = 0; i < total; i++) {
              let pwd = "";
              let n = i;
              for (let j = 0; j < details.passwordLength; j++) {
                pwd += allDigits[n % allDigits.length];
                n = Math.floor(n / allDigits.length);
              }
              candidates.push(pwd);
            }
            details._heartbleedCandidates = [...new Set(candidates)];
          }

          ns.print(`[${hostname}] heartbleed candidates for ${neighbor}: ${details._heartbleedCandidates?.length ?? 0} total`);
        }

        const passwords = getPasswordCandidates(ns, details);

        if (passwords.length === 0) {
          ns.print(`[${hostname}] can't solve ${neighbor} (${details.modelId})`);
          ns.writePort(REPORT_PORT, JSON.stringify({
            host: neighbor,
            from: hostname,
            status: "unsolvable",
            modelId: details.modelId,
            hint: details.passwordHint,
            data: details.data,
            format: details.passwordFormat,
            length: details.passwordLength,
          }));
          continue;
        }

        let authenticated = false;

        for (const password of passwords) {
          ns.print(`[${hostname}] trying ${neighbor} with: ${password}`);
          const result = await ns.dnet.authenticate(neighbor, password);
          ns.print(`[${hostname}] ${neighbor}: ${result.success} — ${result.message}`);

          if (result.success) {
            authenticated = true;

            await ns.dnet.memoryReallocation(neighbor);
            const ram = ns.getServerMaxRam(neighbor);
            const files = ns.ls(neighbor);
            ns.print(`[${hostname}] freed RAM on ${neighbor}: ${ram}GB`);

            ns.writePort(REPORT_PORT, JSON.stringify({
              host: neighbor,
              from: hostname,
              status: "authenticated",
              depth: ns.dnet.getDepth(neighbor),
              password: password,
              ram: ram,
              files: files,
            }));

            for (const script of SCRIPTS) {
              await ns.scp(script, neighbor);
            }

            ns.exec("dnet-probe.js", neighbor);

            const availRam = ram - ns.getServerUsedRam(neighbor);
            if (availRam >= 7) {
              ns.exec("dnet-interactive-solver.js", neighbor);
            }

            ns.exec("dnet-cache-opener.js", neighbor);

            const depth = ns.dnet.getDepth(neighbor);
            if (depth >= 4) {
              const riderStatus = ns.peek(RIDER_PORT);
              if (riderStatus === "NULL PORT DATA") {
                ns.print(`[${hostname}] scheduling rider deployment on ${neighbor} (depth ${depth})`);
                ns.exec("dnet-deploy-rider.js", neighbor);
                ns.writePort(RIDER_PORT, neighbor);
                ns.writePort(REPORT_PORT, JSON.stringify({
                  host: neighbor,
                  from: hostname,
                  status: "riderDeployed",
                  depth: depth,
                }));
              } else {
                ns.print(`[${hostname}] rider already deployed on ${riderStatus}, skipping`);
              }
            }

            break;
          }
        }

        if (!authenticated) {
          ns.writePort(REPORT_PORT, JSON.stringify({
            host: neighbor,
            from: hostname,
            status: "failed",
            modelId: details.modelId,
            hint: details.passwordHint,
            format: details.passwordFormat,
            length: details.passwordLength,
            tried: passwords.length > 20 ? `${passwords.length} candidates` : passwords.join(", "),
            message: "all attempts failed",
          }));
        }

      } catch (e) {
        ns.print(`[${hostname}] error on ${neighbor}: ${e.message}`);
        ns.writePort(REPORT_PORT, JSON.stringify({
          host: neighbor,
          from: hostname,
          status: "error",
          message: e.message,
        }));
      }
    }

    ns.print(`[${hostname}] cycle done, waiting for mutation`);
    await ns.dnet.nextMutation();
  } // end while
}

async function reportFiles(ns, hostname) {
  if (!ns.dnet.isDarknetServer(hostname)) return;
  const files = ns.ls(hostname);

  const readableFiles = files.filter(f =>
    (f.endsWith(".txt") || f.endsWith(".lit") || f.endsWith(".data"))
    && f !== "loot-index.txt"
  );

  for (const f of readableFiles) {
    const content = ns.read(f);
    ns.print(`[${hostname}] ${f}: ${content}`);
    ns.writePort(REPORT_PORT, JSON.stringify({
      host: hostname,
      from: hostname,
      status: "file",
      filename: f,
      content: content,
    }));
  }

  // lab recon — 0GB RAM cost
  const exes = files.filter(f => f.endsWith(".exe"));
  const radarResult = await ns.dnet.labradar();
  const reportResult = await ns.dnet.labreport();
  ns.print(`[${hostname}] labradar: ${JSON.stringify(radarResult)}`);
  ns.print(`[${hostname}] labreport: ${JSON.stringify(reportResult)}`);
  ns.writePort(REPORT_PORT, JSON.stringify({
    host: hostname,
    from: hostname,
    status: "lab",
    exes: exes,
    radar: radarResult,
    report: reportResult,
  }));

  // recon neighbors
  const neighbors = ns.dnet.probe();
  for (const neighbor of neighbors) {
    const details = ns.dnet.getServerDetails(neighbor);

    // special case — plant stasis on th3_l4byr1nth the moment we see it
    if (neighbor === "th3_l4byr1nth") {
      const linked = ns.dnet.getStasisLinkedServers();
      if (!linked.includes("th3_l4byr1nth")) {
        ns.print(`[${hostname}] th3_l4byr1nth is adjacent — planting stasis!`);
        await ns.scp("dnet-stasis.js", "th3_l4byr1nth");
        ns.exec("dnet-stasis.js", "th3_l4byr1nth");
      }
    }

    if (!details.hasSession) {
      ns.writePort(REPORT_PORT, JSON.stringify({
        host: neighbor,
        from: hostname,
        status: "recon",
        modelId: details.modelId,
        hint: details.passwordHint,
        data: details.data,
        format: details.passwordFormat,
        length: details.passwordLength,
      }));
    } else {
      const blocked = ns.dnet.getBlockedRam(neighbor);
      if (blocked > 0) {
        ns.writePort(REPORT_PORT, JSON.stringify({
          host: neighbor,
          from: hostname,
          status: "blockedRam",
          blocked: blocked,
        }));
      }
    }
  }
}

function getPasswordCandidates(ns, details) {
  const { modelId, passwordHint, data, passwordFormat, passwordLength } = details;

  switch (modelId) {
    case "ZeroLogon":
      return ["", null, undefined].map(v => String(v ?? ""));

    case "Laika4":
      return ["fido", "spot", "rover", "max", "laika"].filter(p => p.length === passwordLength);

    case "DeskMemo_3.1": {
      const words = passwordHint.split(" ");
      const raw = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, "");
      return [raw, words[words.length - 1]];
    }

    case "BellaCuore": {
      // range variant — defer to interactive solver
      if (passwordHint.includes("between")) return [];
      // original single roman numeral variant
      const match = passwordHint.match(/[A-Z]+/);
      if (!match) return [];
      return [String(romanToInt(match[0]))];
    }

    case "AccountsManager_4.2": {
      const candidates = [];
      const max = Math.pow(10, passwordLength);
      for (let i = 0; i < max; i++) candidates.push(String(i));
      return candidates;
    }

    case "EuroZone Free": {
      const eurozone = [
        "Austria", "Belgium", "Croatia", "Cyprus", "Czech Republic",
        "Denmark", "Estonia", "Finland", "France", "Germany",
        "Greece", "Hungary", "Ireland", "Italy", "Latvia",
        "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland",
        "Portugal", "Romania", "Slovakia", "Slovenia", "Spain",
        "Sweden", "Bulgaria",
      ];
      const candidates = [];
      for (const country of eurozone) {
        if (country.length === passwordLength) {
          candidates.push(country);
          candidates.push(country.toLowerCase());
          candidates.push(country.toUpperCase());
        }
      }
      return candidates;
    }
    
    case "FreshInstall_1.0": {
      if (passwordFormat === "numeric") {
        const candidates = new Set();
        candidates.add("0".repeat(passwordLength));
        for (let d = 0; d <= 9; d++) candidates.add(String(d).repeat(passwordLength));
        candidates.add(Array.from({ length: passwordLength }, (_, i) => (i + 1) % 10).join(""));
        candidates.add(Array.from({ length: passwordLength }, (_, i) => (9 - i) % 10).join(""));
        return [...candidates];
      }
      const defaults = [
        "password", "admin", "root", "default", "letmein",
        "welcome", "monkey", "dragon", "master", "passw0rd",
        "qwerty", "abc123", "iloveyou", "sunshine", "princess",
        "mustang", "michael", "superman", "qazwsx", "123qwe",
        "computer", "michelle", "jessica", "pepper", "freedom", "maggie",
        "qwertyuiop", "1qaz2wsx", "zxcvbn",
      ];
      return [...new Set(defaults)].filter(p => p.length === passwordLength);
    }

    case "CloudBlare(tm)": {
      const digits = data.replace(/[^0-9]/g, "");
      return [digits, digits.split("").reverse().join("")];
    }

    case "110100100": {
      if (!data) return [];
      const bytes = data.trim().split(/\s+/);
      const password = bytes.map(b => String.fromCharCode(parseInt(b, 2))).join("");
      return [password];
    }
    
    case "OctantVoxel": {
      const match = passwordHint.match(/base (\d+) number (\w+) in base (\d+)/);
      if (!match) return [];
      const fromBase = parseInt(match[1]);
      const number = match[2];
      const toBase = parseInt(match[3]);
      const decimal = parseInt(number, fromBase);
      return [decimal.toString(toBase)];
    }

    case "OrdoXenos": {
      const match = passwordHint.match(/XOR mask encrypted password: "(.+)"/);
      if (!match) return [];
      const encrypted = match[1];
      const binaryValues = data.split(" ").filter(b => /^[01]+$/.test(b));
      if (binaryValues.length !== encrypted.length) return [];
      const decrypted = encrypted.split("").map((char, i) => {
        const xorVal = parseInt(binaryValues[i], 2);
        return String.fromCharCode(char.charCodeAt(0) ^ xorVal);
      }).join("");
      return [decrypted];
    }
    
    case "MathML": {
      if (!data) return [];
      try {
        const expr = data
          .replace(/➕/g, "+")
          .replace(/➖/g, "-")
          .replace(/✖️/g, "*")
          .replace(/✖/g, "*")
          .replace(/➗/g, "/")
          .replace(/÷/g, "/")
          .replace(/×/g, "*")
          .replace(/\bx\b/g, "*")
          .replace(/\bX\b/g, "*");
    
        const result = Function(`"use strict"; return (${expr})`)();
        const candidates = new Set();
    
        // decimal point counts as a character — slice to passwordLength
        const withDot = String(result).slice(0, passwordLength);
        candidates.add(withDot);
    
        // decimal point doesn't count — get passwordLength digits then reinsert dot
        const raw = String(result);
        const dotIndex = raw.indexOf(".");
        if (dotIndex !== -1) {
          const digits = raw.replace(".", "").slice(0, passwordLength);
          candidates.add(digits.slice(0, dotIndex) + "." + digits.slice(dotIndex));
        } else {
          candidates.add(raw.slice(0, passwordLength));
        }
    
        return [...candidates];
      } catch (e) {
        ns.print(`MathML eval failed: ${e.message}`);
        return [];
      }
    }
        
    case "PHP 5.4": {
      if (!data) return [];
      return permutations(data.split("")).map(p => p.join(""));
    }

    case "PrimeTime 2": {
      if (!data) return [];
      let n = parseInt(data);
      let largest = 1;
      for (let f = 2; f * f <= n; f++) {
        while (n % f === 0) {
          largest = f;
          n = Math.floor(n / f);
        }
      }
      if (n > 1) largest = n;
      return [String(largest)];
    }
        
    case "Factori-Os":
    case "KingOfTheHill": {
      if (passwordLength <= 0 || passwordLength > 4) return [];
      const candidates = [];
      const max = Math.pow(10, passwordLength);
      for (let i = 0; i < max; i++) candidates.push(String(i).padStart(passwordLength, "0"));
      return candidates;
    }

    case "NIL":
    case "DeepGreen":
    case "OpenWebAccessPoint": {
      if (details._heartbleedCandidates?.length > 0) {
        return details._heartbleedCandidates;
      }
      return [];
    }

    case "Pr0verFl0": {
      return [
        "A".repeat(passwordLength * 2),
        "a".repeat(passwordLength * 2),
        "\0".repeat(passwordLength * 2),
      ];
    }

    default:
      ns.print(`Unknown model: ${modelId} | hint: ${passwordHint}`);
      return [];
  }
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = new Set();
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) {
      result.add([arr[i], ...p].join(""));
    }
  }
  return [...result].map(s => s.split(""));
}

function romanToInt(s) {
  const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  for (let i = 0; i < s.length; i++) {
    const curr = vals[s[i]];
    const next = vals[s[i + 1]];
    if (next && curr < next) result -= curr;
    else result += curr;
  }
  return result;
}
