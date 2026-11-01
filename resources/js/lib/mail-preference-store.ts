import { defaultPreferences, type Preferences } from './mail';

export type PreferenceSnapshot = Partial<Preferences> & { _revision?: number };
type PendingPreference = { token: symbol; patch: Partial<Preferences> };

export class MailPreferenceStore {
    private committed: Preferences;
    private current: Preferences;
    private revision: number;
    private pending: PendingPreference[] = [];
    private tail: Promise<void> = Promise.resolve();
    private active = true;
    private listeners = new Set<() => void>();

    constructor(
        initial: PreferenceSnapshot,
        private persist: (
            patch: Partial<Preferences>,
        ) => Promise<PreferenceSnapshot>,
    ) {
        this.committed = { ...defaultPreferences, ...initial };
        this.current = this.committed;
        this.revision = initial._revision ?? 0;
    }

    getSnapshot = (): Preferences => this.current;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    activate(): void {
        this.active = true;
    }

    dispose(): void {
        this.active = false;
    }

    receive(snapshot: PreferenceSnapshot): void {
        if (this.active && this.accept(snapshot)) this.publish();
    }

    update(patch: Partial<Preferences>): Promise<void> {
        if (!this.active)
            return Promise.reject(new Error('The active account changed.'));
        const item = { token: Symbol(), patch };
        this.pending.push(item);
        this.publish();
        const write = this.tail.then(async () => {
            try {
                if (!this.active)
                    throw new Error('The active account changed.');
                const saved = await this.persist(patch);
                if (this.active) this.accept(saved);
            } finally {
                this.pending = this.pending.filter(
                    (entry) => entry.token !== item.token,
                );
                this.publish();
            }
        });
        this.tail = write.catch(() => {});
        return write;
    }

    private accept(snapshot: PreferenceSnapshot): boolean {
        const revision = snapshot._revision ?? 0;
        if (revision <= this.revision) return false;
        this.revision = revision;
        this.committed = { ...defaultPreferences, ...snapshot };
        return true;
    }

    private publish(): void {
        if (!this.active) return;
        this.current = this.pending.reduce(
            (value, item) => ({ ...value, ...item.patch }),
            this.committed,
        );
        this.listeners.forEach((listener) => listener());
    }
}
