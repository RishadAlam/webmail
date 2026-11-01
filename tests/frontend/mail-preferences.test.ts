import assert from 'node:assert/strict';
import test from 'node:test';
import {
    MailPreferenceStore,
    type PreferenceSnapshot,
} from '../../resources/js/lib/mail-preference-store';
import type { Preferences } from '../../resources/js/lib/mail';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((accept, fail) => {
        resolve = accept;
        reject = fail;
    });
    return { promise, resolve, reject };
}

void test('rapid preference writes are serialized while later optimistic choices stay visible', async () => {
    const first = deferred<PreferenceSnapshot>();
    const second = deferred<PreferenceSnapshot>();
    const calls: Partial<Preferences>[] = [];
    const store = new MailPreferenceStore({}, (patch) => {
        calls.push(patch);
        return calls.length === 1 ? first.promise : second.promise;
    });

    const saveDensity = store.update({ density: 'compact' });
    const savePane = store.update({ pane: 'bottom' });
    assert.equal(store.getSnapshot().density, 'compact');
    assert.equal(store.getSnapshot().pane, 'bottom');
    await Promise.resolve();
    assert.deepEqual(calls, [{ density: 'compact' }]);
    first.resolve({ _revision: 1, density: 'compact', pane: 'none' });
    await saveDensity;
    await Promise.resolve();
    assert.deepEqual(calls, [{ density: 'compact' }, { pane: 'bottom' }]);
    assert.equal(store.getSnapshot().pane, 'bottom');
    second.resolve({ _revision: 2, density: 'compact', pane: 'bottom' });
    await savePane;
    assert.equal(store.getSnapshot().density, 'compact');
    assert.equal(store.getSnapshot().pane, 'bottom');
});

void test('a failed write rolls back only its own patch and does not block the next save', async () => {
    const first = deferred<PreferenceSnapshot>();
    const second = deferred<PreferenceSnapshot>();
    let writes = 0;
    const store = new MailPreferenceStore({ theme: 'light' }, () =>
        ++writes === 1 ? first.promise : second.promise,
    );
    const saveTheme = store.update({ theme: 'dark' });
    const rejected = assert.rejects(saveTheme, /Offline/);
    const saveDensity = store.update({ density: 'compact' });
    await Promise.resolve();
    first.reject(new Error('Offline'));
    await rejected;
    assert.equal(store.getSnapshot().theme, 'light');
    assert.equal(store.getSnapshot().density, 'compact');
    second.resolve({ _revision: 1, theme: 'light', density: 'compact' });
    await saveDensity;
    assert.equal(writes, 2);
    assert.equal(store.getSnapshot().density, 'compact');
});

void test('a navigation snapshot generated before a completed write cannot roll that write back', async () => {
    const store = new MailPreferenceStore(
        { _revision: 3, theme: 'light' },
        async () => ({ _revision: 4, theme: 'dark' }),
    );
    await store.update({ theme: 'dark' });
    store.receive({ _revision: 3, theme: 'light' });
    assert.equal(store.getSnapshot().theme, 'dark');
    store.receive({ _revision: 5, theme: 'system' });
    assert.equal(store.getSnapshot().theme, 'system');
});

void test('newer server state survives a delayed write response while queued patches remain optimistic', async () => {
    const response = deferred<PreferenceSnapshot>();
    const store = new MailPreferenceStore(
        { _revision: 1, theme: 'light', density: 'comfortable' },
        () => response.promise,
    );
    const save = store.update({ density: 'compact' });
    await Promise.resolve();
    store.receive({ _revision: 3, theme: 'dark', density: 'comfortable' });
    assert.equal(store.getSnapshot().theme, 'dark');
    assert.equal(store.getSnapshot().density, 'compact');
    response.resolve({ _revision: 2, theme: 'light', density: 'compact' });
    await save;
    assert.equal(store.getSnapshot().theme, 'dark');
    assert.equal(store.getSnapshot().density, 'comfortable');
});

void test('account disposal prevents queued writes from using a later account session', async () => {
    const response = deferred<PreferenceSnapshot>();
    let writes = 0;
    const store = new MailPreferenceStore({}, () => {
        writes++;
        return response.promise;
    });
    const first = store.update({ theme: 'dark' });
    const second = store.update({ pane: 'bottom' });
    const rejected = assert.rejects(second, /active account changed/);
    await Promise.resolve();
    store.dispose();
    response.resolve({ _revision: 1, theme: 'dark' });
    await first;
    await rejected;
    assert.equal(writes, 1);
    await assert.rejects(
        store.update({ density: 'compact' }),
        /active account changed/,
    );
});
