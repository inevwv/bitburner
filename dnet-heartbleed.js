export async function main(ns) {
    // heartbleed i1ov3you from crypto$flame which is adjacent
    await ns.write("dnet-heartbleed.js", `
export async function main(ns) {
    const target = ns.args[0];
    const result = await ns.dnet.heartbleed(target);
    ns.tprint(JSON.stringify(result));
}`, "w");

    await ns.scp("dnet-heartbleed.js", "crypto$flame");
    ns.exec("dnet-heartbleed.js", "crypto$flame", 1, "i1ov3you");
}