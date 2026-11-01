import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const baseURL = 'http://127.0.0.1:8010';
const scrollQuery = 'Acceptance scroll fixture';
let authState = '';
let mailboxURL = '';

// These are real authorized requests against the disposable e2e.sqlite fixture.
// No provider, owner MFA, main mailbox messages, or shared auth state is used.
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeAll(async ({ browser }, info) => {
    mkdirSync('test-results', { recursive: true });
    authState = join(
        'test-results',
        `acceptance-auth-${info.project.name}.json`,
    );
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 1440, height: 960 },
        storageState: existsSync(authState)
            ? authState
            : { cookies: [], origins: [] },
    });
    try {
        const page = await context.newPage();
        await page.goto('/mail');
        if (new URL(page.url()).pathname === '/login') {
            await page
                .getByLabel('Email address', { exact: true })
                .fill('mira@postroom.test');
            await page
                .getByLabel('Password', { exact: true })
                .fill('postroom-local-only');
            await page
                .getByRole('button', { name: 'Sign in', exact: true })
                .click();
        }
        await expect(
            page.getByRole('heading', { name: 'Inbox', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: /Account and mailboxes/ })
            .click();
        const link = page.getByRole('link', { name: /Acceptance Lab/ });
        await expect(link).toBeVisible();
        const href = await link.getAttribute('href');
        expect(href).toMatch(/^\/mail\/\d+$/);
        mailboxURL = href!;
        await context.storageState({ path: authState });
        chmodSync(authState, 0o600);
    } finally {
        await context.close();
    }
});

test.beforeEach(async ({ page }) => {
    const saved = JSON.parse(readFileSync(authState, 'utf8')) as {
        cookies: import('@playwright/test').Cookie[];
    };
    await page.context().addCookies(saved.cookies);
    // Keep these layout tests independent of earlier preference tests. API
    // setup does not navigate this fresh page, preserving the deep-link case.
    const csrf = saved.cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
    const response = await page.request.put(`${baseURL}/preferences`, {
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': decodeURIComponent(csrf?.value ?? ''),
        },
        data: { theme: 'light', density: 'comfortable', pane: 'none' },
    });
    expect(response.ok()).toBe(true);
});

const listURL = (page = 1) =>
    `${mailboxURL}?folder=all&q=${encodeURIComponent(scrollQuery)}&page=${page}`;

async function expectShellContained(page: Page) {
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
    ).toBe(true);
    const shell = await page.locator('#mail-main').boundingBox();
    expect(shell).not.toBeNull();
    expect(shell!.x).toBeGreaterThanOrEqual(-1);
    expect(shell!.x + shell!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
    );
}

test('acceptance: nonzero list scroll, query and focused row survive conversation Back', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await page.goto(mailboxURL);
    await page.getByPlaceholder('Search mail').fill(scrollQuery);
    await page.getByPlaceholder('Search mail').press('Enter');
    // Inbox and search both contain 30 rows, including this target. Wait for
    // the actual query visit, not a count that also matches the previous page.
    await expect(page).toHaveURL(
        (url) => url.searchParams.get('q') === scrollQuery,
    );
    await expect(
        page.getByRole('heading', { name: 'Search results', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.message-row')).toHaveCount(30);
    const row = page.getByRole('button', {
        name: /Open conversation: Acceptance scroll fixture 20/,
    });
    await expect(row).toBeEnabled();
    await page.evaluate(
        () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                ),
            ),
    );
    await row.scrollIntoViewIfNeeded();
    await row.focus();
    const list = page.locator('.message-list');
    const position = await list.evaluate((element) => element.scrollTop);
    expect(position).toBeGreaterThan(200);
    await row.press('Enter');
    await expect(page).toHaveURL(/\/thread\/acceptance-independent-20\?/);
    await expect(
        page.getByRole('heading', {
            name: 'Acceptance scroll fixture 20',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await expect(page.getByPlaceholder('Search mail')).toHaveValue(scrollQuery);
    expect(new URL(page.url()).searchParams.get('q')).toBe(scrollQuery);
    await expect
        .poll(async () =>
            Math.abs(
                (await list.evaluate((element) => element.scrollTop)) -
                    position,
            ),
        )
        .toBeLessThanOrEqual(2);
    await expect(row).toBeFocused();
    await page.screenshot({
        path: info.outputPath('scrolled-query-return.png'),
    });
});

test('acceptance: a 45-message query paginates and the unread filter keeps its query', async ({
    page,
}) => {
    await page.goto(listURL());
    await expect(page.locator('.message-row')).toHaveCount(30);
    await expect(page.locator('.toolbar-right')).toContainText('1–30 of 45');
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.locator('.message-row')).toHaveCount(15);
    await expect(page.locator('.toolbar-right')).toContainText('31–45 of 45');
    expect(new URL(page.url()).searchParams.get('page')).toBe('2');
    expect(new URL(page.url()).searchParams.get('q')).toBe(scrollQuery);
    await page
        .getByRole('button', { name: 'Previous page', exact: true })
        .click();
    await expect(page.locator('.message-row')).toHaveCount(30);
    await page.getByRole('button', { name: 'Unread', exact: true }).click();
    await expect(page).toHaveURL(/unread=1/);
    await expect(page.locator('.message-row:not(.unread)')).toHaveCount(0);
    expect(await page.locator('.message-row.unread').count()).toBeGreaterThan(
        0,
    );
    expect(await page.locator('.message-row.unread').count()).toBeLessThan(30);
    expect(new URL(page.url()).searchParams.get('q')).toBe(scrollQuery);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.locator('.message-row')).toHaveCount(30);
    await expect(page.locator('.toolbar-right')).toContainText('1–30 of 45');
});

test('acceptance: a 31-message conversation labels bounded actions and exposes older messages', async ({
    page,
}) => {
    await page.goto(
        `${mailboxURL}/thread/acceptance-long-conversation?folder=all`,
    );
    await expect(page.locator('.conversation-message')).toHaveCount(30);
    await expect(page.locator('.thread-pagination')).toContainText(
        '30 of 31 messages',
    );
    await expect(
        page.getByRole('button', {
            name: 'Archive visible messages',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: 'Trash visible messages',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Archive conversation', exact: true }),
    ).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Older messages', exact: true })
        .click();
    await expect(page.locator('.conversation-message')).toHaveCount(1);
    await expect(page.locator('.thread-pagination')).toContainText(
        '1 of 31 messages',
    );
    await expect(page.locator('.message-body')).toContainText(
        'message 1 of 31',
    );
    await page
        .getByRole('button', { name: 'Newer messages', exact: true })
        .click();
    await expect(page.locator('.conversation-message')).toHaveCount(30);
});

test('acceptance: an authorized deep link without mailbox history has a safe Back destination', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // The page fixture is still about:blank: no prior mailbox route or private
    // navigation state is populated by the authentication setup above.
    expect(page.url()).toBe('about:blank');
    await page.goto(
        `${mailboxURL}/thread/acceptance-independent-07?folder=inbox`,
    );
    await expect(
        page.getByRole('heading', {
            name: 'Acceptance scroll fixture 07',
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to messages' }).click();
    await expect(page).not.toHaveURL(/\/thread\//);
    expect(new URL(page.url()).pathname).toBe(mailboxURL);
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.message-row')).toHaveCount(30);
});

test('acceptance: long recipient details and a wide sanitized newsletter stay within the mobile shell', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 320, height: 700 });
    const attemptedRemoteImages: string[] = [];
    await page.route('https://blocked.acceptance.example/**', (route) => {
        attemptedRemoteImages.push(route.request().url());
        return route.abort();
    });
    await page.goto(`${mailboxURL}/thread/acceptance-details?folder=all`);
    await expectShellContained(page);
    await page.locator('.recipient-disclosure').click();
    const details = page.getByRole('dialog', {
        name: 'Message details',
        exact: true,
    });
    await expect(details).toContainText(
        'fictional.department.collaboration.recipient.9@long-recipient-domain.example',
    );
    await expect(details).toContainText(
        'fictional.review.copy.recipient.10@long-recipient-domain.example',
    );
    expect(
        await details.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
    ).toBe(true);
    await page.screenshot({
        path: info.outputPath('long-recipient-details-320.png'),
        fullPage: true,
    });
    await page
        .getByRole('button', { name: 'Close Message details', exact: true })
        .click();
    await page.goto(`${mailboxURL}/thread/acceptance-newsletter?folder=all`);
    await page
        .getByRole('button', { name: 'Show safe HTML', exact: true })
        .click();
    const frame = page.frameLocator('.safe-email');
    await expect(
        frame.getByRole('heading', { name: 'Fictional wide newsletter' }),
    ).toBeVisible();
    await expect(frame.locator('td')).toHaveCount(12);
    expect(
        await frame
            .locator('td')
            .first()
            .evaluate((cell) => cell.getBoundingClientRect().width),
    ).toBeGreaterThanOrEqual(112);
    expect(
        await frame
            .locator('body')
            .evaluate(() => document.documentElement.scrollWidth > innerWidth),
    ).toBe(true);
    await expect(frame.locator('img, script, iframe, form')).toHaveCount(0);
    await frame.locator('td').last().scrollIntoViewIfNeeded();
    await expect(frame.locator('td').last()).toBeInViewport();
    expect(await frame.locator('body').evaluate(() => scrollX)).toBeGreaterThan(
        0,
    );
    await frame.locator('body').evaluate(() => scrollTo(0, 0));
    expect(attemptedRemoteImages).toEqual([]);
    for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expectShellContained(page);
        const preview = await page.locator('.safe-email').boundingBox();
        expect(preview).not.toBeNull();
        expect(preview!.x + preview!.width).toBeLessThanOrEqual(width + 1);
    }
    await page.setViewportSize({ width: 320, height: 700 });
    await page.screenshot({
        path: info.outputPath('wide-newsletter-320.png'),
        fullPage: true,
    });
});

test('acceptance: the last mobile result can be opened above floating Compose', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(listURL(2));
    await expect(page.locator('.message-row')).toHaveCount(15);
    await page.locator('.message-list').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    const last = page.getByRole('button', {
        name: /Open conversation: Acceptance scroll fixture 45/,
    });
    await expect(last).toBeInViewport();
    const row = await last.boundingBox();
    const compose = await page.locator('.mobile-compose').boundingBox();
    expect(row).not.toBeNull();
    expect(compose).not.toBeNull();
    expect(row!.y + row!.height).toBeLessThanOrEqual(compose!.y);
    await page.screenshot({
        path: info.outputPath('last-result-above-compose-390.png'),
    });
    await last.click();
    await expect(page).toHaveURL(/\/thread\/acceptance-independent-45\?/);
});

test('acceptance: 200 percent text keeps mobile navigation and selection controls reachable', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(listURL());
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectShellContained(page);
    for (const selector of ['.row-sender', '.row-subject', '.row-snippet']) {
        expect(
            await page
                .locator(selector)
                .first()
                .evaluate((element) => {
                    const style = getComputedStyle(element);
                    return (
                        element.getBoundingClientRect().height >=
                        parseFloat(style.fontSize)
                    );
                }),
        ).toBe(true);
    }
    const search = page.getByRole('textbox', {
        name: 'Search mail',
        exact: true,
    });
    expect(
        await search.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
        ),
    ).toBeGreaterThanOrEqual(32);
    await expect(page.locator('.mobile-compose')).toBeInViewport();
    await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    const navigation = page.getByRole('dialog', {
        name: 'WebMail',
        exact: true,
    });
    await expect(
        navigation.getByRole('link', { name: /^Inbox/ }),
    ).toBeVisible();
    expect(
        await navigation.evaluate(
            (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
    ).toBe(true);
    await page
        .getByRole('button', { name: 'Close WebMail', exact: true })
        .click();
    await page
        .getByRole('checkbox', {
            name: 'Select Acceptance scroll fixture 01',
            exact: true,
        })
        .check();
    const clear = page.getByRole('button', {
        name: 'Clear selection',
        exact: true,
    });
    await expect(clear).toBeInViewport();
    expect(
        await page
            .locator('.mail-toolbar')
            .evaluate(
                (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
    ).toBe(true);
    await page.screenshot({
        path: info.outputPath('mail-selection-text200-320.png'),
        fullPage: true,
    });
    await clear.click();
    await expect(
        page.getByRole('button', {
            name: /Open conversation: Acceptance scroll fixture 01/,
        }),
    ).toBeFocused();
});
