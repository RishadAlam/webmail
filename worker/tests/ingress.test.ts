import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Miniflare } from 'miniflare';
import worker, { receive, signature } from '../src/index';

let mf: Miniflare;
let env: any;
beforeEach(async () => {
    mf = new Miniflare({
        modules: true,
        script: 'export default {fetch(){return new Response("test")}}',
        d1Databases: ['DB'],
        compatibilityDate: '2026-07-01',
    });
    const DB = await mf.getD1Database('DB');
    const schema = await readFile(
        new URL('../schema.sql', import.meta.url),
        'utf8',
    );
    for (const sql of schema
        .split('-- statement')
        .map((s) => s.trim())
        .filter(Boolean))
        await DB.prepare(sql).run();
    await DB.prepare(
        'INSERT INTO recipients(address, active, version) VALUES (?, 1, 1)',
    )
        .bind('mira@postroom.test')
        .run();
    env = {
        DB,
        INGRESS_SECRET: 'local-test-signing-secret-at-least-32-characters',
        RESEND_WEBHOOK_SECRET: 'whsec_' + btoa('synthetic-webhook-secret'),
        APP_URL: 'https://postroom.example',
        MAIL_DOMAIN: 'postroom.test',
    };
});
afterEach(async () => {
    await mf.dispose();
});

async function sendMail(
    raw = 'From: a@example.net\r\nSubject: Test\r\n\r\nFictional mail',
    to = 'mira@postroom.test',
) {
    let rejected: string | undefined;
    await receive(
        {
            from: 'a@example.net',
            to,
            rawSize: new TextEncoder().encode(raw).length,
            raw: new Blob([raw]).stream(),
            setReject: (reason: string) => {
                rejected = reason;
            },
        } as any,
        env,
    );
    return rejected;
}
async function request(
    path: string,
    body: object,
    nonce = crypto.randomUUID(),
    target = env,
) {
    const raw = JSON.stringify(body),
        time = String(Math.floor(Date.now() / 1000));
    return worker.fetch(
        new Request('https://worker.example' + path, {
            method: 'POST',
            body: raw,
            headers: {
                'X-Postroom-Time': time,
                'X-Postroom-Nonce': nonce,
                'X-Postroom-Signature': await signature(
                    target.INGRESS_SECRET,
                    `${time}\n${nonce}\nPOST\n${path}\n${raw}`,
                ),
            },
        }),
        target,
    );
}

async function directorySnapshot(
    revision: number,
    recipients: { address: string; active: boolean }[],
) {
    const canonical = [...recipients].sort((a, b) =>
        a.address < b.address ? -1 : a.address > b.address ? 1 : 0,
    );
    const checksum = Array.from(
        new Uint8Array(
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(JSON.stringify(canonical)),
            ),
        ),
        (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    return { revision, checksum, recipients: canonical };
}

void test('an unknown recipient becomes routable only after a signed directory snapshot and disabled addresses reject', async () => {
    assert.match(
        (await sendMail('Before sync', 'sam@postroom.test'))!,
        /recipient/i,
    );
    const snapshot = await directorySnapshot(1, [
        { address: 'sam@postroom.test', active: true },
        { address: 'mira@postroom.test', active: false },
    ]);
    const response = await request('/v1/directory', snapshot);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        revision: 1,
        checksum: snapshot.checksum,
        count: 2,
    });
    assert.equal(await sendMail('After sync', 'sam@postroom.test'), undefined);
    assert.match(
        (await sendMail('Disabled', 'mira@postroom.test'))!,
        /recipient/i,
    );
    assert.equal(
        (
            await env.DB.prepare(
                'SELECT active FROM recipients WHERE address = ?',
            )
                .bind('mira@postroom.test')
                .first()
        ).active,
        0,
    );
});

void test('directory retries are idempotent and stale, conflicting and replayed snapshots cannot overwrite a newer revision', async () => {
    const first = await directorySnapshot(1, [
        { address: 'sam@postroom.test', active: true },
    ]);
    assert.equal((await request('/v1/directory', first)).status, 200);
    assert.equal((await request('/v1/directory', first)).status, 200);
    const conflict = await directorySnapshot(1, [
        { address: 'sam@postroom.test', active: false },
    ]);
    assert.equal((await request('/v1/directory', conflict)).status, 409);
    const newer = await directorySnapshot(2, [
        { address: 'sam@postroom.test', active: false },
    ]);
    const nonce = crypto.randomUUID();
    assert.equal((await request('/v1/directory', newer, nonce)).status, 200);
    assert.equal((await request('/v1/directory', newer, nonce)).status, 401);
    assert.equal((await request('/v1/directory', first)).status, 409);
    assert.match(
        (await sendMail('Still disabled', 'sam@postroom.test'))!,
        /recipient/i,
    );
    assert.equal(
        (
            await env.DB.prepare(
                'SELECT revision FROM recipient_directory_state',
            ).first()
        ).revision,
        2,
    );
});

void test('directory validation rejects foreign domains, duplicates, too many entries and a false content checksum', async () => {
    const invalid = [
        await directorySnapshot(1, [
            { address: 'sam@foreign.test', active: true },
        ]),
        await directorySnapshot(1, [
            { address: 'sam@postroom.test', active: true },
            { address: 'sam@postroom.test', active: false },
        ]),
        await directorySnapshot(
            1,
            Array.from({ length: 101 }, (_, i) => ({
                address: `person${i}@postroom.test`,
                active: true,
            })),
        ),
        {
            ...(await directorySnapshot(1, [
                { address: 'sam@postroom.test', active: true },
            ])),
            checksum: '0'.repeat(64),
        },
    ];
    for (const snapshot of invalid) {
        assert.equal(
            (
                await request('/v1/directory', {
                    ...snapshot,
                    domain: 'foreign.test',
                })
            ).status,
            422,
        );
    }
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM recipients').first())
            .n,
        1,
    );
    assert.equal(
        (await request('/v1/directory', { padding: 'x'.repeat(32769) })).status,
        413,
    );
});

void test('a failed atomic directory replacement preserves its prior directory revision and accepted spool', async () => {
    const first = await directorySnapshot(1, [
        { address: 'mira@postroom.test', active: true },
    ]);
    assert.equal((await request('/v1/directory', first)).status, 200);
    assert.equal(await sendMail('Already accepted'), undefined);
    const accepted = await env.DB.prepare('SELECT * FROM spool').first();
    await env.DB.prepare(
        "CREATE TRIGGER fail_directory_insert BEFORE INSERT ON recipients WHEN NEW.address = 'blocked@postroom.test' BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END",
    ).run();
    const next = await directorySnapshot(2, [
        { address: 'blocked@postroom.test', active: true },
    ]);
    assert.equal((await request('/v1/directory', next)).status, 503);
    assert.deepEqual(
        (
            await env.DB.prepare(
                'SELECT address, active, version FROM recipients',
            ).all()
        ).results,
        [{ address: 'mira@postroom.test', active: 1, version: 1 }],
    );
    assert.equal(
        (
            await env.DB.prepare(
                'SELECT revision FROM recipient_directory_state',
            ).first()
        ).revision,
        1,
    );
    assert.deepEqual(
        await env.DB.prepare('SELECT * FROM spool').first(),
        accepted,
    );
});

void test('concurrent directory snapshots cannot regress the committed revision', async () => {
    const high = await directorySnapshot(3, [
        { address: 'new@postroom.test', active: true },
    ]);
    const low = await directorySnapshot(2, [
        { address: 'old@postroom.test', active: true },
    ]);
    const responses = await Promise.all([
        request('/v1/directory', high),
        request('/v1/directory', low),
    ]);
    assert.equal(responses[0].status, 200);
    assert.ok([200, 409].includes(responses[1].status));
    assert.deepEqual(
        (await env.DB.prepare('SELECT address FROM recipients').all()).results,
        [{ address: 'new@postroom.test' }],
    );
    assert.equal(
        (
            await env.DB.prepare(
                'SELECT revision FROM recipient_directory_state',
            ).first()
        ).revision,
        3,
    );
});

void test('the full 100-address allowance and an empty replacement are bounded and preserve accepted mail', async () => {
    const full = await directorySnapshot(
        1,
        Array.from({ length: 100 }, (_, i) => ({
            address: `person${i}@postroom.test`,
            active: true,
        })),
    );
    assert.equal((await request('/v1/directory', full)).status, 200);
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM recipients').first())
            .n,
        100,
    );
    assert.equal(
        await sendMail('Accepted before removal', 'person0@postroom.test'),
        undefined,
    );
    const accepted = await env.DB.prepare('SELECT * FROM spool').first();
    const empty = await directorySnapshot(2, []);
    assert.equal((await request('/v1/directory', empty)).status, 200);
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM recipients').first())
            .n,
        0,
    );
    assert.match(
        (await sendMail('After removal', 'person0@postroom.test'))!,
        /recipient/i,
    );
    assert.deepEqual(
        await env.DB.prepare('SELECT * FROM spool').first(),
        accepted,
    );
});

void test('acceptance stores exact MIME in D1 while PHP is absent', async () => {
    assert.equal(await sendMail(), undefined);
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    assert.equal(
        atob(row.raw),
        'From: a@example.net\r\nSubject: Test\r\n\r\nFictional mail',
    );
    assert.equal(row.state, 'pending');
    assert.ok(row.checksum.length === 64);
});
void test('unknown recipients and over-limit messages are explicitly rejected without storage', async () => {
    assert.match(
        (await sendMail('Hello', 'unknown@postroom.test'))!,
        /recipient/i,
    );
    assert.match((await sendMail('x'.repeat(262145)))!, /256 KiB/);
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM spool').first()).n,
        0,
    );
});
void test('concurrent admission cannot overbook spool capacity; previously accepted mail stays', async () => {
    await env.DB.prepare(
        'UPDATE counters SET budget = 3000 WHERE id = 1',
    ).run();
    const results = await Promise.all([
        sendMail('a'.repeat(500)),
        sendMail('b'.repeat(500)),
    ]);
    assert.equal(results.filter((r) => !r).length, 1);
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM spool').first()).n,
        1,
    );
});
void test('lease expiry permits replay and acknowledgement checks the committed checksum', async () => {
    await sendMail();
    const first = (await (
        await request('/v1/claim', { limit: 10 })
    ).json()) as any;
    assert.equal(first.items.length, 1);
    assert.equal(
        ((await (await request('/v1/claim', { limit: 10 })).json()) as any)
            .items.length,
        0,
    );
    await env.DB.prepare('UPDATE spool SET lease_until = 0').run();
    const again = (await (
        await request('/v1/claim', { limit: 10 })
    ).json()) as any;
    assert.equal(again.items[0].id, first.items[0].id);
    assert.equal(
        (await request('/v1/ack', { id: first.items[0].id, checksum: 'wrong' }))
            .status,
        409,
    );
    assert.equal(
        (
            await request('/v1/ack', {
                id: first.items[0].id,
                checksum: first.items[0].checksum,
            })
        ).status,
        200,
    );
    const retained = await env.DB.prepare(
        'SELECT raw, state, bytes, acknowledged_at, retained_until FROM spool',
    ).first();
    assert.equal(
        atob(retained.raw),
        'From: a@example.net\r\nSubject: Test\r\n\r\nFictional mail',
    );
    assert.equal(retained.state, 'acknowledged');
    assert.equal(retained.retained_until - retained.acknowledged_at, 86400);
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        retained.bytes,
    );
    assert.equal(
        ((await (await request('/v1/claim', { limit: 10 })).json()) as any)
            .items.length,
        0,
    );
});

void test('repeated acknowledgement preserves original retention deadline and storage accounting', async () => {
    await sendMail();
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    const receipt = { id: row.id, checksum: row.checksum };
    assert.equal((await request('/v1/ack', receipt)).status, 200);
    const first = await env.DB.prepare('SELECT * FROM spool').first();
    env.ACK_RETENTION_SECONDS = '3600';
    assert.equal((await request('/v1/ack', receipt)).status, 200);
    assert.deepEqual(
        await env.DB.prepare('SELECT * FROM spool').first(),
        first,
    );
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        row.bytes,
    );
});

void test('retention expiry purges acknowledged payloads only and retains counted receipt tombstones', async (t) => {
    await sendMail('Acknowledged content');
    const acknowledged = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', {
        id: acknowledged.id,
        checksum: acknowledged.checksum,
    });
    await env.DB.prepare('UPDATE spool SET retained_until = 1 WHERE id = ?')
        .bind(acknowledged.id)
        .run();
    await sendMail('Still awaiting the main database');
    const pending = await env.DB.prepare(
        "SELECT * FROM spool WHERE state = 'pending'",
    ).first();
    await env.DB.prepare(
        'UPDATE spool SET created_at = 1, retained_until = 1 WHERE id = ?',
    )
        .bind(pending.id)
        .run();
    t.mock.method(globalThis, 'fetch', async () => new Response('{}'));

    await worker.scheduled({} as any, env);
    const purged = await env.DB.prepare('SELECT * FROM spool WHERE id = ?')
        .bind(acknowledged.id)
        .first();
    assert.equal(purged.raw, null);
    assert.equal(purged.bytes, 512);
    assert.equal(purged.checksum, acknowledged.checksum);
    assert.equal(purged.state, 'acknowledged');
    assert.equal(
        (
            await env.DB.prepare('SELECT raw FROM spool WHERE id = ?')
                .bind(pending.id)
                .first()
        ).raw,
        pending.raw,
    );
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        pending.bytes + 512,
    );
    await worker.scheduled({} as any, env);
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        pending.bytes + 512,
    );
    assert.equal(
        (
            await request('/v1/ack', {
                id: acknowledged.id,
                checksum: acknowledged.checksum,
            })
        ).status,
        200,
    );
    assert.equal(
        (
            await env.DB.prepare('SELECT raw FROM spool WHERE id = ?')
                .bind(acknowledged.id)
                .first()
        ).raw,
        null,
    );
});

void test('retained recovery inventory is bounded and explicit signed replay restores the original receipt', async () => {
    await sendMail('Restorable original MIME');
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    const inventory = (await (
        await request('/v1/recovery', { limit: 1 })
    ).json()) as any;
    assert.equal(inventory.items.length, 1);
    assert.equal(inventory.items[0].id, row.id);
    assert.equal(inventory.items[0].checksum, row.checksum);
    assert.equal(inventory.items[0].raw, undefined);
    assert.equal(
        (
            (await (
                await request('/v1/recovery', { after: row.id })
            ).json()) as any
        ).items.length,
        0,
    );
    assert.equal(
        (await request('/v1/replay', { id: row.id, checksum: 'a'.repeat(64) }))
            .status,
        409,
    );
    assert.equal(
        (await request('/v1/replay', { id: row.id, checksum: row.checksum }))
            .status,
        200,
    );
    assert.equal(
        (await request('/v1/replay', { id: row.id, checksum: row.checksum }))
            .status,
        200,
    );
    const claimed = (await (
        await request('/v1/claim', { limit: 10 })
    ).json()) as any;
    assert.equal(claimed.items[0].id, row.id);
    assert.equal(claimed.items[0].checksum, row.checksum);
    assert.equal(atob(claimed.items[0].raw), 'Restorable original MIME');
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        row.bytes,
    );
    const leased = await env.DB.prepare(
        'SELECT lease_until FROM spool',
    ).first();
    await request('/v1/replay', { id: row.id, checksum: row.checksum });
    assert.deepEqual(
        await env.DB.prepare('SELECT lease_until FROM spool').first(),
        leased,
    );
});

void test('recovery refuses expired payloads and malformed inventory bounds', async () => {
    await sendMail();
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    await env.DB.prepare('UPDATE spool SET retained_until = 1').run();
    assert.equal(
        (await request('/v1/replay', { id: row.id, checksum: row.checksum }))
            .status,
        410,
    );
    assert.equal((await request('/v1/recovery', { limit: 100 })).status, 422);
    assert.equal(
        (await request('/v1/recovery', { after: 'x'.repeat(101) })).status,
        422,
    );
    assert.equal(
        (await env.DB.prepare('SELECT state FROM spool').first()).state,
        'acknowledged',
    );
});

void test('recovery inventory pages through retained metadata without exceeding ten receipts', async () => {
    await sendMail();
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    await env.DB.batch(
        Array.from({ length: 11 }, () =>
            env.DB.prepare(
                "INSERT INTO spool(id,kind,raw,checksum,bytes,state,created_at,acknowledged_at,retained_until) VALUES (?,'mail',?,?,?,'acknowledged',1,1,?)",
            ).bind(
                crypto.randomUUID(),
                row.raw,
                row.checksum,
                row.bytes,
                Math.floor(Date.now() / 1000) + 3600,
            ),
        ),
    );
    const first = (await (await request('/v1/recovery', {})).json()) as any;
    assert.equal(first.items.length, 10);
    assert.deepEqual(Object.keys(first.items[0]).sort(), [
        'acknowledged_at',
        'checksum',
        'created_at',
        'id',
        'kind',
        'retained_until',
    ]);
    const second = (await (
        await request('/v1/recovery', { after: first.next_after })
    ).json()) as any;
    assert.equal(second.items.length, 2);
    assert.equal(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
        12,
    );
    const end = (await (
        await request('/v1/recovery', { after: second.next_after })
    ).json()) as any;
    assert.equal(end.items.length, 0);
    assert.equal(end.next_after, null);
});

void test('the retention migration preserves pending data and old purged tombstones without changing accounting', async () => {
    // This explicit pre-retention shape is a migration fixture, independent of the
    // current bootstrap schema. The database is disposable and contains no mail yet.
    await env.DB.prepare('DROP TABLE spool').run();
    await env.DB.prepare(
        "CREATE TABLE spool (id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'mail', recipient TEXT NOT NULL DEFAULT '', sender TEXT NOT NULL DEFAULT '', raw TEXT, checksum TEXT NOT NULL, bytes INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending', lease_until INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
    ).run();
    await env.DB.prepare(
        "INSERT INTO spool(id,raw,checksum,bytes,state,created_at) VALUES ('pending','fictional pending MIME','pending-checksum',2048,'pending',1),('retained','fictional acknowledged MIME','retained-checksum',2048,'acknowledged',1),('purged',NULL,'purged-checksum',512,'acknowledged',1)",
    ).run();
    await env.DB.prepare('UPDATE counters SET used = 4608').run();
    const migration = await readFile(
        new URL(
            '../migrations/0002_acknowledged_payload_retention.sql',
            import.meta.url,
        ),
        'utf8',
    );
    for (const sql of migration
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean))
        await env.DB.prepare(sql).run();
    const pending = await env.DB.prepare(
        "SELECT * FROM spool WHERE id = 'pending'",
    ).first();
    assert.equal(pending.raw, 'fictional pending MIME');
    assert.equal(pending.state, 'pending');
    assert.equal(pending.acknowledged_at, null);
    assert.equal(pending.retained_until, null);
    const retained = await env.DB.prepare(
        "SELECT * FROM spool WHERE id = 'retained'",
    ).first();
    assert.equal(retained.raw, 'fictional acknowledged MIME');
    assert.equal(retained.retained_until - retained.acknowledged_at, 86400);
    assert.ok(retained.acknowledged_at >= Math.floor(Date.now() / 1000) - 1);
    const purged = await env.DB.prepare(
        "SELECT * FROM spool WHERE id = 'purged'",
    ).first();
    assert.equal(purged.raw, null);
    assert.equal(purged.bytes, 512);
    assert.equal(purged.checksum, 'purged-checksum');
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        4608,
    );
});

void test('retained payloads continue consuming capacity and are never purged early to admit new mail', async (t) => {
    await env.DB.prepare(
        'UPDATE counters SET budget = 3000 WHERE id = 1',
    ).run();
    await sendMail('a'.repeat(500));
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return new Response('{}');
    });
    await worker.scheduled({} as any, env);
    assert.match((await sendMail('b'.repeat(500)))!, /cannot safely store/i);
    assert.equal(
        (await env.DB.prepare('SELECT raw FROM spool').first()).raw,
        row.raw,
    );
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        row.bytes,
    );
    assert.equal(calls, 0);
    await env.DB.prepare('UPDATE spool SET retained_until = 1').run();
    await worker.scheduled({} as any, env);
    assert.equal(await sendMail('After expiry'), undefined);
});

void test('one scheduled maintenance pass bounds payload retirement to 100 receipts', async (t) => {
    await sendMail();
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    await env.DB.prepare('UPDATE spool SET retained_until = 1').run();
    await env.DB.batch(
        Array.from({ length: 100 }, () =>
            env.DB.prepare(
                "INSERT INTO spool(id,kind,raw,checksum,bytes,state,created_at,acknowledged_at,retained_until) VALUES (?,'mail',?,?,?,'acknowledged',1,1,1)",
            ).bind(crypto.randomUUID(), row.raw, row.checksum, row.bytes),
        ),
    );
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return new Response('{}');
    });
    await worker.scheduled({} as any, env);
    assert.equal(
        (
            await env.DB.prepare(
                'SELECT count(*) AS n FROM spool WHERE raw IS NULL',
            ).first()
        ).n,
        100,
    );
    assert.equal(
        (await env.DB.prepare('SELECT used FROM counters').first()).used,
        51200 + row.bytes,
    );
    assert.equal(calls, 0);
});

void test('recovery endpoints reject unsigned requests without exposing or changing retained records', async () => {
    await sendMail();
    const row = await env.DB.prepare('SELECT * FROM spool').first();
    await request('/v1/ack', { id: row.id, checksum: row.checksum });
    for (const path of ['/v1/recovery', '/v1/replay']) {
        const response = await worker.fetch(
            new Request('https://worker.example' + path, {
                method: 'POST',
                body: JSON.stringify({ id: row.id, checksum: row.checksum }),
            }),
            env,
        );
        assert.equal(response.status, 401);
    }
    assert.equal(
        (await env.DB.prepare('SELECT state FROM spool').first()).state,
        'acknowledged',
    );
});

void test('cold-start sync allows a slow successful response and never clears pending mail itself', async (t) => {
    await sendMail();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
        const controller = new AbortController();
        setTimeout(
            () => controller.abort(new Error('Simulated deadline')),
            milliseconds,
        );
        return controller.signal;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    t.mock.method(
        globalThis,
        'fetch',
        async (_url: string, options: RequestInit) => {
            entered();
            return new Promise<Response>((resolve, reject) => {
                options.signal!.addEventListener(
                    'abort',
                    () => reject(options.signal!.reason),
                    { once: true },
                );
                setTimeout(() => resolve(new Response('{}')), 65000);
            });
        },
    );
    const sync = worker.scheduled({} as any, env);
    await started;
    t.mock.timers.tick(65000);
    await sync;
    assert.equal(
        (await env.DB.prepare('SELECT failures FROM wake_state').first())
            .failures,
        0,
    );
    assert.equal(
        (await env.DB.prepare('SELECT state FROM spool').first()).state,
        'pending',
    );
});

void test('sync timeout is bounded, cancels a stalled response and backs off without idle pings', async (t) => {
    await sendMail();
    env.SYNC_TIMEOUT_SECONDS = '999999';
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(AbortSignal, 'timeout', (milliseconds: number) => {
        const controller = new AbortController();
        setTimeout(
            () => controller.abort(new Error('Simulated deadline')),
            milliseconds,
        );
        return controller.signal;
    });
    let calls = 0;
    let aborted = false;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    t.mock.method(
        globalThis,
        'fetch',
        async (_url: string, options: RequestInit) => {
            calls++;
            entered();
            return new Promise<Response>((_resolve, reject) => {
                options.signal!.addEventListener(
                    'abort',
                    () => {
                        aborted = true;
                        reject(options.signal!.reason);
                    },
                    { once: true },
                );
            });
        },
    );
    const sync = worker.scheduled({} as any, env);
    await started;
    t.mock.timers.tick(179999);
    assert.equal(aborted, false);
    t.mock.timers.tick(1);
    await sync;
    assert.equal(aborted, true);
    const state = await env.DB.prepare('SELECT * FROM wake_state').first();
    assert.equal(state.failures, 1);
    assert.ok(state.next_at >= Math.floor(Date.now() / 1000) + 1799);
    await worker.scheduled({} as any, env);
    assert.equal(calls, 1);
    await env.DB.prepare("UPDATE spool SET state = 'acknowledged'").run();
    await env.DB.prepare('UPDATE wake_state SET next_at = 0').run();
    await worker.scheduled({} as any, env);
    assert.equal(calls, 1);
});

void test('repeated sync failures keep exponential backoff bounded and a later success resets it', async (t) => {
    await sendMail();
    let responseStatus = 503;
    t.mock.method(
        globalThis,
        'fetch',
        async () => new Response('{}', { status: responseStatus }),
    );
    const delays: number[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
        await env.DB.prepare('UPDATE wake_state SET next_at = 0').run();
        const started = Math.floor(Date.now() / 1000);
        await worker.scheduled({} as any, env);
        const { next_at } = await env.DB.prepare(
            'SELECT next_at FROM wake_state',
        ).first();
        const delay = next_at - started;
        assert.ok(delay >= 1800 && delay <= 86400);
        delays.push(delay);
    }
    assert.ok(delays[1] > delays[0]);
    assert.ok(Math.abs(delays[7] - delays[6]) <= 1);
    responseStatus = 200;
    await env.DB.prepare('UPDATE wake_state SET next_at = 0').run();
    await worker.scheduled({} as any, env);
    const state = await env.DB.prepare('SELECT * FROM wake_state').first();
    assert.equal(state.failures, 0);
    assert.ok(state.next_at <= Math.floor(Date.now() / 1000) + 901);
});
void test('signed requests reject replay and unsigned requests', async () => {
    const nonce = crypto.randomUUID();
    assert.equal(
        (await request('/v1/claim', { limit: 10 }, nonce)).status,
        200,
    );
    assert.equal(
        (await request('/v1/claim', { limit: 10 }, nonce)).status,
        401,
    );
    assert.equal(
        (
            await worker.fetch(
                new Request('https://worker.example/v1/claim', {
                    method: 'POST',
                    body: '{}',
                }),
                env,
            )
        ).status,
        401,
    );
});
void test('signed webhook is durable and deduplicated, modified bytes are rejected', async () => {
    const raw = JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'mail-1', to: ['reader@example.net'] },
    });
    const id = 'evt-1',
        time = String(Math.floor(Date.now() / 1000));
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('synthetic-webhook-secret'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = btoa(
        String.fromCharCode(
            ...new Uint8Array(
                await crypto.subtle.sign(
                    'HMAC',
                    key,
                    new TextEncoder().encode(`${id}.${time}.${raw}`),
                ),
            ),
        ),
    );
    const req = (body = raw) =>
        new Request('https://worker.example/webhooks/resend', {
            method: 'POST',
            body,
            headers: {
                'svix-id': id,
                'svix-timestamp': time,
                'svix-signature': `v1,${sig}`,
            },
        });
    assert.equal((await worker.fetch(req(), env)).status, 200);
    assert.equal((await worker.fetch(req(), env)).status, 200);
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM spool').first()).n,
        1,
    );
    assert.equal((await worker.fetch(req(raw + ' '), env)).status, 401);
});

void test('held receipts cannot starve new accepted mail', async () => {
    for (let i = 0; i < 10; i++) await sendMail('held ' + i);
    const claimed = (await (
        await request('/v1/claim', { limit: 10 })
    ).json()) as any;
    assert.equal(claimed.items.length, 10);
    await env.DB.prepare('UPDATE spool SET lease_until = 1').run();
    await sendMail('new accepted mail');
    const next = (await (
        await request('/v1/claim', { limit: 10 })
    ).json()) as any;
    assert.ok(
        next.items.some((item: any) => atob(item.raw) === 'new accepted mail'),
    );
    assert.equal(
        (await env.DB.prepare('SELECT count(*) AS n FROM spool').first()).n,
        11,
    );
});
void test('maximum-sized mail reserves base64 storage and records a local wall-time sample', async () => {
    const started = performance.now();
    assert.equal(await sendMail('a'.repeat(262144)), undefined);
    const row = await env.DB.prepare('SELECT raw, bytes FROM spool').first();
    assert.ok(row.bytes >= row.raw.length + 2048);
    console.log(
        'LOCAL ONLY maximum MIME ingress wall ms:',
        (performance.now() - started).toFixed(1),
        'reserved bytes:',
        row.bytes,
    );
});

void test('accepted MIME survives a full local D1 runtime restart before import', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'postroom-durable-'));
    const options = {
        modules: true,
        script: 'export default {fetch(){return new Response("test")}}',
        d1Databases: ['DB'],
        d1Persist: directory,
        compatibilityDate: '2026-07-01',
    };
    let instance = new Miniflare(options);
    try {
        let db = await instance.getD1Database('DB');
        const schema = await readFile(
            new URL('../schema.sql', import.meta.url),
            'utf8',
        );
        for (const sql of schema
            .split('-- statement')
            .map((s) => s.trim())
            .filter(Boolean))
            await db.prepare(sql).run();
        await db
            .prepare("INSERT INTO recipients VALUES ('mira@postroom.test',1,1)")
            .run();
        const raw =
            'From: fiction@example.net\r\nSubject: Survives restart\r\n\r\nAccepted mail must stay.';
        let rejected = false;
        await receive(
            {
                from: 'fiction@example.net',
                to: 'mira@postroom.test',
                rawSize: raw.length,
                raw: new Blob([raw]).stream(),
                setReject: () => {
                    rejected = true;
                },
            } as any,
            { ...env, DB: db },
        );
        assert.equal(rejected, false);
        await instance.dispose();
        instance = new Miniflare(options);
        db = await instance.getD1Database('DB');
        const row = (await db
            .prepare('SELECT raw,state FROM spool')
            .first()) as any;
        assert.equal(atob(row.raw), raw);
        assert.equal(row.state, 'pending');
    } finally {
        await instance.dispose();
        await rm(directory, { recursive: true, force: true });
    }
});

void test('acknowledged MIME, its recovery window and budget survive restart and permit exact replay', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'postroom-retained-'));
    const options = {
        modules: true,
        script: 'export default {fetch(){return new Response("test")}}',
        d1Databases: ['DB'],
        d1Persist: directory,
        compatibilityDate: '2026-07-01',
    };
    let instance = new Miniflare(options);
    try {
        let db = await instance.getD1Database('DB');
        const schema = await readFile(
            new URL('../schema.sql', import.meta.url),
            'utf8',
        );
        for (const sql of schema
            .split('-- statement')
            .map((s) => s.trim())
            .filter(Boolean))
            await db.prepare(sql).run();
        await db
            .prepare("INSERT INTO recipients VALUES ('mira@postroom.test',1,1)")
            .run();
        const raw =
            'From: fiction@example.net\r\nSubject: Retained through restart\r\n\r\nFictional recovery evidence.';
        await receive(
            {
                from: 'fiction@example.net',
                to: 'mira@postroom.test',
                rawSize: raw.length,
                raw: new Blob([raw]).stream(),
                setReject: () =>
                    assert.fail('Retention fixture must be accepted'),
            } as any,
            { ...env, DB: db },
        );
        const accepted = (await db
            .prepare('SELECT * FROM spool')
            .first()) as any;
        const receipt = { id: accepted.id, checksum: accepted.checksum };
        assert.equal(
            (
                await request('/v1/ack', receipt, crypto.randomUUID(), {
                    ...env,
                    DB: db,
                })
            ).status,
            200,
        );
        const retained = await db.prepare('SELECT * FROM spool').first();
        await instance.dispose();
        instance = new Miniflare(options);
        db = await instance.getD1Database('DB');
        assert.deepEqual(
            await db.prepare('SELECT * FROM spool').first(),
            retained,
        );
        assert.equal(
            ((await db.prepare('SELECT used FROM counters').first()) as any)
                .used,
            accepted.bytes,
        );
        assert.equal(
            (
                await request('/v1/replay', receipt, crypto.randomUUID(), {
                    ...env,
                    DB: db,
                })
            ).status,
            200,
        );
        const replay = (await (
            await request('/v1/claim', { limit: 1 }, crypto.randomUUID(), {
                ...env,
                DB: db,
            })
        ).json()) as any;
        assert.equal(replay.items[0].id, receipt.id);
        assert.equal(replay.items[0].checksum, receipt.checksum);
        assert.equal(atob(replay.items[0].raw), raw);
    } finally {
        await instance.dispose();
        await rm(directory, { recursive: true, force: true });
    }
});
