import { existsSync } from 'node:fs';
import { fixtureTotp } from './fixtures/totp';
import { createServer, request } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeAll(async ({ browser }) => {
    if (existsSync('storage/test-auth.json')) return;
    const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8010/login');
    await page
        .getByLabel('Email address', { exact: true })
        .fill('mira@postroom.test');
    await page
        .getByLabel('Password', { exact: true })
        .fill('postroom-local-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
    await context.storageState({ path: 'storage/test-auth.json' });
    await context.close();
});
test.beforeEach(async ({ page }, info) => {
    if (info.title.startsWith('server outage')) return;
    await page.goto('/mail');
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
});

test('read, search, back, archive and server-backed Undo', async ({ page }) => {
    await page.getByPlaceholder('Search mail').fill('collection');
    await page.getByPlaceholder('Search mail').press('Enter');
    await page
        .getByRole('button', { name: 'Search options', exact: true })
        .click();
    await page
        .getByLabel('Search scope', { exact: true })
        .selectOption('inbox');
    await page
        .getByRole('dialog', { name: 'Search options', exact: true })
        .getByRole('button', { name: 'Search', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Search mail')).toHaveValue(
        'collection',
    );
    await page.getByRole('checkbox', { name: /Select A few thoughts/ }).check();
    await page.getByRole('button', { name: 'Archive selected' }).click();
    await expect(page.getByText('No messages found')).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByRole('button', { name: /Open conversation: A few thoughts/ }),
    ).toBeVisible();
});

test('one server draft survives resizing, minimization and closing', async ({
    page,
}) => {
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page.getByLabel('To', { exact: true }).fill('reader@example.net');
    await page.getByLabel('To', { exact: true }).press('Enter');
    await page
        .getByLabel('Subject', { exact: true })
        .fill('Browser draft continuity');
    await page
        .getByRole('textbox', { name: 'Message body' })
        .fill('A fictional draft to preserve.');
    await expect(
        page.getByText('Saved to WebMail', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Browser draft continuity',
    );
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toHaveCount(1);
    await page.getByRole('button', { name: 'Save and close draft' }).click();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: /Drafts/ }).click();
    await page
        .getByRole('button', { name: /Resume draft: Browser draft continuity/ })
        .first()
        .click();
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toContainText('A fictional draft to preserve.');
});

test('key screens are accessible and reflow at required widths', async ({
    page,
}) => {
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const account = await page
            .getByRole('button', { name: /Account and mailboxes/ })
            .boundingBox();
        expect(account).not.toBeNull();
        expect(account!.x + account!.width).toBeLessThanOrEqual(width);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: `docs/ui-evidence/inbox-${width}.png`,
            fullPage: true,
        });
    }
    const audit = await new AxeBuilder({ page }).analyze();
    await mkdir('docs/ui-evidence/accessibility', { recursive: true });
    await writeFile(
        `docs/ui-evidence/accessibility/${test.info().project.name}-inbox.json`,
        JSON.stringify(
            {
                url: audit.url,
                timestamp: audit.timestamp,
                tool: audit.testEngine,
                violations: audit.violations,
            },
            null,
            2,
        ),
    );
    expect(audit.violations).toEqual([]);
    await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await expect(
        page.getByRole('link', { name: /Inbox/ }).first(),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('failed autosave retains editor and private caches contain no mail', async ({
    page,
}) => {
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page.route('**/drafts/*', (route) =>
        route.request().method() === 'PUT' ? route.abort() : route.continue(),
    );
    await page.getByLabel('Subject', { exact: true }).fill('Do not lose this');
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Do not lose this',
    );
    await expect(page.getByLabel('To', { exact: true })).toHaveValue('');
    await expect(page.getByText(/Draft not saved/)).toBeVisible();
    await page.getByRole('button', { name: 'Save and close draft' }).click();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Do not lose this',
    );
    const urls = await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        return (
            await Promise.all(
                (await caches.keys()).map(async (key) =>
                    (await (await caches.open(key)).keys()).map((req) => {
                        const url = new URL(req.url);
                        return url.pathname + url.search;
                    }),
                ),
            )
        )
            .flat()
            .sort();
    });
    expect(urls).toEqual([
        '/favicon.svg?v=3',
        '/icon-192.png?v=3',
        '/icon-512.png?v=3',
        '/offline.html',
    ]);
});

test('settings persist, optional pane collapses, and dirty compose survives minimize', async ({
    page,
}) => {
    await page
        .getByRole('button', { name: 'Quick settings', exact: true })
        .click();
    await page.getByRole('radio', { name: 'Right of inbox' }).check();
    await page.getByRole('radio', { name: /Compact/ }).check();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.getByRole('button', { name: 'Close Quick settings' }).click();
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await expect(page.locator('.mail-content')).toHaveClass(/pane-enabled/);
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    await page.screenshot({
        path: `docs/ui-evidence/desktop/${test.info().project.name}-dark-pane.png`,
    });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 768, height: 1024 });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 960 });
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page
        .getByLabel('Subject', { exact: true })
        .fill('Minimize and rotate');
    await page
        .getByRole('textbox', { name: 'Message body' })
        .fill('Still the same editor state.');
    await page.getByRole('button', { name: 'Cc', exact: true }).click();
    await page.getByLabel('Cc', { exact: true }).fill('unfinished@');
    await page.getByRole('button', { name: 'Minimize compose' }).click();
    await page.getByRole('button', { name: 'Restore compose' }).click();
    await expect(page.getByLabel('Cc', { exact: true })).toHaveValue(
        'unfinished@',
    );
    await page.getByLabel('Cc', { exact: true }).fill('');
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toContainText('Still the same editor state.');
    await page.getByRole('button', { name: 'Expand compose' }).click();
    await page.setViewportSize({ width: 430, height: 740 });
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toHaveCount(1);
    await expect(
        page.getByText('Saved to WebMail', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: `docs/ui-evidence/mobile/${test.info().project.name}-compose.png`,
    });
    await page.getByRole('button', { name: 'Save and close draft' }).click();
    await page.setViewportSize({ width: 1440, height: 960 });
    await page
        .getByRole('button', { name: 'Quick settings', exact: true })
        .click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('radio', { name: 'No split' }).check();
    await page.getByRole('radio', { name: /Comfortable/ }).check();
});

test('mobile compose and search have Back-safe routes and direct draft resume', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Compose', exact: true }).click();
    await expect(page).toHaveURL(/[?&]compose=/);
    const draftUrl = page.url();
    await page
        .getByLabel('Subject', { exact: true })
        .fill('Mobile Back keeps this');
    await page.goBack();
    await expect(page.locator('.composer')).toHaveCount(0);
    await page.goto(draftUrl);
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Mobile Back keeps this',
    );
    await page.getByRole('button', { name: 'Save and close draft' }).click();
    await page.getByPlaceholder('Search mail', { exact: true }).click();
    await expect(page).toHaveURL(/[?&]view=search/);
    await page.getByRole('dialog').getByRole('textbox').fill('collection');
    await page.getByRole('dialog').getByRole('textbox').press('Enter');
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    await page.goBack();
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
});

test('swipe archive has explicit alternative and exact Undo', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const row = page.locator('.message-row').first();
    const target = await row.boundingBox();
    if (!target) throw new Error('Missing row');
    await row.dispatchEvent('pointerdown', {
        pointerType: 'touch',
        clientX: target.x + 260,
        clientY: target.y + 25,
    });
    await row.dispatchEvent('pointermove', {
        pointerType: 'touch',
        clientX: target.x + 120,
        clientY: target.y + 27,
    });
    await row.dispatchEvent('pointerup', {
        pointerType: 'touch',
        clientX: target.x + 120,
        clientY: target.y + 27,
    });
    await expect(
        page.getByText('Message archived', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByText('Change undone', { exact: true }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /Select A few thoughts/ }).check();
    await expect(
        page.getByRole('button', { name: 'Archive selected' }),
    ).toBeVisible();
});

test('keyboard, reduced motion, narrow composer and reader accessibility', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const first = page.getByRole('button', {
        name: /Open conversation: A few thoughts/,
    });
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await expect(first).toBeFocused();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('button', { name: 'Compose', exact: true }).click();
    await page
        .getByLabel('Subject', { exact: true })
        .fill(
            'A very long fictional subject that must wrap without pushing the Send control out of view',
        );
    await expect(
        page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeInViewport();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('double tap Send creates one simulated intent and locks the editor', async ({
    page,
}) => {
    let sends = 0;
    await page.route('**/drafts/*/send', async (route) => {
        sends++;
        await new Promise((r) => setTimeout(r, 250));
        await route.continue();
    });
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page.getByLabel('To', { exact: true }).fill('fiction@example.net');
    await page.getByLabel('To', { exact: true }).press('Enter');
    await page.getByLabel('Subject', { exact: true }).fill('Simulator only');
    await page
        .getByRole('textbox', { name: 'Message body' })
        .fill('This is a fictional acceptance test.');
    await page.getByRole('button', { name: 'Send', exact: true }).dblclick();
    await expect(
        page.getByText('Accepted by local simulator · no email sent', {
            exact: true,
        }),
    ).toBeVisible();
    expect(sends).toBe(1);
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toHaveAttribute('contenteditable', 'false');
});

test('quota rejection retains the saved draft and never reports Sent', async ({
    page,
}) => {
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page
        .getByLabel('To', { exact: true })
        .fill('one@example.net, two@example.net');
    await page.getByLabel('To', { exact: true }).press('Enter');
    await page
        .getByLabel('Subject', { exact: true })
        .fill('Preserve this held draft');
    await page
        .getByRole('textbox', { name: 'Message body' })
        .fill('Both recipients exceed the explicit local test cap.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        page.getByText(/Sending paused: the shared allowance/),
    ).toBeVisible();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Preserve this held draft',
    );
    await expect(
        page.getByRole('textbox', { name: 'Message body' }),
    ).toHaveAttribute('contenteditable', 'true');
    await expect(
        page.getByText(/Accepted by local simulator/),
    ).not.toBeVisible();
});

test('mobile owner can create and suspend a local account, usage is honest', async ({
    browser,
}) => {
    const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
        viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8010/login');
    await page
        .getByLabel('Email address', { exact: true })
        .fill('owner@postroom.test');
    await page
        .getByLabel('Password', { exact: true })
        .fill('postroom-local-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/two-factor-challenge/);
    // Fixed fictional seed secret, never a provider or production credential.
    await page.locator('input[name="code"]').fill(await fixtureTotp());
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
    await page.goto('http://127.0.0.1:8010/mail?q=fictional');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
        .getByRole('link', { name: 'Administration', exact: true })
        .click();
    await page.getByRole('button', { name: /Change section/ }).click();
    await page.getByRole('button', { name: 'People', exact: true }).click();
    await page.getByRole('button', { name: 'Add person' }).click();
    await page.getByLabel('Full name').fill('Fictional Robin');
    await page.getByLabel('Mailbox name').fill('robin');
    await page.getByLabel('Initial password').fill('fictional-robin-password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(
        page.getByText(/User created. Receiving is pending/),
    ).toBeVisible();
    const person = page
        .locator('.person-row')
        .filter({ hasText: 'Fictional Robin' });
    await person.getByRole('button', { name: 'Suspend', exact: true }).click();
    await page
        .getByRole('button', { name: 'Suspend account', exact: true })
        .click();
    await expect(person.getByText('Suspended', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Change section/ }).click();
    await page.getByRole('button', { name: 'Usage', exact: true }).click();
    await expect(
        page.getByText('Unavailable', { exact: true }).first(),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
        path: `docs/ui-evidence/mobile/${test.info().project.name}-admin-usage.png`,
        fullPage: true,
    });
    await page.getByRole('link', { name: 'Back to mail' }).click();
    await expect(page).toHaveURL(/q=fictional/);
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
    await context.close();
});

test('logout invalidates private history and account switching isolates mail', async ({
    browser,
}) => {
    test.setTimeout(60000);
    const context = await browser.newContext({
        storageState: 'storage/test-auth.json',
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8010/mail');
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    const privateUrl = page.url();
    await page.getByRole('button', { name: /Account and mailboxes/ }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/login/);
    // The private-history guard replaces the restored route with /login,
    // which can cancel Chromium's pending Back navigation.
    await page.goBack().catch((error: Error) => {
        if (!error.message.includes('net::ERR_ABORTED')) throw error;
    });
    await expect(page).toHaveURL(/login/);
    await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).not.toBeVisible();
    await page
        .getByLabel('Email address', { exact: true })
        .fill('owner@postroom.test');
    await page
        .getByLabel('Password', { exact: true })
        .fill('postroom-local-only');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('input[name="code"]').fill(await fixtureTotp());
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Mira Chen', { exact: true }),
    ).not.toBeVisible();
    const forbidden = await page.goto(privateUrl);
    expect(forbidden?.status()).toBe(403);
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).not.toBeVisible();
    await context.close();
});

test('server outage reload exposes only the public offline shell', async ({
    browser,
}) => {
    // Stop a local reverse proxy to produce an actual connection failure.
    // Browser offline emulation does not consistently affect localhost/SW requests.
    const proxy = createServer((incoming, outgoing) => {
        const upstream = request(
            {
                hostname: '127.0.0.1',
                port: 8010,
                path: incoming.url,
                method: incoming.method,
                headers: incoming.headers,
            },
            (response) => {
                outgoing.writeHead(
                    response.statusCode ?? 502,
                    response.headers,
                );
                response.pipe(outgoing);
            },
        );
        upstream.on('error', () => {
            outgoing.destroy();
        });
        incoming.pipe(upstream);
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing test proxy');
    const context = await browser.newContext({
        storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    try {
        await page.goto(`http://127.0.0.1:${address.port}/login`);
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
        });
        await page.reload();
        await expect
            .poll(() =>
                page.evaluate(() =>
                    Boolean(navigator.serviceWorker.controller),
                ),
            )
            .toBe(true);
        await new Promise<void>((resolve, reject) => {
            proxy.close((error) => (error ? reject(error) : resolve()));
            proxy.closeAllConnections();
        });
        await page.reload();
        await expect(page.getByText(/offline/i).first()).toBeVisible();
        await expect(
            page.getByText('Mira Chen', { exact: true }),
        ).not.toBeVisible();
        await expect(
            page.getByRole('img', { name: 'WebMail by Hookstack' }),
        ).toBeVisible();
        await expect
            .poll(() =>
                page.locator('.brand img').evaluate((image) => {
                    const icon = image as HTMLImageElement;
                    return icon.complete && icon.naturalWidth > 0;
                }),
            )
            .toBe(true);
        await page.screenshot({
            path: test.info().outputPath('offline.png'),
        });
    } finally {
        proxy.closeAllConnections();
        proxy.close();
        await context.close();
    }
});
