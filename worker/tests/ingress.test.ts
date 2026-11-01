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
                    env.INGRESS_SECRET,
                    `${time}\n${nonce}\nPOST\n${path}\n${raw}`,
                ),
            },
        }),
        env,
    );
}

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
    assert.equal(
        (await env.DB.prepare('SELECT raw FROM spool').first()).raw,
        null,
    );
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
