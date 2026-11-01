import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

export async function fixtureTotp() {
    // Fortify correctly rejects replaying one TOTP across two login sessions.
    // Keep the fixture step across Playwright worker restarts after a failed test.
    const stepPath = 'storage/e2e-totp-step';
    const lastFixtureStep = existsSync(stepPath)
        ? Number(readFileSync(stepPath, 'utf8'))
        : 0;
    if (Math.floor(Date.now() / 30000) === lastFixtureStep) {
        await new Promise((resolve) =>
            setTimeout(resolve, 30020 - (Date.now() % 30000)),
        );
    }
    writeFileSync(stepPath, String(Math.floor(Date.now() / 30000)), {
        mode: 0o600,
    });
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const ch of 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')
        bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
    const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
    const tick = Buffer.alloc(8);
    tick.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const digest = createHmac('sha1', key).update(tick).digest();
    return String(
        (digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000,
    ).padStart(6, '0');
}
