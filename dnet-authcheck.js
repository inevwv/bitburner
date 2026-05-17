

export async function main(ns) {
    const neighbors = ns.dnet.probe();
    for (const s of neighbors) {
        const d = ns.dnet.getServerAuthDetails(s);
        ns.tprint(s + " | model=" + d.modelId + " | hint=" + d.passwordHint + " | data=" + JSON.stringify(d.data) + " | format=" + d.passwordFormat + " | len=" + d.passwordLength);
    }
}