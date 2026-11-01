import { Link } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn, toUrl } from '@/lib/utils';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import type { NavItem } from '@/types';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Mail',
        href: '/settings/mail',
        icon: null,
    },
    {
        title: 'Labels & filters',
        href: '/settings/organization',
        icon: null,
    },
    {
        title: 'Profile',
        href: edit(),
        icon: null,
    },
    {
        title: 'Security',
        href: editSecurity(),
        icon: null,
    },
    {
        title: 'Themes',
        href: '/settings/themes',
        icon: null,
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="settings-layout py-6">
            <Heading
                title="Settings"
                description="Manage your mail, profile, and account settings"
            />

            <div className="flex min-w-0 flex-col lg:flex-row lg:gap-12">
                <aside className="w-full shrink-0 lg:w-48">
                    <nav className="settings-navigation" aria-label="Settings">
                        {sidebarNavItems.map((item, index) => (
                            <Button
                                key={`${toUrl(item.href)}-${index}`}
                                variant="ghost"
                                asChild
                                className={cn('justify-start', {
                                    current: isCurrentOrParentUrl(item.href),
                                })}
                            >
                                <Link
                                    href={item.href}
                                    aria-current={
                                        isCurrentOrParentUrl(item.href)
                                            ? 'page'
                                            : undefined
                                    }
                                >
                                    {item.icon && (
                                        <item.icon className="h-4 w-4" />
                                    )}
                                    {item.title}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                    <a
                        className="setup-guide-link"
                        href="/help/setup"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Setup guide{' '}
                        <span className="sr-only">(opens in a new tab)</span>
                    </a>
                </aside>

                <Separator className="my-6 lg:hidden" />

                <div className="min-w-0 flex-1">
                    <section className="settings-content space-y-12">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
