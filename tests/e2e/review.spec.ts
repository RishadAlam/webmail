import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fixtureTotp } from './fixtures/totp';
import { existsSync, readFileSync } from 'node:fs';

test.use({ storageState: { cookies: [], origins: [] } });

async function login(
    page: import('@playwright/test').Page,
    email = 'mira@webmail.test',
) {
    const savedSession = 'storage/review-auth.json';
    if (email === 'mira@webmail.test' && existsSync(savedSession)) {
        const state = JSON.parse(readFileSync(savedSession, 'utf8')) as {
            cookies: import('@playwright/test').Cookie[];
        };
        await page.context().addCookies(state.cookies);
        await page.goto('/mail');
        await expect(page).toHaveURL(/\/mail/);
        return;
    }
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill(email);
    await page
        .getByLabel('Password', { exact: true })
        .fill('password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(
        email.startsWith('owner') ? /two-factor-challenge/ : /\/mail/,
    );
    if (email === 'mira@webmail.test')
        await page.context().storageState({ path: savedSession });
}

test('review: mobile selection has an accessible exit and fits at 320px', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await login(page);
    await page.getByRole('checkbox', { name: /Select A few thoughts/ }).check();
    const clear = page.getByRole('button', {
        name: 'Clear selection',
        exact: true,
    });
    await expect(clear).toBeVisible();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    expect(
        await page
            .locator('.mail-toolbar')
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await clear.click();
    await expect(
        page.getByRole('button', { name: /Open conversation: A few thoughts/ }),
    ).toBeFocused();
    await expect(
        page.getByRole('button', { name: 'Archive selected', exact: true }),
    ).not.toBeVisible();
});

test('review: marking an open conversation unread returns to the list and keeps it unread', async ({
    page,
}) => {
    await login(page);
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await page
        .getByRole('button', { name: 'Mark unread', exact: true })
        .click();
    await expect(page).not.toHaveURL(/\/thread\//);
    await expect(
        page
            .locator('.message-row')
            .filter({ hasText: 'A few thoughts on the new collection' }),
    ).toHaveClass(/unread/);
});

test('review: draft and search survive account security confirmation and return', async ({
    page,
}) => {
    await login(page);
    await page.getByPlaceholder('Search mail').fill('collection');
    await page.getByPlaceholder('Search mail').press('Enter');
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page
        .getByLabel('Subject', { exact: true })
        .fill('Fictional settings round trip');
    await page
        .getByRole('button', { name: 'Minimize compose', exact: true })
        .click();
    await page.getByRole('button', { name: /Account and mailboxes/ }).click();
    await page
        .getByRole('link', { name: 'Password & two-factor authentication' })
        .click();
    await page
        .getByLabel('Password', { exact: true })
        .fill('password');
    await page
        .getByRole('button', { name: 'Confirm password', exact: true })
        .click();
    await expect(page).toHaveURL(/settings\/security/);
    await page.getByRole('link', { name: 'Back to mail', exact: true }).click();
    await expect(page).toHaveURL(/q=collection/);
    await page
        .getByRole('button', { name: 'Restore compose', exact: true })
        .click();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        'Fictional settings round trip',
    );
    await expect(page.locator('.tiptap')).toHaveCount(1);
});

test('review: branded MFA fields are labeled and recovery is reachable', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'owner@webmail.test');
    await expect(page).toHaveURL(/two-factor-challenge/);
    await expect(
        page.getByLabel('WebMail by Hookstack', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Six-digit code')).toHaveAttribute(
        'autocomplete',
        'one-time-code',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
        .getByRole('button', {
            name: 'login using a recovery code',
            exact: true,
        })
        .click();
    await expect(
        page.getByLabel('Recovery code', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Use another account' }).click();
    await expect(page).toHaveURL(/login/);
});

test('review: resizing during a committed save restores the saved indicator', async ({
    page,
}) => {
    await login(page);
    let release = () => {};
    let arrived = () => {};
    let intercepted = false;
    let draftUrl = '';
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    const committed = new Promise<void>((resolve) => {
        arrived = resolve;
    });
    await page.route('**/drafts/*', async (route) => {
        if (route.request().method() !== 'PUT' || intercepted)
            return route.continue();
        intercepted = true;
        draftUrl = route.request().url();
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        arrived();
        await held;
        await route.fulfill({ response });
    });
    try {
        await page
            .getByRole('button', { name: 'Compose', exact: true })
            .first()
            .click();
        await page
            .getByLabel('Subject', { exact: true })
            .fill('Fictional delayed-save status');
        await page
            .getByRole('textbox', { name: 'Message body', exact: true })
            .fill('Fictional saved body.');
        await committed;
        await page.getByRole('button', { name: 'Cc', exact: true }).click();
        await page.getByLabel('Cc', { exact: true }).fill('unfinished@');
        await page.getByLabel('Cc', { exact: true }).fill('');
        await page.setViewportSize({ width: 430, height: 740 });
        await page.evaluate(
            () =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve()),
                    ),
                ),
        );
        release();
        await expect(
            page.getByText('Saved to WebMail', { exact: true }),
        ).toBeVisible();
        const persisted = await page.request.get(draftUrl);
        expect(persisted.ok()).toBe(true);
        const draft = await persisted.json();
        expect(draft.subject).toBe('Fictional delayed-save status');
        expect(draft.cc).toEqual([]);
        await page
            .getByRole('button', { name: 'Save and close draft', exact: true })
            .click();
        await expect(page.locator('.composer')).toHaveCount(0);
    } finally {
        release();
    }
});

test('review: unfinished recipients survive desktop mobile layout changes', async ({
    page,
}) => {
    await login(page);
    await page
        .getByRole('button', { name: 'Compose', exact: true })
        .first()
        .click();
    await page.getByRole('button', { name: 'Cc', exact: true }).click();
    await page.getByLabel('Cc', { exact: true }).fill('unfinished@');
    await page.setViewportSize({ width: 390, height: 844 });
    // CSS switches first; wait for the dialog's modal lifecycle before editing.
    await expect(page.locator('body')).toHaveCSS('pointer-events', 'none');
    await expect(
        page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Cc', { exact: true })).toHaveValue(
        'unfinished@',
    );
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(page.locator('body')).toHaveCSS('pointer-events', 'auto');
    await expect(
        page.getByRole('button', { name: 'Minimize compose', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Cc', { exact: true })).toHaveValue(
        'unfinished@',
    );
    await page.getByLabel('Cc', { exact: true }).fill('');
    await expect(page.getByLabel('Cc', { exact: true })).toHaveValue('');
    await page
        .getByRole('button', { name: 'Save and close draft', exact: true })
        .click();
    await expect(page.locator('.composer')).toHaveCount(0);
});

test('review: managed profile and enlarged settings keep controls reachable', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto('/settings/profile');
    await expect(page.getByLabel('Email address')).toHaveAttribute(
        'readonly',
        '',
    );
    await expect(
        page.getByRole('button', { name: 'Delete account', exact: true }),
    ).toHaveCount(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeVisible();
});

test('review: theme settings agree across screens and sheets restore focus', async ({
    page,
}) => {
    await login(page);
    const settings = page.getByRole('button', {
        name: 'Quick settings',
        exact: true,
    });
    await settings.click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page
        .getByRole('button', { name: 'Close Quick settings', exact: true })
        .click();
    await expect(settings).toBeFocused();
    await page.goto('/settings/appearance');
    await expect(
        page.getByRole('button', { name: 'Dark', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.reload();
    await expect(
        page.getByRole('button', { name: 'Light', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.setViewportSize({ width: 320, height: 700 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: `docs/review/final/${test.info().project.name}-appearance-320-text200.png`,
        fullPage: true,
    });
});

test('review: current mail screens have original branding and accessible color contrast', async ({
    page,
}) => {
    await login(page);
    await expect(page).toHaveTitle(/WebMail by Hookstack/);
    if (
        await page
            .locator('.mail-app')
            .evaluate((element) => element.classList.contains('nav-collapsed'))
    ) {
        await page
            .getByRole('button', { name: 'Open navigation', exact: true })
            .click();
    }
    for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({
            width,
            height: width === 1440 ? 960 : 844,
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
        await page.screenshot({
            path: `docs/review/final/${test.info().project.name}-inbox-${width}.png`,
            fullPage: true,
        });
    }
    await page
        .getByRole('button', { name: /Open conversation: A few thoughts/ })
        .click();
    await expect(
        page.getByRole('heading', {
            name: 'A few thoughts on the new collection',
        }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
        path: `docs/review/final/${test.info().project.name}-reader-320.png`,
        fullPage: true,
    });
});

test('review: owner manages aliases, quotas, directory and masked connections on mobile', async ({
    page,
}) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'owner@webmail.test');
    await page.getByLabel('Six-digit code').fill(await fixtureTotp());
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/mail/);
    await page.goto('/admin?section=Mailboxes');
    await expect(
        page.getByRole('heading', { name: 'Mailboxes', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByRole('heading', { name: 'Mailboxes', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Manage Mira Chen', exact: true })
        .click();
    await page.getByLabel('Mailbox limit (MiB)', { exact: true }).fill('20');
    await page
        .getByRole('button', { name: 'Save allocation', exact: true })
        .click();
    await expect(
        page.getByText('Storage allocation saved.', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('New alias', { exact: false }).fill('studio-review');
    await page.getByRole('button', { name: 'Add alias', exact: true }).click();
    await expect(
        page.getByRole('checkbox', {
            name: 'studio-review@webmail.test',
            exact: true,
        }),
    ).toBeChecked();
    await page
        .getByRole('checkbox', {
            name: 'studio-review@webmail.test',
            exact: true,
        })
        .click(); // This controlled checkbox changes only after the server confirms.
    await expect(
        page.getByRole('checkbox', {
            name: 'studio-review@webmail.test',
            exact: true,
        }),
    ).not.toBeChecked();
    await expect(
        page.getByRole('button', {
            name: 'Close Manage Mira Chen',
            exact: true,
        }),
    ).toBeInViewport();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
        path: `docs/review/final/${test.info().project.name}-mailbox-settings-390.png`,
        fullPage: false,
    });
    await page
        .getByRole('button', { name: 'Close Manage Mira Chen', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Synchronize addresses', exact: true })
        .click();
    await expect(
        page.getByText(/addresses · revision \d+ · Simulated locally/),
    ).toBeVisible();
    await page.getByRole('button', { name: /Change section/ }).click();
    await page
        .getByRole('button', { name: 'Connections', exact: true })
        .click();
    await expect(page).toHaveURL(/confirm-password|admin\/connection-settings/);
    if (page.url().includes('confirm-password')) {
        await page
            .getByLabel('Password', { exact: true })
            .fill('password');
        await page
            .getByRole('button', { name: 'Confirm password', exact: true })
            .click();
    }
    await expect(page).toHaveURL(/admin\/connection-settings/);
    const fictionalKey = 'fixture-only-not-a-real-cloudflare-token';
    await page
        .getByLabel('Cloudflare domain-check token', { exact: true })
        .fill(fictionalKey);
    const saved = page.waitForResponse(
        (response) =>
            response.url().endsWith('/admin/connections') &&
            response.request().method() === 'PUT',
    );
    await page
        .getByRole('button', { name: 'Save connections', exact: true })
        .click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(await response.text()).not.toContain(fictionalKey);
    await expect(
        page.getByLabel('Cloudflare domain-check token', { exact: true }),
    ).toHaveValue('');
    const accessCheck = page.waitForResponse(
        (result) =>
            result.url().endsWith('/admin/connections/cloudflare/test') &&
            result.request().method() === 'POST',
    );
    await page
        .getByRole('button', { name: 'Check Cloudflare access', exact: true })
        .click();
    expect((await accessCheck).status()).toBe(200);
    await expect(
        page.getByRole('button', {
            name: 'Check Cloudflare access',
            exact: true,
        }),
    ).toBeEnabled();
    await expect(
        page
            .locator('.readiness-row')
            .filter({ hasText: 'Cloudflare domain settings' })
            .getByText('Demo only — no live account checked', { exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: `docs/review/final/${test.info().project.name}-connections-390.png`,
        fullPage: true,
    });
    await page
        .getByRole('button', {
            name: 'Clear cloudflare domain-check token',
            exact: true,
        })
        .click();
    await page
        .getByRole('button', { name: 'Clear value', exact: true })
        .click();
    await expect(
        page.getByText('Connection value cleared.', { exact: true }),
    ).toBeVisible();
});

test('review: Trash deletion requires explicit confirmation and releases only selected mail', async ({
    page,
}) => {
    await login(page);
    const subject = 'November reading list';
    await page
        .getByRole('checkbox', { name: `Select ${subject}`, exact: true })
        .check();
    await page
        .getByRole('button', { name: 'Trash selected', exact: true })
        .click();
    await expect(
        page.getByText('Moved to Trash', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: /^Trash/ }).click();
    await page
        .getByRole('checkbox', { name: `Select ${subject}`, exact: true })
        .check();
    await page
        .getByRole('button', {
            name: 'Delete selected permanently',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('button', { name: 'Delete permanently', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
        page.getByRole('checkbox', { name: `Select ${subject}`, exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', {
            name: 'Delete selected permanently',
            exact: true,
        })
        .click();
    await page
        .getByLabel('Type DELETE to confirm', { exact: true })
        .fill('DELETE');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page
        .getByRole('button', { name: 'Delete permanently', exact: true })
        .click();
    await expect(
        page.getByText('1 message permanently deleted.', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('checkbox', { name: `Select ${subject}`, exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: /^Inbox/ }).click();
    await expect(
        page.getByRole('button', { name: /Open conversation: A few thoughts/ }),
    ).toBeVisible();
});
