import { useEffect } from 'react';
import { Form, Head } from '@inertiajs/react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/postroom/ui';
export default function Login({
    status,
}: {
    status?: string;
    canResetPassword: boolean;
}) {
    useEffect(() => {
        const canonical = () => {
            if (
                location.pathname.startsWith('/mail') ||
                location.pathname.startsWith('/admin')
            )
                location.replace('/login');
        };
        canonical();
        window.addEventListener('popstate', canonical);
        return () => window.removeEventListener('popstate', canonical);
    }, []);
    return (
        <main className="login-page">
            <Head title="Sign in" />
            <div className="login-brand">
                <Brand />
            </div>
            <section className="login-form">
                <ShieldCheck className="login-symbol" size={30} />
                <h1>Your mail. Your space.</h1>
                <p>Sign in to your private WebMail workspace.</p>
                <Form
                    action="/login"
                    method="post"
                    resetOnSuccess={['password']}
                >
                    {({ processing, errors }) => (
                        <>
                            <label>
                                Email address
                                <input
                                    name="email"
                                    type="email"
                                    autoComplete="username"
                                    required
                                    autoFocus
                                />
                            </label>
                            <label>
                                Password
                                <input
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                />
                            </label>
                            {errors.email && (
                                <p className="form-error" role="alert">
                                    {errors.email}
                                </p>
                            )}
                            <button
                                className="primary"
                                type="submit"
                                disabled={processing}
                            >
                                {processing ? 'Signing in…' : 'Sign in'}
                                <ArrowRight size={18} />
                            </button>
                        </>
                    )}
                </Form>
                {status && <p role="status">{status}</p>}
                <p className="login-help">
                    Accounts are created by your administrator.
                    <br />
                    Contact them if you need access or a password reset.
                </p>
            </section>
            <footer>WebMail, created by Hookstack.</footer>
        </main>
    );
}
