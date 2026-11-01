import { Link } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/postroom/ui';
import type { BreadcrumbItem } from '@/types';
export default function AppLayout({
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    return (
        <div className="account-settings">
            <header className="admin-header">
                <Brand />
                <Link href="/mail" className="secondary">
                    <ArrowLeft size={17} />
                    Back to mail
                </Link>
            </header>
            <main>{children}</main>
        </div>
    );
}
