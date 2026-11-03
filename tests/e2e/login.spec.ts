import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
    await page.goto('/login');
});

test('password visibility works by keyboard and resets when signing in', async ({
    page,
}) => {
    const email = page.getByLabel('Email address', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await email.fill('signin@webmail.test');
    await email.press('Tab');
    await expect(password).toBeFocused();
    await password.fill('webmail-local-only');
    await password.press('Tab');
    const show = page.getByRole('button', {
        name: 'Show password',
        exact: true,
    });
    await expect(show).toBeFocused();
    await show.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveValue('webmail-local-only');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole('button', { name: 'Hide password' }).press('Enter');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route('**/login', async (route) => {
        if (route.request().method() === 'POST') await gate;
        await route.continue();
    });
    try {
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Signing in' }),
        ).toBeDisabled();
        await expect(password).toHaveAttribute('type', 'password');
        await expect(
            page.getByRole('button', { name: 'Show password' }),
        ).toBeDisabled();
    } finally {
        release();
    }
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
});

test('failed sign-in keeps the email, announces the error, and supports retry', async ({
    page,
}, info) => {
    const email = page.getByLabel('Email address', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await email.fill('signin@webmail.test');
    await password.fill('incorrect-fictional-password');
    await password.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(email).toHaveValue('signin@webmail.test');
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(/credentials/i);
    await expect(email).toBeFocused();
    await page.screenshot({
        path: info.outputPath('login-error.png'),
        animations: 'disabled',
    });
    await password.fill('webmail-local-only');
    await password.press('Enter');
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
});

test('forgot password explains managed recovery without submitting or losing sign-in details', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const email = page.getByLabel('Email address', { exact: true });
    const password = page.getByLabel('Password', { exact: true });
    await email.fill('signin@webmail.test');
    await password.fill('webmail-local-only');
    const submitted: string[] = [];
    page.on('request', (request) => {
        if (request.method() === 'POST') submitted.push(request.url());
    });

    await page.getByRole('button', { name: 'Show password' }).focus();
    await page.keyboard.press('Tab');
    const forgot = page.getByText('Forgot password?', { exact: true });
    await expect(forgot).toBeFocused();
    await forgot.press('Enter');
    const recovery = page.getByRole('region', { name: 'Password recovery' });
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText(/administrator/);
    await expect(recovery).toContainText(/reset links by email/i);
    await expect(email).toHaveValue('signin@webmail.test');
    await expect(password).toHaveValue('webmail-local-only');
    await expect(page).toHaveURL(/\/login$/);
    expect(submitted).toEqual([]);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
        path: info.outputPath('login-recovery-mobile.png'),
        fullPage: true,
        animations: 'disabled',
    });

    await page.setViewportSize({ width: 320, height: 740 });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await forgot.press('Enter');
    await expect(recovery).toBeHidden();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
});

test('login is accessible and readable across themes, mobile widths, and enlarged text', async ({
    page,
}, info) => {
    for (const [name, width, height, scheme] of [
        ['desktop', 1440, 960, 'light'],
        ['mobile', 390, 844, 'light'],
        ['narrow', 320, 740, 'light'],
        ['dark', 1440, 960, 'dark'],
    ] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({
            colorScheme: scheme,
            reducedMotion: 'reduce',
        });
        await expect(
            page.getByRole('button', { name: 'Sign in', exact: true }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
        await page.screenshot({
            path: info.outputPath(`login-${name}.png`),
            fullPage: true,
            animations: 'disabled',
        });
    }
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);
    await page
        .getByRole('button', { name: 'Sign in', exact: true })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: info.outputPath('login-enlarged.png'),
        fullPage: true,
        animations: 'disabled',
    });
});
