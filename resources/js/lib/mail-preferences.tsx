import { usePage } from '@inertiajs/react';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { updateAppearance } from '@/hooks/use-appearance';
import { api, type Preferences } from '@/lib/mail';
import {
    MailPreferenceStore,
    type PreferenceSnapshot,
} from '@/lib/mail-preference-store';

type PreferenceContext = {
    preferences: Preferences;
    updatePreferences: (patch: Partial<Preferences>) => Promise<void>;
};
const MailPreferencesContext = createContext<PreferenceContext | null>(null);

export function MailPreferencesProvider({ children }: { children: ReactNode }) {
    const savedPreferences = usePage().props.auth.user?.preferences as
        | PreferenceSnapshot
        | undefined;
    const [store] = useState(
        () =>
            new MailPreferenceStore(savedPreferences ?? {}, (patch) =>
                api<PreferenceSnapshot>('/preferences', 'PUT', patch),
            ),
    );
    const preferences = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );

    useEffect(() => {
        store.activate();
        return () => store.dispose();
    }, [store]);

    useEffect(() => {
        // Revisions reject navigation responses created before a completed
        // save. Queued patches stay visible over any newer server snapshot.
        store.receive(savedPreferences ?? {});
    }, [savedPreferences, store]);

    useEffect(() => updateAppearance(preferences.theme), [preferences.theme]);
    useEffect(() => {
        document.documentElement.dataset.palette = preferences.palette;
        return () => {
            document.documentElement.dataset.palette = 'default';
        };
    }, [preferences.palette]);

    const updatePreferences = useCallback(
        (patch: Partial<Preferences>) => store.update(patch),
        [store],
    );

    return (
        <MailPreferencesContext.Provider
            value={{ preferences, updatePreferences }}
        >
            {children}
        </MailPreferencesContext.Provider>
    );
}

export function useMailPreferences(): PreferenceContext {
    const context = useContext(MailPreferencesContext);
    if (!context)
        throw new Error('Mail preferences require MailPreferencesProvider.');
    return context;
}
