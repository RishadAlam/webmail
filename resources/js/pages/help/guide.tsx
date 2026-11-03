import { Head, usePage } from '@inertiajs/react';
import { ArrowLeft, BookOpen, ChevronDown } from 'lucide-react';
import { Brand } from '@/components/webmail/ui';

type GuideProps = {
    title: string;
    html: string;
    contents: { id: string; title: string }[];
    guide: string;
};

export default function Guide({ title, html, contents, guide }: GuideProps) {
    const signedIn = Boolean(usePage().props.auth.user);
    const links = contents.map((item) => (
        <a key={item.id} href={`#${item.id}`}>
            {item.title}
        </a>
    ));
    return (
        <div className="guide-page">
            <Head title={title} />
            <a href="#guide-content" className="skip-link">
                Skip to guide
            </a>
            <header className="guide-header">
                <Brand />
                <a href={signedIn ? '/mail' : '/login'} className="secondary">
                    <ArrowLeft size={17} />
                    {signedIn ? 'Back to mail' : 'Sign in'}
                </a>
            </header>
            <div className="guide-layout">
                <aside className="guide-sidebar">
                    <a href="/help/setup" className="guide-home">
                        <BookOpen size={18} /> WebMail guide
                    </a>
                    <nav aria-label="On this page">
                        <p>On this page</p>
                        {links}
                    </nav>
                    <a href="/help/deployment" className="guide-runbook">
                        Deployment and recovery
                    </a>
                </aside>
                <main id="guide-content" tabIndex={-1}>
                    <header className="guide-title">
                        <h1>{title}</h1>
                        <p>
                            {guide === 'setup'
                                ? 'From your first sign-in to connecting your own domain.'
                                : 'A reference for the person managing your WebMail installation.'}
                        </p>
                    </header>
                    <details className="guide-mobile-contents">
                        <summary>
                            On this page <ChevronDown size={18} />
                        </summary>
                        <nav aria-label="Guide sections">{links}</nav>
                    </details>
                    <article
                        className="guide-prose"
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                    <footer className="guide-footer">
                        <a href="#guide-content">Back to top</a>
                        <span>WebMail by Hookstack</span>
                    </footer>
                </main>
            </div>
        </div>
    );
}
