export interface Env {
    DB: D1Database;
    INGRESS_SECRET: string;
    RESEND_WEBHOOK_SECRET: string;
    APP_URL: string;
}
const MAX = 262144;
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const hex = (data: ArrayBuffer) =>
    Array.from(new Uint8Array(data), (b) =>
        b.toString(16).padStart(2, '0'),
    ).join('');
export async function signature(secret: string, body: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
}
async function bounded(
    stream: ReadableStream<Uint8Array> | null,
    max = MAX,
): Promise<Uint8Array> {
    if (!stream) throw new Error('Empty payload');
    const reader = stream.getReader(),
        chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
            await reader.cancel();
            throw new Error('Message exceeds 256 KiB');
        }
        chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        data.set(chunk, offset);
        offset += chunk.length;
    }
    return data;
}
function base64(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i += 8192)
        s += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(s);
}
async function store(
    env: Env,
    id: string,
    kind: string,
    data: Uint8Array,
    recipient = '',
    sender = '',
): Promise<void> {
    const checksum = hex(await crypto.subtle.digest('SHA-256', data));
    const existing = await env.DB.prepare(
        'SELECT checksum FROM spool WHERE id = ?',
    )
        .bind(id)
        .first<{ checksum: string }>();
    if (existing) {
        if (existing.checksum !== checksum)
            throw new Error('Conflicting receipt');
        return;
    }
    const encoded = base64(data);
    // The admission trigger and INSERT are one atomic SQLite/D1 statement.
    await env.DB.prepare(
        'INSERT INTO spool(id,kind,recipient,sender,raw,checksum,bytes,created_at) VALUES (?,?,?,?,?,?,?,?)',
    )
        .bind(
            id,
            kind,
            recipient,
            sender,
            encoded,
            checksum,
            encoded.length + 2048,
            now(),
        )
        .run();
}
export async function receive(
    message: ForwardableEmailMessage,
    env: Env,
): Promise<void> {
    const recipient = message.to.toLowerCase();
    try {
        const address = await env.DB.prepare(
            'SELECT active FROM recipients WHERE address = ?',
        )
            .bind(recipient)
            .first<{ active: number }>();
        if (!address?.active) {
            message.setReject('Unknown or disabled recipient');
            return;
        }
        if (message.rawSize > MAX) {
            message.setReject('Message exceeds the 256 KiB pilot limit');
            return;
        }
        const raw = await bounded(message.raw);
        await store(
            env,
            crypto.randomUUID(),
            'mail',
            raw,
            recipient,
            message.from,
        );
    } catch {
        // No success is returned before durable storage. Cloudflare setReject is permanent.
        message.setReject(
            'Postroom cannot safely store this message. Contact the recipient another way.',
        );
    }
}
function json(data: unknown, status = 200): Response {
    return Response.json(data, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}
async function authenticate(
    request: Request,
    env: Env,
    raw: string,
): Promise<boolean> {
    const timestamp = request.headers.get('X-Postroom-Time') ?? '',
        nonce = request.headers.get('X-Postroom-Nonce') ?? '',
        supplied = request.headers.get('X-Postroom-Signature') ?? '';
    if (
        !env.INGRESS_SECRET ||
        env.INGRESS_SECRET.length < 32 ||
        !/^\d{10}$/.test(timestamp) ||
        Math.abs(now() - Number(timestamp)) > 300 ||
        !/^[a-zA-Z0-9-]{16,80}$/.test(nonce) ||
        !/^[a-f0-9]{64}$/.test(supplied)
    )
        return false;
    const signed = `${timestamp}\n${nonce}\n${request.method}\n${new URL(request.url).pathname}\n${raw}`;
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.INGRESS_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );
    const bytes = Uint8Array.from(supplied.match(/../g)!, (h) =>
        parseInt(h, 16),
    );
    if (
        !(await crypto.subtle.verify(
            'HMAC',
            key,
            bytes,
            encoder.encode(signed),
        ))
    )
        return false;
    try {
        await env.DB.prepare(
            'DELETE FROM request_nonces WHERE nonce IN (SELECT nonce FROM request_nonces WHERE expires_at < ? LIMIT 100)',
        )
            .bind(now())
            .run();
        await env.DB.prepare('INSERT INTO request_nonces VALUES (?,?)')
            .bind(nonce, now() + 600)
            .run();
        return true;
    } catch {
        return false;
    }
}
async function webhook(
    request: Request,
    env: Env,
    data: Uint8Array,
): Promise<Response> {
    const id = request.headers.get('svix-id') ?? '',
        timestamp = request.headers.get('svix-timestamp') ?? '',
        signatures = request.headers.get('svix-signature') ?? '';
    if (
        !id ||
        id.length > 100 ||
        !/^\d{10}$/.test(timestamp) ||
        Math.abs(now() - Number(timestamp)) > 300 ||
        !env.RESEND_WEBHOOK_SECRET?.startsWith('whsec_')
    )
        return json({ error: 'Invalid signature' }, 401);
    const secret = Uint8Array.from(
        atob(env.RESEND_WEBHOOK_SECRET.slice(6)),
        (c) => c.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
        'raw',
        secret,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );
    let valid = false;
    for (const token of signatures.split(' ')) {
        if (!token.startsWith('v1,')) continue;
        try {
            if (
                await crypto.subtle.verify(
                    'HMAC',
                    key,
                    Uint8Array.from(atob(token.slice(3)), (c) =>
                        c.charCodeAt(0),
                    ),
                    encoder.encode(
                        `${id}.${timestamp}.${new TextDecoder().decode(data)}`,
                    ),
                )
            )
                valid = true;
        } catch {
            /* Invalid signature encoding. */
        }
    }
    if (!valid) return json({ error: 'Invalid signature' }, 401);
    const event = JSON.parse(new TextDecoder().decode(data));
    if (
        typeof event.type !== 'string' ||
        typeof event.data?.email_id !== 'string'
    )
        return json({ error: 'Invalid event' }, 422);
    await store(env, id, 'event', data);
    return json({ stored: true });
}
export default {
    email: receive,
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
        try {
            const path = new URL(request.url).pathname,
                data = await bounded(request.body),
                raw = new TextDecoder().decode(data);
            if (path === '/webhooks/resend')
                return await webhook(request, env, data);
            if (!(await authenticate(request, env, raw)))
                return json({ error: 'Unauthorized' }, 401);
            const payload = JSON.parse(raw);
            if (path === '/v1/claim') {
                const limit = Math.max(
                    1,
                    Math.min(10, Number(payload.limit) || 10),
                );
                const result = await env.DB.prepare(
                    "UPDATE spool SET lease_until = ? WHERE id IN (SELECT id FROM spool WHERE state = 'pending' AND lease_until < ? ORDER BY lease_until, created_at LIMIT ?) RETURNING id, kind, recipient, raw, checksum",
                )
                    .bind(now() + 120, now(), limit)
                    .all();
                return json({ items: result.results });
            }
            if (
                path === '/v1/ack' &&
                typeof payload.id === 'string' &&
                typeof payload.checksum === 'string'
            ) {
                const record = await env.DB.prepare(
                    'SELECT checksum FROM spool WHERE id = ?',
                )
                    .bind(payload.id)
                    .first<{ checksum: string }>();
                if (!record || record.checksum !== payload.checksum)
                    return json({ error: 'Receipt mismatch' }, 409);
                await env.DB.prepare(
                    "UPDATE spool SET state = 'acknowledged', raw = NULL, bytes = 512 WHERE id = ?",
                )
                    .bind(payload.id)
                    .run();
                return json({ acknowledged: true });
            }
            return json({ error: 'Not found' }, 404);
        } catch {
            return json(
                {
                    error: 'Storage or request failed; accepted items are retained',
                },
                503,
            );
        }
    },
    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
        const due = await env.DB.prepare(
            "SELECT id FROM spool WHERE state = 'pending' AND lease_until < ? LIMIT 1",
        )
            .bind(now())
            .first();
        if (!due || !env.APP_URL?.startsWith('https://')) return;
        const state = await env.DB.prepare(
            'SELECT next_at, failures FROM wake_state WHERE id = 1',
        ).first<{ next_at: number; failures: number }>();
        if (!state || state.next_at > now()) return;
        const timestamp = String(now()),
            nonce = crypto.randomUUID(),
            body = '{}',
            path = '/internal/sync';
        let ok = false;
        try {
            const response = await fetch(env.APP_URL + path, {
                method: 'POST',
                body,
                signal: AbortSignal.timeout(15000),
                headers: {
                    'Content-Type': 'application/json',
                    'X-Postroom-Time': timestamp,
                    'X-Postroom-Nonce': nonce,
                    'X-Postroom-Signature': await signature(
                        env.INGRESS_SECRET,
                        `${timestamp}\n${nonce}\nPOST\n${path}\n${body}`,
                    ),
                },
            });
            ok = response.ok;
        } catch {
            /* A sleeping host is not evidence of completed import. */
        }
        const failures = ok ? 0 : Math.min(state.failures + 1, 6);
        await env.DB.prepare(
            'UPDATE wake_state SET next_at = ?, failures = ? WHERE id = 1',
        )
            .bind(now() + Math.min(86400, 900 * 2 ** failures), failures)
            .run();
    },
};
