import { createInertiaApp } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import SettingsLayout from '@/layouts/settings/layout';
import MailLayout from '@/layouts/mail-layout';
import { PRODUCT_TITLE } from '@/lib/brand';

const appName = PRODUCT_TITLE;

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name === 'auth/login':
            case name === 'welcome':
                return null;
            case name === 'mail' || name === 'admin':
                return MailLayout;
            case name === 'auth/confirm-password':
                return [MailLayout, AuthLayout];
            case name.startsWith('auth'):
                return AuthLayout;
            case name.startsWith('settings/'):
                return [MailLayout, AppLayout, SettingsLayout];
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();

if ('serviceWorker' in navigator)
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
// A restored bfcache document stays covered until its session identity is revalidated.
// No reload occurs over an in-memory draft when the same session is still valid.
let documentUser: number | null = null;
void import('@inertiajs/react').then(({ router }) => {
    router.on('navigate', (event) => {
        documentUser =
            (event.detail.page.props.auth as { user?: { id: number } })?.user
                ?.id ?? null;
    });
});
window.addEventListener('pagehide', () => {
    documentUser =
        Number(document.documentElement.dataset.userId) || documentUser;
    document.documentElement.classList.add('privacy-locked');
});
window.addEventListener('pageshow', async (event) => {
    if (!event.persisted) {
        document.documentElement.classList.remove('privacy-locked');
        return;
    }
    try {
        const response = await fetch('/session', {
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            credentials: 'same-origin',
        });
        const session = response.ok ? await response.json() : null;
        if (
            !session ||
            (documentUser !== null && session.id !== documentUser)
        ) {
            window.location.replace('/login');
            return;
        }
        document.documentElement.classList.remove('privacy-locked');
    } catch {
        // An unverified restored private page remains covered. Reload explicitly when online.
        document.documentElement.classList.add('privacy-locked');
        const notice = document.createElement('div');
        notice.id = 'privacy-notice';
        notice.textContent =
            'WebMail is locked until your session can be checked. Reconnect, then reload.';
        document.documentElement.append(notice);
    }
});
