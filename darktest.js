export async function main(ns) {
    const files = ns.ls("crypto$flame");
    ns.tprint(JSON.stringify(files));
}