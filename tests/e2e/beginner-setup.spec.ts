import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixtureTotp } from './fixtures/totp';

test.use({ storageState: { cookies: [], origins: [] } });

test('beginner connections explain each field and keep typed values when opening help', async ({
    page,
    context,
}) => {
    test.setTimeout(90000);
    await page.goto('/login');
    await page
        .getByLabel('Email address', { exact: true })
        .fill('owner@webmail.test');
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Six-digit code').fill(await fixtureTotp());
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/mail/);
    await page.goto('/admin/connection-settings');
    if (page.url().includes('confirm-password')) {
        await page.getByLabel('Password', { exact: true }).fill('password');
        await page
            .getByRole('button', { name: 'Confirm password', exact: true })
            .click();
    }
    await expect(
        page.getByText('Demo mode — no real email', { exact: true }),
    ).toBeVisible();
    const fields = page.locator('.connection-field');
    await expect(fields).toHaveCount(5);
    const input = page.getByLabel('Incoming mail service address', {
        exact: true,
    });
    await expect(input).toHaveAccessibleDescription(
        /small service that receives mail/,
    );
    await input.fill('https://fictional-demo.workers.dev');
    for (const field of await fields.all()) {
        await field.locator('summary').click();
        const opened = context.waitForEvent('page');
        await field
            .getByRole('link', { name: /Open illustrated instructions/ })
            .click();
        const guide = await opened;
        await guide.waitForLoadState();
        const id = new URL(guide.url()).hash.slice(1);
        await expect(guide.locator(`[id="${id}"]`)).toBeVisible();
        await guide.close();
        await field.locator('summary').click();
    }
    await expect(input).toHaveValue('https://fictional-demo.workers.dev');
    await input.fill('');
    await fields.first().locator('summary').click();
    mkdirSync('docs/ui-evidence/beginner-setup', { recursive: true });
    // Public tutorial capture: only the empty demo receiving form, no account identity or secrets.
    if (test.info().project.name === 'chromium') {
        await page
            .locator('.connection-group')
            .first()
            .screenshot({ path: 'public/help/images/webmail-connections.png' });
    }
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 });
        await page
            .getByRole('heading', { name: 'Connections', exact: true })
            .scrollIntoViewIfNeeded();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
        await page.screenshot({
            path: `docs/ui-evidence/beginner-setup/${test.info().project.name}-connections-${width}.png`,
            fullPage: true,
        });
    }
});

test('beginner guide has working illustrations, section links and mobile reflow', async ({
    page,
}) => {
    await page.goto('/help/setup');
    const article = page.locator('.guide-prose');
    for (const link of await article.locator('a[href^="#"]').all()) {
        const href = await link.getAttribute('href');
        await expect(page.locator(`[id="${href!.slice(1)}"]`)).toHaveCount(1);
    }
    for (const screenshot of [
        'cloudflare-workers-page',
        'cloudflare-custom-token',
        'cloudflare-token-permissions',
        'resend-sending-key',
        'resend-usage-key',
        'resend-add-domain',
        'resend-webhook-events',
        'webmail-connections-safari',
    ]) {
        const src = `/help/images/${screenshot}.png`;
        await expect(
            article.locator(`a[href="${src}"] img[src="${src}"]`),
        ).toHaveCount(1);
    }
    expect(
        await article
            .locator('img')
            .evaluateAll((images) =>
                images.every(
                    (image) =>
                        (image as HTMLImageElement).complete &&
                        (image as HTMLImageElement).naturalWidth > 0,
                ),
            ),
    ).toBe(true);
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
        await page.screenshot({
            path: `docs/ui-evidence/beginner-setup/${test.info().project.name}-guide-${width}.png`,
            fullPage: false,
        });
    }
    await page
        .getByRole('heading', {
            name: 'Create your incoming mail password',
            exact: true,
        })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: `docs/ui-evidence/beginner-setup/${test.info().project.name}-password-guide-320.png`,
        fullPage: false,
    });
});
