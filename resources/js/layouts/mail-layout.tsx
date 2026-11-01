import { ComposeProvider } from '@/components/postroom/compose';
import { useEffect, type ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { MailNavigationProvider } from '@/lib/mail-navigation';
import { updateAppearance, type Appearance } from '@/hooks/use-appearance';
export default function MailLayout({ children }: { children: ReactNode }) {
    const user = usePage().props.auth.user;
    const theme =
        (user?.preferences as { theme?: Appearance } | undefined)?.theme ??
        'light';
    useEffect(() => updateAppearance(theme), [user?.id, theme]);
    return (
        <MailNavigationProvider key={user?.id}>
            <ComposeProvider>{children}</ComposeProvider>
        </MailNavigationProvider>
    );
}
