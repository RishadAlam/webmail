import { Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/postroom/ui';
import type { BreadcrumbItem } from '@/types';
import { useMailNavigation } from '@/lib/mail-navigation';
export default function AppLayout({
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    const navigation = useMailNavigation();
    return (
        <div className="account-settings">
            <header className="admin-header">
                <Brand />
                <Link
                    href={navigation.location?.url ?? '/mail'}
                    className="secondary"
                >
                    <ArrowLeft size={17} />
                    Back to mail
                </Link>
            </header>
            <main>{children}</main>
        </div>
    );
}
