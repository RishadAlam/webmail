import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
    expect,
    test,
    type APIResponse,
    type Page,
    type Route,
} from '@playwright/test';

const baseURL = 'http://127.0.0.1:8010';
const defaultPreferences = {
    theme: 'light',
    palette: 'default',
    density: 'comfortable',
    pane: 'none',
    collapsed: false,
    swipe_left: 'archive',
    swipe_right: 'read',
    page_size: 30,
    inbox_order: 'newest',
    default_reply: 'reply',
    snippets: true,
    hover_actions: true,
    spellcheck: true,
    keyboard_shortcuts: false,
    unread_badge: false,
    auto_advance: 'list',
};
type Organization = {
    labels: { id: number; name: string; color: string }[];
    rules: { id: number; name: string; enabled: boolean }[];
    blocked_senders: { id: number; email: string }[];
};
type Draft = {
    id: string;
    subject: string;
    body: string;
    to: string[];
    version: number;
    attachments: { id: string; name: string; size: number }[];
};
type InitialPage = {
    version: string;
    props: {
        auth: { user: { preferences?: Record<string, unknown> } };
        mailboxes: { id: number; name: string }[];
        messages: {
            id: number;
            thread_id: string;
            subject: string;
            important: boolean;
            folder: string;
            snoozed_until: string | null;
        }[];
    };
};
type Cleanup = {
    preferences: Record<string, unknown>;
    signature: string;
    resources: string[];
    operations: string[];
    messages: { id: number; important: boolean; folder: string }[];
};

let authState = '';
let mailboxURL = '';
let organizationURL = '';
const cleanup = new WeakMap<Page, Cleanup>();

// Real authorized requests against the disposable local browser database.
// This file never sends mail and does not depend on the remaining send quota.
test.use({
    storageState: { cookies: [], origins: [] },
    // WebKit bypasses page routes once a service worker controls the document.
    // These tests deliberately intercept committed responses; PWA/privacy
    // behavior runs separately with service workers enabled in mail.spec.ts.
    serviceWorkers: 'block',
});

async function request(
    page: Page,
    path: string,
    method = 'GET',
    data?: unknown,
): Promise<APIResponse> {
    const cookies = await page.context().cookies(baseURL);
    const csrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN');
    return page.request.fetch(`${baseURL}${path}`, {
        method,
        headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': decodeURIComponent(csrf?.value ?? ''),
        },
        ...(data === undefined ? {} : { data }),
    });
}

async function initialPage(page: Page): Promise<InitialPage> {
    // Read the authorized document's bootstrap payload, never a database or
    // test-only application hook. Call only after a full page navigation.
    const text = await page.locator('script[data-page="app"]').textContent();
    expect(text).not.toBeNull();
    return JSON.parse(text!) as InitialPage;
}

async function uiMutation<T>(
    page: Page,
    path: string,
    method: string,
    act: () => Promise<unknown>,
): Promise<T> {
    const completed = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === path &&
            response.request().method() === method,
    );
    await act();
    const response = await completed;
    expect(response.ok(), `${method} ${path} should succeed`).toBe(true);
    return response.json() as Promise<T>;
}

function retainForCleanup(page: Page, path: string) {
    cleanup.get(page)!.resources.push(path);
}

async function createLabel(page: Page, boxURL: string, name: string) {
    const response = await request(page, `${boxURL}/labels`, 'POST', {
        name,
        color: '#146c2e',
    });
    expect(response.ok()).toBe(true);
    const data = (await response.json()) as Organization;
    const label = data.labels.find((item) => item.name === name);
    expect(label).toBeDefined();
    retainForCleanup(page, `${boxURL}/labels/${label!.id}`);
    return label!;
}

async function whileResponseHeld<T>(
    page: Page,
    path: string,
    method: string,
    act: () => Promise<unknown>,
    assertPending: () => Promise<void>,
): Promise<T> {
    let release = () => {};
    let held = false;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const pattern = `${baseURL}${path}`;
    const handler = async (route: Route) => {
        if (route.request().method() !== method) return route.continue();
        // Commit against the real endpoint, but keep the UI waiting for its
        // response. Release in finally even when a pending-state assertion fails.
        const response = await route.fetch();
        held = true;
        await gate;
        await route.fulfill({ response });
    };
    await page.route(pattern, handler);
    const completed = uiMutation<T>(page, path, method, act);
    let result: T;
    try {
        await expect.poll(() => held).toBe(true);
        await assertPending();
    } finally {
        release();
        try {
            result = await completed;
        } finally {
            await page.unroute(pattern, handler);
        }
    }
    return result;
}

const fixtureURL = (subject: string, folder = 'all') =>
    `${mailboxURL}?folder=${folder}&q=${encodeURIComponent(subject)}`;

async function selectMessage(page: Page, subject: string) {
    await page
        .getByRole('checkbox', { name: `Select ${subject}`, exact: true })
        .check();
    await page
        .getByRole('button', { name: 'More message actions', exact: true })
        .click();
    return page.getByRole('dialog', { name: 'Message actions', exact: true });
}

async function newDraft(page: Page): Promise<Draft> {
    const draft = await uiMutation<Draft>(
        page,
        `${mailboxURL}/drafts`,
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Compose', exact: true })
                .first()
                .click(),
    );
    retainForCleanup(page, `/drafts/${draft.id}`);
    await expect(
        page.getByRole('textbox', { name: 'Message body', exact: true }),
    ).toBeVisible();
    return draft;
}

async function expectSaved(page: Page) {
    await expect(
        page.getByText('Saved to WebMail', { exact: true }),
    ).toBeVisible();
}

test.beforeAll(async ({ browser }, info) => {
    mkdirSync('test-results', { recursive: true });
    authState = join(
        'test-results',
        `workflows-auth-${info.project.name}.json`,
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
                .fill('mira@webmail.test');
            await page
                .getByLabel('Password', { exact: true })
                .fill('password');
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
        const laboratory = page.getByRole('link', { name: /Acceptance Lab/ });
        await expect(laboratory).toBeVisible();
        const href = await laboratory.getAttribute('href');
        expect(href).toMatch(/^\/mail\/\d+$/);
        mailboxURL = href!;
        organizationURL = `/settings/organization/${mailboxURL.split('/').at(-1)}`;
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
    await page.goto(mailboxURL);
    const initial = await initialPage(page);
    const existing = initial.props.auth.user.preferences ?? {};
    const signatureResponse = await request(page, '/settings/signature');
    expect(signatureResponse.ok()).toBe(true);
    const signature = (await signatureResponse.json()) as {
        signature: { body: string };
    };
    cleanup.set(page, {
        preferences: Object.fromEntries(
            Object.entries(defaultPreferences).map(([key, value]) => [
                key,
                existing[key] ?? value,
            ]),
        ),
        signature: signature.signature.body,
        resources: [],
        operations: [],
        messages: [],
    });
    expect(
        (await request(page, '/preferences', 'PUT', defaultPreferences)).ok(),
    ).toBe(true);
    expect(
        (await request(page, '/settings/signature', 'PUT', { body: '' })).ok(),
    ).toBe(true);
    await page.goto(mailboxURL);
    await expect(
        page.getByRole('heading', { name: 'Inbox', exact: true }),
    ).toBeVisible();
});

test.afterEach(async ({ page }) => {
    const state = cleanup.get(page);
    if (!state) return;
    const failures: string[] = [];
    const restore = async (path: string, method: string, data?: unknown) => {
        try {
            const response = await request(page, path, method, data);
            if (!response.ok() && response.status() !== 404)
                failures.push(`${method} ${path}: ${response.status()}`);
        } catch {
            failures.push(`${method} ${path}: request failed`);
        }
    };
    for (const operation of state.operations)
        await restore(`/operations/${operation}/undo`, 'POST');
    for (const path of state.resources.reverse()) await restore(path, 'DELETE');
    for (const message of state.messages) {
        await restore(`${mailboxURL}/actions`, 'POST', {
            ids: [message.id],
            action: message.important ? 'important' : 'unimportant',
        });
        await restore(`${mailboxURL}/actions`, 'POST', {
            ids: [message.id],
            action: message.folder,
        });
    }
    await restore('/settings/signature', 'PUT', { body: state.signature });
    await restore('/preferences', 'PUT', state.preferences);
    expect(
        failures,
        'Every workflow restores its own test data and preferences',
    ).toEqual([]);
});

test.afterAll(() => {
    if (authState && existsSync(authState)) unlinkSync(authState);
});

test('workflows: create, apply, rename and remove a label without losing its message', async ({
    page,
}) => {
    const suffix = Date.now().toString(36);
    const labelName = `Workflow label ${suffix}`;
    const renamed = `Workflow edited ${suffix}`;
    const subject = 'Acceptance scroll fixture 41';
    await page.goto(organizationURL);
    await page.getByLabel('Label name', { exact: true }).fill(labelName);
    await page
        .getByRole('button', { name: 'Label color #146c2e', exact: true })
        .click();
    const created = await uiMutation<Organization>(
        page,
        `${mailboxURL}/labels`,
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Create label', exact: true })
                .click(),
    );
    const label = created.labels.find((item) => item.name === labelName);
    expect(label).toBeDefined();
    retainForCleanup(page, `${mailboxURL}/labels/${label!.id}`);
    expect(label!.color).toBe('#146c2e');

    await page.goto(fixtureURL(subject));
    const actions = await selectMessage(page, subject);
    await actions
        .getByLabel('Label', { exact: true })
        .selectOption(String(label!.id));
    await uiMutation(page, `${mailboxURL}/actions`, 'POST', () =>
        actions
            .getByRole('button', { name: 'Apply label', exact: true })
            .click(),
    );
    await expect(actions).not.toBeVisible();
    await expect(
        page
            .locator('.message-row')
            .filter({ hasText: subject })
            .getByText(labelName, { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('navigation', { name: 'Labels', exact: true })
        .getByRole('link', { name: labelName, exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: labelName, exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();

    await page.goto(organizationURL);
    await page
        .getByRole('button', { name: `Edit ${labelName}`, exact: true })
        .click();
    await page.getByLabel('Label name', { exact: true }).fill(renamed);
    await uiMutation(page, `${mailboxURL}/labels/${label!.id}`, 'PATCH', () =>
        page.getByRole('button', { name: 'Save label', exact: true }).click(),
    );
    await page.goto(`${mailboxURL}?folder=all&label=${label!.id}`);
    await expect(
        page.getByRole('heading', { name: renamed, exact: true }),
    ).toBeVisible();
    await expect(
        page
            .locator('.message-row')
            .filter({ hasText: subject })
            .getByText(renamed, { exact: true }),
    ).toBeVisible();

    await page.goto(organizationURL);
    await page
        .getByRole('button', { name: `Remove ${renamed}`, exact: true })
        .click();
    await uiMutation(page, `${mailboxURL}/labels/${label!.id}`, 'DELETE', () =>
        page.getByRole('button', { name: 'Remove label', exact: true }).click(),
    );
    await expect(
        page.locator('.organization-settings').getByRole('status'),
    ).toContainText('All messages are retained');
    await page.goto(fixtureURL(subject));
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();
    await expect(
        page
            .getByRole('navigation', { name: 'Labels', exact: true })
            .getByRole('link', { name: renamed, exact: true }),
    ).toHaveCount(0);
});

test('workflows: importance and snooze have explicit views, return actions and Undo', async ({
    page,
}) => {
    const subject = 'Acceptance scroll fixture 42';
    await page.goto(fixtureURL(subject, 'inbox'));
    const initial = (await initialPage(page)).props.messages.find(
        (item) => item.subject === subject,
    );
    expect(initial).toBeDefined();
    expect(initial!.folder).toBe('inbox');
    expect(initial!.snoozed_until).toBeNull();
    cleanup.get(page)!.messages.push({
        id: initial!.id,
        important: initial!.important,
        folder: initial!.folder,
    });
    if (initial!.important) {
        expect(
            (
                await request(page, `${mailboxURL}/actions`, 'POST', {
                    ids: [initial!.id],
                    action: 'unimportant',
                })
            ).ok(),
        ).toBe(true);
        await page.goto(fixtureURL(subject, 'inbox'));
    }
    let actions = await selectMessage(page, subject);
    await uiMutation(page, `${mailboxURL}/actions`, 'POST', () =>
        actions
            .getByRole('button', { name: 'Mark important', exact: true })
            .click(),
    );
    await page
        .getByRole('navigation', { name: 'Mail folders' })
        .getByRole('link', { name: /^Important/ })
        .click();
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByText('Change undone', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toHaveCount(0);

    await page.goto(fixtureURL(subject, 'inbox'));
    actions = await selectMessage(page, subject);
    await actions.getByRole('button', { name: 'Snooze', exact: true }).click();
    const snooze = page.getByRole('dialog', {
        name: 'Snooze messages',
        exact: true,
    });
    await uiMutation(page, `${mailboxURL}/actions`, 'POST', () =>
        snooze
            .getByRole('button', { name: 'In one hour', exact: true })
            .click(),
    );
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toHaveCount(0);
    await page
        .getByRole('navigation', { name: 'Mail folders' })
        .getByRole('link', { name: /^Snoozed/ })
        .click();
    await expect(
        page.getByText(
            /Snoozed messages return to your inbox when you next open or refresh/,
        ),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();
    actions = await selectMessage(page, subject);
    await uiMutation(page, `${mailboxURL}/actions`, 'POST', () =>
        actions
            .getByRole('button', {
                name: 'Return snoozed to Inbox',
                exact: true,
            })
            .click(),
    );
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
        page.getByText('Change undone', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();
    actions = await selectMessage(page, subject);
    await uiMutation(page, `${mailboxURL}/actions`, 'POST', () =>
        actions
            .getByRole('button', {
                name: 'Return snoozed to Inbox',
                exact: true,
            })
            .click(),
    );
    await page.goto(fixtureURL(subject, 'inbox'));
    await expect(
        page.getByRole('button', {
            name: new RegExp(`Open conversation: ${subject}`),
        }),
    ).toBeVisible();
});

test('workflows: editing a paused filter preserves its state and senders can be unblocked', async ({
    page,
}) => {
    const suffix = Date.now().toString(36);
    const filterName = `Fictional paused filter ${suffix}`;
    const renamed = `Fictional revised filter ${suffix}`;
    const sender = `workflow-blocked-${suffix}@example.test`;
    await page.goto(organizationURL);
    await page
        .getByRole('navigation', { name: 'Mailbox organization' })
        .getByRole('button', { name: 'Filters', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Create filter', exact: true })
        .click();
    await page.getByLabel('Filter name', { exact: true }).fill(filterName);
    await page.getByLabel('Sender contains', { exact: true }).fill(sender);
    await page
        .getByRole('checkbox', { name: 'Mark as read', exact: true })
        .check();
    const created = await uiMutation<Organization>(
        page,
        `${mailboxURL}/rules`,
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Save filter', exact: true })
                .click(),
    );
    const rule = created.rules.find((item) => item.name === filterName);
    expect(rule).toBeDefined();
    retainForCleanup(page, `${mailboxURL}/rules/${rule!.id}`);
    const row = page
        .locator('.organization-list > li')
        .filter({ hasText: filterName });
    await uiMutation(page, `${mailboxURL}/rules/${rule!.id}`, 'PATCH', () =>
        row.getByRole('button', { name: 'Pause', exact: true }).click(),
    );
    await expect(row).toContainText('Paused');
    await row
        .getByRole('button', { name: `Edit filter ${filterName}`, exact: true })
        .click();
    await page.getByLabel('Filter name', { exact: true }).fill(renamed);
    await page
        .getByLabel('Subject contains', { exact: true })
        .fill('Fictional future message');
    const edited = await uiMutation<Organization>(
        page,
        `${mailboxURL}/rules/${rule!.id}`,
        'PATCH',
        () =>
            page
                .getByRole('button', { name: 'Save filter', exact: true })
                .click(),
    );
    expect(edited.rules.find((item) => item.id === rule!.id)?.enabled).toBe(
        false,
    );
    await page.reload();
    await page
        .getByRole('navigation', { name: 'Mailbox organization' })
        .getByRole('button', { name: 'Filters', exact: true })
        .click();
    const revised = page
        .locator('.organization-list > li')
        .filter({ hasText: renamed });
    await expect(revised).toContainText('Paused');
    await expect(
        revised.getByRole('button', { name: 'Enable', exact: true }),
    ).toBeVisible();

    await page
        .getByRole('navigation', { name: 'Mailbox organization' })
        .getByRole('button', { name: 'Blocked senders', exact: true })
        .click();
    await page
        .getByLabel('Email address to block', { exact: true })
        .fill(sender);
    const blocked = await uiMutation<Organization>(
        page,
        `${mailboxURL}/blocked-senders`,
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Block sender', exact: true })
                .click(),
    );
    const entry = blocked.blocked_senders.find((item) => item.email === sender);
    expect(entry).toBeDefined();
    retainForCleanup(page, `${mailboxURL}/blocked-senders/${entry!.id}`);
    const blockedRow = page
        .locator('.organization-list > li')
        .filter({ hasText: sender });
    await expect(blockedRow).toBeVisible();
    await uiMutation(
        page,
        `${mailboxURL}/blocked-senders/${entry!.id}`,
        'DELETE',
        () =>
            blockedRow
                .getByRole('button', { name: 'Unblock', exact: true })
                .click(),
    );
    await expect(blockedRow).toHaveCount(0);
    await page
        .getByRole('navigation', { name: 'Mailbox organization' })
        .getByRole('button', { name: 'Filters', exact: true })
        .click();
    await uiMutation(page, `${mailboxURL}/rules/${rule!.id}`, 'DELETE', () =>
        page
            .getByRole('button', {
                name: `Remove filter ${renamed}`,
                exact: true,
            })
            .click(),
    );
    await expect(
        page.locator('.organization-list > li').filter({ hasText: renamed }),
    ).toHaveCount(0);
});

test('workflows: slow organization saves lock the editor and mailbox selection until completion', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const suffix = Date.now().toString(36);
    const labelName = `Slow label ${suffix}`;
    const revisedLabel = `Revised label ${suffix}`;
    const filterName = `Slow fictional filter ${suffix}`;
    const revisedFilter = `Revised fictional filter ${suffix}`;
    const label = await createLabel(page, mailboxURL, labelName);
    const ruleResponse = await request(page, `${mailboxURL}/rules`, 'POST', {
        name: filterName,
        enabled: false,
        predicates: { sender: 'fictional-slow-save@example.test' },
        actions: { read: true },
    });
    expect(ruleResponse.ok()).toBe(true);
    const rule = ((await ruleResponse.json()) as Organization).rules.find(
        (item) => item.name === filterName,
    );
    expect(rule).toBeDefined();
    retainForCleanup(page, `${mailboxURL}/rules/${rule!.id}`);
    await page.goto(organizationURL);
    await page
        .getByRole('button', { name: `Edit ${labelName}`, exact: true })
        .click();
    await page.getByLabel('Label name', { exact: true }).fill(revisedLabel);
    await whileResponseHeld<Organization>(
        page,
        `${mailboxURL}/labels/${label.id}`,
        'PATCH',
        () =>
            page
                .getByRole('button', { name: 'Save label', exact: true })
                .click(),
        async () => {
            await expect(
                page.getByLabel('Label name', { exact: true }),
            ).toBeDisabled();
            await expect(
                page.getByRole('button', {
                    name: 'Label color #146c2e',
                    exact: true,
                }),
            ).toBeDisabled();
            await expect(
                page.getByRole('button', {
                    name: `Edit ${labelName}`,
                    exact: true,
                }),
            ).toBeDisabled();
            await expect(
                page.getByLabel('Mailbox', { exact: true }),
            ).toBeDisabled();
        },
    );
    await expect(
        page.getByRole('button', { name: `Edit ${revisedLabel}`, exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel('Mailbox', { exact: true })).toBeEnabled();
    await page
        .getByRole('navigation', { name: 'Mailbox organization' })
        .getByRole('button', { name: 'Filters', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: `Edit filter ${filterName}`,
            exact: true,
        })
        .click();
    await page.getByLabel('Filter name', { exact: true }).fill(revisedFilter);
    await whileResponseHeld<Organization>(
        page,
        `${mailboxURL}/rules/${rule!.id}`,
        'PATCH',
        () =>
            page
                .getByRole('button', { name: 'Save filter', exact: true })
                .click(),
        async () => {
            await expect(
                page.getByLabel('Filter name', { exact: true }),
            ).toBeDisabled();
            await expect(
                page.getByLabel('Sender contains', { exact: true }),
            ).toBeDisabled();
            await expect(
                page.getByRole('checkbox', {
                    name: 'Mark as read',
                    exact: true,
                }),
            ).toBeDisabled();
            await expect(
                page.getByRole('button', {
                    name: `Edit filter ${filterName}`,
                    exact: true,
                }),
            ).toBeDisabled();
            await expect(
                page.getByLabel('Mailbox', { exact: true }),
            ).toBeDisabled();
        },
    );
    const revised = page
        .locator('.organization-list > li')
        .filter({ hasText: revisedFilter });
    await expect(revised).toContainText('Paused');
    await expect(
        revised.getByRole('button', {
            name: `Edit filter ${revisedFilter}`,
            exact: true,
        }),
    ).toBeEnabled();
    await expect(page.getByLabel('Mailbox', { exact: true })).toBeEnabled();
});

test('workflows: saving a minimized dirty draft preserves the destination organization mailbox', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const sourceId = mailboxURL.split('/').at(-1)!;
    const destination = (await initialPage(page)).props.mailboxes.find(
        (box) => String(box.id) !== sourceId,
    );
    expect(
        destination,
        'The authorized acceptance user has another mailbox',
    ).toBeDefined();
    const destinationMailURL = `/mail/${destination!.id}`;
    const destinationSettingsURL = `/settings/organization/${destination!.id}`;
    const suffix = Date.now().toString(36);
    const sourceLabel = `Source only ${suffix}`;
    const destinationLabel = `Destination only ${suffix}`;
    const subject = `Fictional mailbox navigation ${suffix}`;
    await createLabel(page, mailboxURL, sourceLabel);
    await createLabel(page, destinationMailURL, destinationLabel);
    const draft = await newDraft(page);
    await page
        .getByRole('button', { name: 'Minimize compose', exact: true })
        .click();
    await page
        .getByRole('link', { name: 'Manage labels and filters', exact: true })
        .click();
    await expect(page).toHaveURL(`${baseURL}${organizationURL}`);
    await expect(page.getByText(sourceLabel, { exact: true })).toBeVisible();
    await expect(page.getByText(destinationLabel, { exact: true })).toHaveCount(
        0,
    );
    await page
        .getByRole('button', { name: 'Restore compose', exact: true })
        .click();
    await whileResponseHeld<Draft>(
        page,
        `/drafts/${draft.id}`,
        'PUT',
        async () => {
            await page.getByLabel('Subject', { exact: true }).fill(subject);
            await page
                .getByRole('button', { name: 'Minimize compose', exact: true })
                .click();
            await page
                .getByLabel('Mailbox', { exact: true })
                .selectOption(String(destination!.id));
        },
        async () => {
            await expect(page).toHaveURL(`${baseURL}${organizationURL}`);
            await expect(
                page.getByRole('button', {
                    name: 'Restore compose',
                    exact: true,
                }),
            ).toBeVisible();
        },
    );
    await expect(page).toHaveURL(`${baseURL}${destinationSettingsURL}`);
    await expect(page.getByLabel('Mailbox', { exact: true })).toHaveValue(
        String(destination!.id),
    );
    await expect(
        page.getByText(destinationLabel, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(sourceLabel, { exact: true })).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Restore compose', exact: true })
        .click();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        subject,
    );
    const persisted = await request(page, `/drafts/${draft.id}`);
    expect(persisted.ok()).toBe(true);
    expect(((await persisted.json()) as Draft).subject).toBe(subject);
    await page
        .getByRole('button', { name: 'Save and close draft', exact: true })
        .click();
});

test('workflows: editing a contact focuses its name field on a narrow screen', async ({
    page,
}) => {
    const suffix = Date.now().toString(36);
    const contactName = `Fictional focus contact ${suffix}`;
    const created = await request(page, '/settings/contacts', 'POST', {
        name: contactName,
        email: `focus-${suffix}@example.test`,
    });
    expect(created.ok()).toBe(true);
    const { contact } = (await created.json()) as { contact: { id: number } };
    retainForCleanup(page, `/settings/contacts/${contact.id}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/settings/mail');
    await page
        .getByLabel('Search your contacts', { exact: true })
        .fill(contactName);
    await page
        .getByRole('button', { name: `Edit ${contactName}`, exact: true })
        .click();
    const name = page.getByLabel('Contact name', { exact: true });
    await expect(name).toHaveValue(contactName);
    await expect(name).toBeFocused();
    await expect(name).toBeInViewport();
});

test('workflows: auto-advance skips duplicate conversation rows and Undo restores the archived page', async ({
    page,
}) => {
    test.setTimeout(60_000);
    expect(
        (
            await request(page, '/preferences', 'PUT', {
                page_size: 100,
                auto_advance: 'next',
            })
        ).ok(),
    ).toBe(true);
    await page.goto(mailboxURL);
    const initial = (await initialPage(page)).props.messages;
    const threadId = 'acceptance-long-conversation';
    const original = initial.filter(
        (message) => message.thread_id === threadId,
    );
    expect(original).toHaveLength(31);
    expect(original.every((message) => message.folder === 'inbox')).toBe(true);
    const currentIndex = initial.findIndex(
        (message) => message.thread_id === threadId,
    );
    expect(initial[currentIndex + 1].thread_id).toBe(threadId);
    const next = initial
        .slice(currentIndex + 1)
        .find((message) => message.thread_id !== threadId);
    expect(next).toBeDefined();
    await page
        .getByRole('button', {
            name: /Open conversation: Acceptance long conversation/,
        })
        .first()
        .click();
    await expect(page.locator('.conversation-message')).toHaveCount(30);
    const sent = page.waitForRequest(
        (request) =>
            new URL(request.url()).pathname === `${mailboxURL}/actions` &&
            request.method() === 'POST',
    );
    const operation = await uiMutation<{ operation: string }>(
        page,
        `${mailboxURL}/actions`,
        'POST',
        () =>
            page
                .getByRole('button', {
                    name: 'Archive visible messages',
                    exact: true,
                })
                .click(),
    );
    cleanup.get(page)!.operations.push(operation.operation);
    const archived = (await sent).postDataJSON() as {
        action: string;
        ids: number[];
    };
    expect(archived.action).toBe('archive');
    expect([...archived.ids].sort((a, b) => a - b)).toEqual(
        original
            .slice(0, 30)
            .map((message) => message.id)
            .sort((a, b) => a - b),
    );
    await expect
        .poll(() => new URL(page.url()).pathname)
        .toBe(`${mailboxURL}/thread/${next!.thread_id}`);
    await expect(page.locator('.conversation-subject h1')).toHaveText(
        next!.subject,
    );
    await uiMutation(
        page,
        `/operations/${operation.operation}/undo`,
        'POST',
        () => page.getByRole('button', { name: 'Undo', exact: true }).click(),
    );
    await expect(
        page.getByText('Change undone', { exact: true }),
    ).toBeVisible();
    await page.goto(mailboxURL);
    const restored = (await initialPage(page)).props.messages.filter(
        (message) => message.thread_id === threadId,
    );
    expect(restored.map(({ id, folder }) => ({ id, folder }))).toEqual(
        original.map(({ id, folder }) => ({ id, folder })),
    );
});

test('workflows: settings and Appearance share preferences while the same draft stays open', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const subject = `Fictional settings continuity ${Date.now().toString(36)}`;
    const draft = await newDraft(page);
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await page
        .getByRole('textbox', { name: 'Message body', exact: true })
        .fill('Keep this fictional draft while changing mail settings.');
    await expectSaved(page);
    await page
        .getByRole('button', { name: 'Minimize compose', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Quick settings', exact: true })
        .click();
    await page
        .getByRole('link', { name: 'See all settings', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Mail settings', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Restore compose', exact: true }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Default', exact: true }).check();
    await page.getByRole('radio', { name: 'Below inbox', exact: true }).check();
    await page
        .getByLabel('Messages per page', { exact: true })
        .selectOption('10');
    await page
        .getByLabel('Inbox order', { exact: true })
        .selectOption('unread');
    await page
        .getByLabel('Default reply action', { exact: true })
        .selectOption('reply-all');
    await page.getByRole('checkbox', { name: /^Message snippets/ }).uncheck();
    await expect(
        page.getByText('Preferences saved', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('navigation', { name: 'Settings', exact: true })
        .getByRole('link', { name: 'Themes', exact: true })
        .click();
    const dark = page.getByRole('button', { name: 'Dark', exact: true });
    await dark.click();
    await expect(dark).toBeEnabled();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page
        .getByRole('navigation', { name: 'Settings', exact: true })
        .getByRole('link', { name: 'Mail', exact: true })
        .click();
    await expect(
        page.getByRole('radio', { name: 'Dark', exact: true }),
    ).toBeChecked();
    await expect(
        page.getByRole('radio', { name: 'Default', exact: true }),
    ).toBeChecked();
    await expect(
        page.getByRole('radio', { name: 'Below inbox', exact: true }),
    ).toBeChecked();
    await page
        .locator('.admin-header')
        .getByRole('link', { name: 'Back to mail', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Restore compose', exact: true })
        .click();
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        subject,
    );
    await expect(
        page.getByRole('textbox', { name: 'Message body', exact: true }),
    ).toContainText('Keep this fictional draft while changing mail settings.');
    await expect(
        page.getByRole('textbox', { name: 'Message body', exact: true }),
    ).toHaveCount(1);
    await page
        .getByRole('button', { name: 'Save and close draft', exact: true })
        .click();
    await page.goto('/settings/mail');
    await expect(
        page.getByLabel('Messages per page', { exact: true }),
    ).toHaveValue('10');
    await expect(page.getByLabel('Inbox order', { exact: true })).toHaveValue(
        'unread',
    );
    await expect(
        page.getByLabel('Default reply action', { exact: true }),
    ).toHaveValue('reply-all');
    await expect(
        page.getByRole('checkbox', { name: /^Message snippets/ }),
    ).not.toBeChecked();
    const persisted = await request(page, `/drafts/${draft.id}`);
    expect(persisted.ok()).toBe(true);
    expect(((await persisted.json()) as Draft).subject).toBe(subject);
});

test('workflows: private writing tools append safely and attachments survive reopen and a lost response', async ({
    page,
}) => {
    test.setTimeout(90_000);
    const suffix = Date.now().toString(36);
    const signature = `Fictional Workflow Writer ${suffix}`;
    const templateName = `Fictional template ${suffix}`;
    const templateBody = 'Fictional template <note>appended text</note>.';
    const contactName = `Fictional recipient ${suffix}`;
    const contactEmail = `workflow-${suffix}@example.test`;
    const subject = `Fictional writing workflow ${suffix}`;
    const opening = 'Keep this existing opening paragraph.';
    await page.goto('/settings/mail');
    await page.getByRole('textbox', { name: /^Signature/ }).fill(signature);
    await uiMutation(page, '/settings/signature', 'PUT', () =>
        page
            .getByRole('button', { name: 'Save signature', exact: true })
            .click(),
    );
    await page.getByLabel('Template name', { exact: true }).fill(templateName);
    await page.getByLabel(/^Subject/).fill('A suggested template subject');
    await page.getByLabel('Template text', { exact: true }).fill(templateBody);
    const template = await uiMutation<{ template: { id: number } }>(
        page,
        '/settings/templates',
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Save template', exact: true })
                .click(),
    );
    retainForCleanup(page, `/settings/templates/${template.template.id}`);
    await page.getByLabel('Contact name', { exact: true }).fill(contactName);
    await page.getByLabel('Email address', { exact: true }).fill(contactEmail);
    const contact = await uiMutation<{ contact: { id: number } }>(
        page,
        '/settings/contacts',
        'POST',
        () =>
            page
                .getByRole('button', { name: 'Add contact', exact: true })
                .click(),
    );
    retainForCleanup(page, `/settings/contacts/${contact.contact.id}`);
    await expect(
        page.getByRole('button', { name: 'New contact', exact: true }),
    ).toBeVisible();
    await page.goto(mailboxURL);
    const draft = await newDraft(page);
    const body = page.getByRole('textbox', {
        name: 'Message body',
        exact: true,
    });
    await expect(body).toContainText(signature);
    expect((await body.innerText()).split(signature)).toHaveLength(2);
    await page.getByLabel('Subject', { exact: true }).fill(subject);
    await body.fill(`${opening}\n\n${signature}`);
    const to = page.getByLabel('To', { exact: true });
    await expect(to).toHaveAttribute('list', 'compose-contact-options');
    await expect(
        page
            .locator('#compose-contact-options option')
            .filter({ hasText: contactName }),
    ).toHaveAttribute('value', contactEmail);
    await to.fill(contactEmail);
    await to.press('Enter');
    await expect(
        page.getByRole('button', {
            name: `Remove ${contactEmail} from To`,
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByLabel('Message template', { exact: true })
        .selectOption({ label: templateName });
    await page
        .locator('.composer')
        .getByRole('button', { name: 'Insert', exact: true })
        .click();
    await expect(body).toContainText(opening);
    await expect(body).toContainText(templateBody);
    await expect(body.locator('note')).toHaveCount(0);
    await expect(page.getByLabel('Subject', { exact: true })).toHaveValue(
        subject,
    );
    expect((await body.innerText()).split(signature)).toHaveLength(2);
    await expectSaved(page);

    const originalName = `workflow-original-${suffix}.txt`;
    await uiMutation<Draft>(
        page,
        `/drafts/${draft.id}/attachments`,
        'POST',
        () =>
            page
                .getByLabel('Choose attachment', { exact: true })
                .setInputFiles({
                    name: originalName,
                    mimeType: 'text/plain',
                    buffer: Buffer.from(
                        'Fictional attachment retained with this draft.\n',
                    ),
                }),
    );
    await expect(
        page
            .getByRole('list', { name: 'Draft attachments' })
            .getByRole('link', { name: originalName, exact: true }),
    ).toBeVisible();
    await expectSaved(page);
    await page
        .getByRole('button', { name: 'Save and close draft', exact: true })
        .click();
    await page
        .getByRole('navigation', { name: 'Mail folders' })
        .getByRole('link', { name: /^Drafts/ })
        .click();
    await page
        .getByRole('button', { name: `Resume draft: ${subject}`, exact: true })
        .click();
    await expect(
        page
            .getByRole('list', { name: 'Draft attachments' })
            .getByRole('link', { name: originalName, exact: true }),
    ).toBeVisible();
    await expect(body).toContainText(opening);
    await expect(body).toContainText(templateBody);
    expect((await body.innerText()).split(signature)).toHaveLength(2);
    await page
        .getByRole('button', {
            name: `Remove attachment ${originalName}`,
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('list', { name: 'Draft attachments' }),
    ).toHaveCount(0);

    const recoveredName = `workflow-recovered-${suffix}.txt`;
    const recoveredBytes =
        'Fictional attachment with an interrupted response.\n';
    const uploadPath = `**/drafts/${draft.id}/attachments`;
    const reconciled = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === `/drafts/${draft.id}` &&
            response.request().method() === 'GET',
    );
    await page.route(uploadPath, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        // Commit through the real authorized endpoint, then lose only its
        // response. The subsequent GET must recover the actual saved version.
        // WebKit's interception protocol omits file bytes from multipart data.
        // Restore this known fixture only when that part is empty, preserving
        // the actual browser's version and boundaries. The upload above tests
        // native file transport without interception on every engine.
        const data = route.request().postDataBuffer()!.toString('utf8');
        const emptyFile = `name="file"; filename="${recoveredName}"\r\nContent-Type: text/plain\r\n\r\n\r\n--`;
        const postData = data.replace(
            emptyFile,
            `name="file"; filename="${recoveredName}"\r\nContent-Type: text/plain\r\n\r\n${recoveredBytes}\r\n--`,
        );
        const committed = await route.fetch({
            postData: Buffer.from(postData),
        });
        expect(committed.ok()).toBe(true);
        await route.abort('failed');
    });
    try {
        await page
            .getByLabel('Choose attachment', { exact: true })
            .setInputFiles({
                name: recoveredName,
                mimeType: 'text/plain',
                buffer: Buffer.from(recoveredBytes),
            });
        const recoveredResponse = await reconciled;
        expect(recoveredResponse.ok()).toBe(true);
        const recovered = (await recoveredResponse.json()) as Draft;
        expect(
            recovered.attachments.map((attachment) => attachment.name),
        ).toEqual([recoveredName]);
        await expect(
            page
                .getByRole('list', { name: 'Draft attachments' })
                .getByRole('link', { name: recoveredName, exact: true }),
        ).toBeVisible();
        await page.unroute(uploadPath);
        const removed = await uiMutation<Draft>(
            page,
            `/drafts/${draft.id}/attachments/${recovered.attachments[0].id}`,
            'DELETE',
            () =>
                page
                    .getByRole('button', {
                        name: `Remove attachment ${recoveredName}`,
                        exact: true,
                    })
                    .click(),
        );
        expect(removed.attachments).toEqual([]);
        expect(removed.version).toBeGreaterThan(recovered.version);
        await expectSaved(page);
        const persistedResponse = await request(page, `/drafts/${draft.id}`);
        expect(persistedResponse.ok()).toBe(true);
        const persisted = (await persistedResponse.json()) as Draft;
        expect(persisted.to).toEqual([contactEmail]);
        expect(persisted.attachments).toEqual([]);
        expect(persisted.body).toContain(opening);
        expect(persisted.body).toContain('&lt;note&gt;');
        expect(persisted.body.split(signature)).toHaveLength(2);
    } finally {
        await page.unroute(uploadPath);
    }
});

test('workflows: mail settings and organization forms remain accessible at 320, 390 and 1440 pixels', async ({
    page,
}, info) => {
    test.setTimeout(90_000);
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, path] of [
            ['mail', '/settings/mail'],
            ['organization', organizationURL],
        ] as const) {
            await page.goto(path);
            await expect(page.locator('.account-settings')).toBeVisible();
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <= innerWidth + 1,
                ),
                `${name} settings overflow at ${width}px`,
            ).toBe(true);
            const audit = await new AxeBuilder({ page }).analyze();
            await info.attach(`${name}-${width}-axe`, {
                body: JSON.stringify(audit.violations, null, 2),
                contentType: 'application/json',
            });
            expect(
                audit.violations,
                `${name} settings accessibility at ${width}px`,
            ).toEqual([]);
            await page.screenshot({
                path: info.outputPath(`${name}-settings-${width}.png`),
                fullPage: true,
            });
            if (name === 'organization') {
                await page
                    .getByRole('navigation', { name: 'Mailbox organization' })
                    .getByRole('button', { name: 'Filters', exact: true })
                    .click();
                await page
                    .getByRole('button', { name: 'Create filter', exact: true })
                    .click();
                await expect(
                    page.getByLabel('Filter name', { exact: true }),
                ).toBeVisible();
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <=
                            innerWidth + 1,
                    ),
                ).toBe(true);
                expect(
                    (await new AxeBuilder({ page }).analyze()).violations,
                ).toEqual([]);
                await page
                    .getByRole('navigation', { name: 'Mailbox organization' })
                    .getByRole('button', {
                        name: 'Blocked senders',
                        exact: true,
                    })
                    .click();
                await expect(
                    page.getByLabel('Email address to block', { exact: true }),
                ).toBeVisible();
                expect(
                    await page.evaluate(
                        () =>
                            document.documentElement.scrollWidth <=
                            innerWidth + 1,
                    ),
                ).toBe(true);
                expect(
                    (await new AxeBuilder({ page }).analyze()).violations,
                ).toEqual([]);
            }
        }
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/settings/mail');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    const overflow = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main *'))
            .filter((element) => {
                const bounds = element.getBoundingClientRect();
                return (
                    bounds.width > 0 &&
                    (bounds.right > innerWidth + 1 ||
                        (element.scrollWidth > element.clientWidth + 1 &&
                            getComputedStyle(element).overflowX === 'visible'))
                );
            })
            .map((element) => `${element.tagName}.${element.className}`),
    );
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `Settings must reflow at 200% text size: ${overflow.join(', ')}`,
    ).toBe(true);
    await expect(
        page.getByRole('button', { name: 'Save signature', exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: info.outputPath('mail-settings-320-text200.png'),
        fullPage: true,
    });
});

test('workflows: advanced search combines fields and restores them when reopened', async ({
    page,
}) => {
    const trigger = page.getByRole('button', {
        name: 'Search options',
        exact: true,
    });
    await trigger.click();
    const sheet = page.getByRole('dialog', {
        name: 'Search options',
        exact: true,
    });
    const before = page.url();
    await sheet.getByLabel('Search scope', { exact: true }).selectOption('all');
    await sheet
        .getByLabel('From', { exact: true })
        .fill('fictional.sender@example.net');
    await sheet
        .getByLabel('To', { exact: true })
        .fill('acceptance-lab@webmail.test');
    await sheet
        .getByLabel('Subject', { exact: true })
        .fill('Acceptance incoming attachment');
    await sheet.getByLabel('On or after', { exact: true }).fill('2026-10-01');
    await sheet.getByLabel('Before', { exact: true }).fill('2026-11-02');
    await sheet.getByLabel('Has attachment', { exact: true }).check();
    expect(page.url()).toBe(before);
    await sheet.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('.message-row')).toHaveCount(1);
    await expect(
        page.getByRole('button', {
            name: /Open conversation: Acceptance incoming attachment download/,
        }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get('q')).toContain(
        'has:attachment',
    );
    await trigger.click();
    await expect(sheet.getByLabel('From', { exact: true })).toHaveValue(
        'fictional.sender@example.net',
    );
    await expect(sheet.getByLabel('To', { exact: true })).toHaveValue(
        'acceptance-lab@webmail.test',
    );
    await expect(sheet.getByLabel('Subject', { exact: true })).toHaveValue(
        'Acceptance incoming attachment',
    );
    await expect(sheet.getByLabel('Search scope', { exact: true })).toHaveValue(
        'all',
    );
    await expect(
        sheet.getByLabel('Has attachment', { exact: true }),
    ).toBeChecked();
    await expect(sheet.getByLabel('On or after', { exact: true })).toHaveValue(
        '2026-10-01',
    );
    await sheet
        .getByLabel('Subject', { exact: true })
        .fill('Acceptance scroll fixture');
    await sheet.getByLabel('Has attachment', { exact: true }).uncheck();
    await sheet.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.locator('.toolbar-right')).toContainText('1–30 of 45');
    await trigger.click();
    await sheet
        .getByRole('button', { name: 'Clear fields', exact: true })
        .click();
    await expect(sheet.getByLabel('From', { exact: true })).toHaveValue('');
    await expect(sheet.getByLabel('On or after', { exact: true })).toHaveValue(
        '',
    );
    await sheet.getByLabel('Subject', { exact: true }).press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator('.toolbar-right')).toContainText('1–30 of 45');
});

test('workflows: search validates combined limits and reflows with enlarged text', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page
        .getByRole('textbox', { name: 'Search mail', exact: true })
        .click();
    await expect(
        page.getByRole('dialog', { name: 'Search mail', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Search options', exact: true })
        .click();
    await expect(
        page.getByRole('dialog', { name: 'Search mail', exact: true }),
    ).toHaveCount(0);
    const sheet = page.getByRole('dialog', {
        name: 'Search options',
        exact: true,
    });
    const before = page.url();
    await sheet.getByLabel('On or after', { exact: true }).fill('2026-11-01');
    await sheet.getByLabel('Before', { exact: true }).fill('2026-10-01');
    await sheet.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('end date later');
    await expect(sheet.getByRole('alert')).toBeFocused();
    expect(page.url()).toBe(before);
    await sheet
        .getByRole('button', { name: 'Clear fields', exact: true })
        .click();
    await sheet.getByLabel('From', { exact: true }).fill('a'.repeat(100));
    await sheet.getByLabel('Subject', { exact: true }).fill('b'.repeat(100));
    await sheet.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('200 characters');
    await expect(sheet.getByLabel('Subject', { exact: true })).toHaveValue(
        'b'.repeat(100),
    );
    expect(page.url()).toBe(before);
    await sheet
        .getByRole('button', { name: 'Clear fields', exact: true })
        .click();
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(sheet).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual(
            [],
        );
        await page.screenshot({
            path: info.outputPath(`advanced-search-${width}.png`),
            fullPage: true,
        });
    }
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await sheet
        .getByRole('button', { name: 'Search', exact: true })
        .scrollIntoViewIfNeeded();
    await expect(
        sheet.getByRole('button', { name: 'Search', exact: true }),
    ).toBeInViewport();
    await page.screenshot({
        path: info.outputPath('advanced-search-320-text200.png'),
        fullPage: true,
    });
});

test('themes: gallery persists palettes independently of display mode and rolls back failed saves', async ({
    page,
}) => {
    await page.goto('/settings/themes');
    await expect(
        page.getByRole('heading', { name: 'Themes', exact: true }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Ocean', exact: true }).check();
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Theme saved to your account.' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ocean');
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Dark', exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ocean');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(
        page.getByRole('radio', { name: 'Ocean', exact: true }),
    ).toBeChecked();
    await page.route('**/preferences', async (route) => {
        if (route.request().method() === 'PUT')
            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Fictional save outage' }),
            });
        else await route.continue();
    });
    // This selection is expected to roll back, so do not assert check()'s final checked state.
    await page.getByRole('radio', { name: 'Forest', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
        'previous theme is restored',
    );
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'ocean');
    await expect(
        page.getByRole('radio', { name: 'Ocean', exact: true }),
    ).toBeChecked();
    await page.unroute('**/preferences');
    await page.getByRole('radio', { name: 'Ocean', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(
        page.getByRole('radio', { name: 'Forest', exact: true }),
    ).toBeChecked();
    await expect(
        page.getByRole('radio', { name: 'Forest', exact: true }),
    ).toBeFocused();
    await expect(
        page
            .getByRole('status')
            .filter({ hasText: 'Theme saved to your account.' }),
    ).toBeVisible();
});

test('themes: all palettes have accessible light and dark galleries with mobile reflow', async ({
    page,
}, testInfo) => {
    test.setTimeout(90_000);
    await page.goto('/settings/themes');
    for (const mode of ['Light', 'Dark']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(
            page.getByRole('button', { name: mode, exact: true }),
        ).toBeEnabled();
        for (const name of [
            'WebMail',
            'Ocean',
            'Forest',
            'Terracotta',
            'Plum',
            'Graphite',
        ]) {
            await page.getByRole('radio', { name, exact: true }).check();
            await expect(page.locator('.palette-fieldset')).toHaveAttribute(
                'aria-busy',
                'false',
            );
            const audit = await new AxeBuilder({ page }).analyze();
            expect(audit.violations, `${mode} / ${name}`).toEqual([]);
        }
    }
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Light', exact: true }),
    ).toBeEnabled();
    await page.getByRole('radio', { name: 'WebMail', exact: true }).check();
    await expect(page.locator('.palette-fieldset')).toHaveAttribute(
        'aria-busy',
        'false',
    );
    mkdirSync('docs/ui-evidence/themes', { recursive: true });
    for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.screenshot({
            path: `docs/ui-evidence/themes/${testInfo.project.name}-gallery-${width}.png`,
            fullPage: true,
        });
    }
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: `docs/ui-evidence/themes/${testInfo.project.name}-gallery-320-text200.png`,
        fullPage: true,
    });
});

test('help: setup and deployment guides work signed out and reflow on small screens', async ({
    page,
}, testInfo) => {
    const savedCookies = await page.context().cookies();
    try {
        await page.context().clearCookies();
        await page.goto('/login');
        await page
            .getByRole('link', { name: 'Setup guide', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Set up WebMail', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('link', { name: 'Sign in', exact: true }),
        ).toBeVisible();
        const audit = await new AxeBuilder({ page }).analyze();
        expect(audit.violations).toEqual([]);
        mkdirSync('docs/ui-evidence/themes', { recursive: true });
        await page.screenshot({
            path: `docs/ui-evidence/themes/${testInfo.project.name}-setup-1440.png`,
            fullPage: false,
        });
        await page.setViewportSize({ width: 320, height: 740 });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.locator('.guide-mobile-contents summary').click();
        await page
            .getByRole('navigation', { name: 'Guide sections' })
            .getByRole('link', { name: 'Personalize your mail', exact: true })
            .click();
        await expect(page).toHaveURL(/#personalize-your-mail$/);
        await page.screenshot({
            path: `docs/ui-evidence/themes/${testInfo.project.name}-setup-320.png`,
        });
        await page.addStyleTag({
            content: 'html { font-size: 200% !important; }',
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
        await page.goto('/help/deployment');
        await expect(
            page.getByRole('heading', {
                name: 'Deployment and recovery',
                exact: true,
            }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
            ),
        ).toBe(true);
    } finally {
        await page.context().clearCookies();
        await page.context().addCookies(savedCookies);
    }
});
