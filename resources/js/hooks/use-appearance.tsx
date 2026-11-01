import { useSyncExternalStore } from 'react';

export type ResolvedAppearance = 'light' | 'dark';
export type Appearance = ResolvedAppearance | 'system';

export type UseAppearanceReturn = {
    readonly appearance: Appearance;
    readonly resolvedAppearance: ResolvedAppearance;
    readonly updateAppearance: (mode: Appearance) => void;
};

const listeners = new Set<() => void>();
let currentAppearance: Appearance = 'system';

const prefersDark = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
};

const setCookie = (name: string, value: string, days = 365): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const maxAge = days * 24 * 60 * 60;
    document.cookie = `${name}=${value};path=/;max-age=${maxAge};SameSite=Lax`;
};

const getStoredAppearance = (): Appearance => {
    if (typeof window === 'undefined') {
        return 'system';
    }

    try {
        const saved = localStorage.getItem('appearance');
        return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
        return 'system';
    }
};

const isDarkMode = (appearance: Appearance): boolean => {
    return appearance === 'dark' || (appearance === 'system' && prefersDark());
};

const applyTheme = (appearance: Appearance): void => {
    if (typeof document === 'undefined') {
        return;
    }

    const isDark = isDarkMode(appearance);

    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
};

const subscribe = (callback: () => void) => {
    listeners.add(callback);

    return () => listeners.delete(callback);
};

const notify = (): void => listeners.forEach((listener) => listener());

const mediaQuery = (): MediaQueryList | null => {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.matchMedia('(prefers-color-scheme: dark)');
};

const handleSystemThemeChange = (): void => {
    applyTheme(currentAppearance);
    notify();
};

export function updateAppearance(mode: Appearance): void {
    currentAppearance = mode;
    try {
        localStorage.setItem('appearance', mode);
        setCookie('appearance', mode);
    } catch {
        // Account preferences still persist on the server when browser storage is blocked.
    }
    applyTheme(mode);
    notify();
}

export function initializeTheme(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const serverAppearance = document.documentElement.dataset.appearance;
    updateAppearance(
        serverAppearance === 'light' ||
            serverAppearance === 'dark' ||
            serverAppearance === 'system'
            ? serverAppearance
            : getStoredAppearance(),
    );

    // Set up system theme change listener
    mediaQuery()?.addEventListener('change', handleSystemThemeChange);
}

export function useAppearance(): UseAppearanceReturn {
    const snapshot = useSyncExternalStore(
        subscribe,
        () =>
            `${currentAppearance}:${isDarkMode(currentAppearance) ? 'dark' : 'light'}`,
        () => 'system:light',
    );
    const [appearance, resolvedAppearance] = snapshot.split(':') as [
        Appearance,
        ResolvedAppearance,
    ];

    return { appearance, resolvedAppearance, updateAppearance } as const;
}
