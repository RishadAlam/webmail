import { Link } from '@inertiajs/react';
import { Brand } from '@/components/webmail/ui';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    return (
        <main className="login-page">
            <header className="login-brand">
                <Link href="/login" aria-label="WebMail by Hookstack home">
                    <Brand />
                </Link>
            </header>
            <section className="login-form auth-form">
                <h1>{title}</h1>
                <p>{description}</p>
                {children}
            </section>
            <footer>WebMail, created by Hookstack.</footer>
        </main>
    );
}
