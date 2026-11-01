import { ComposeProvider } from '@/components/postroom/compose';
import type { ReactNode } from 'react';
import { usePage } from '@inertiajs/react';
import { MailNavigationProvider } from '@/lib/mail-navigation';
export default function MailLayout({ children }: { children: ReactNode }) {
    const user = usePage().props.auth.user;
    return (
        <MailNavigationProvider key={user?.id}>
            <ComposeProvider>{children}</ComposeProvider>
        </MailNavigationProvider>
    );
}
