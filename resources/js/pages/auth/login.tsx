import { useEffect, useRef, useState } from 'react';
import { Form, Head } from '@inertiajs/react';
import { ArrowRight, ChevronDown, LoaderCircle } from 'lucide-react';
import { Brand } from '@/components/webmail/ui';
export default function Login({
    status,
}: {
    status?: string;
    canResetPassword: boolean;
}) {
    const [showPassword, setShowPassword] = useState(false);
    const emailInput = useRef<HTMLInputElement>(null);
    const passwordInput = useRef<HTMLInputElement>(null);
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
        <main className="signin-page">
            <Head title="Sign in" />
            <section className="signin-panel" aria-labelledby="signin-heading">
                <header className="signin-header">
                    <Brand />
                    <h1 id="signin-heading">Sign in to your workspace</h1>
                    <p>Your mail, right where you left it.</p>
                </header>
                {status && (
                    <p className="signin-status" role="status">
                        {status}
                    </p>
                )}
                <Form
                    className="signin-form"
                    action="/login"
                    method="post"
                    resetOnSuccess={['password']}
                    onStart={() => setShowPassword(false)}
                    onError={(errors) => {
                        if (errors.email) emailInput.current?.focus();
                        else if (errors.password)
                            passwordInput.current?.focus();
                    }}
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="signin-field">
                                <label htmlFor="signin-email">
                                    Email address
                                </label>
                                <input
                                    ref={emailInput}
                                    id="signin-email"
                                    name="email"
                                    type="email"
                                    inputMode="email"
                                    autoComplete="username"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    placeholder="you@company.com"
                                    aria-invalid={Boolean(errors.email)}
                                    aria-describedby={
                                        errors.email
                                            ? 'signin-email-error'
                                            : undefined
                                    }
                                    required
                                />
                                {errors.email && (
                                    <p
                                        id="signin-email-error"
                                        className="signin-error"
                                        role="alert"
                                    >
                                        {errors.email}
                                    </p>
                                )}
                            </div>
                            <div className="signin-field">
                                <label htmlFor="signin-password">
                                    Password
                                </label>
                                <div className="signin-password">
                                    <input
                                        ref={passwordInput}
                                        id="signin-password"
                                        name="password"
                                        type={
                                            showPassword ? 'text' : 'password'
                                        }
                                        autoComplete="current-password"
                                        aria-invalid={Boolean(errors.password)}
                                        aria-describedby={
                                            errors.password
                                                ? 'signin-password-error'
                                                : undefined
                                        }
                                        required
                                    />
                                    <button
                                        className="signin-reveal"
                                        type="button"
                                        aria-label={
                                            showPassword
                                                ? 'Hide password'
                                                : 'Show password'
                                        }
                                        aria-controls="signin-password"
                                        disabled={processing}
                                        onClick={() =>
                                            setShowPassword(
                                                (visible) => !visible,
                                            )
                                        }
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                {errors.password && (
                                    <p
                                        id="signin-password-error"
                                        className="signin-error"
                                        role="alert"
                                    >
                                        {errors.password}
                                    </p>
                                )}
                                <details className="signin-recovery">
                                    <summary>
                                        Forgot password?
                                        <ChevronDown
                                            size={16}
                                            aria-hidden="true"
                                        />
                                    </summary>
                                    <section
                                        className="signin-recovery-content"
                                        aria-labelledby="signin-recovery-heading"
                                    >
                                        <h2 id="signin-recovery-heading">
                                            Password recovery
                                        </h2>
                                        <p>
                                            Ask your workspace administrator to
                                            reset your WebMail password, then
                                            sign in with the new password they
                                            provide.
                                        </p>
                                        <p>
                                            This workspace doesn’t send reset
                                            links by email.
                                        </p>
                                        <p>
                                            If you’re an administrator or owner,
                                            contact the person who manages your
                                            WebMail installation for recovery
                                            assistance.
                                        </p>
                                    </section>
                                </details>
                            </div>
                            <button
                                className="primary signin-submit"
                                type="submit"
                                disabled={processing}
                                aria-busy={processing}
                            >
                                {processing ? 'Signing in…' : 'Sign in'}
                                {processing ? (
                                    <LoaderCircle
                                        className="signin-spinner"
                                        size={18}
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <ArrowRight size={18} aria-hidden="true" />
                                )}
                            </button>
                        </>
                    )}
                </Form>
                <aside
                    className="signin-help"
                    aria-labelledby="signin-help-heading"
                >
                    <h2 id="signin-help-heading">Need an account?</h2>
                    <p>
                        Accounts are created by your administrator. Contact them
                        for access.
                    </p>
                </aside>
            </section>
            <footer className="signin-footer">
                Your mail. Your space.
                <br />
                <a href="/help/setup" className="setup-guide-link">
                    Setup guide
                </a>
            </footer>
        </main>
    );
}
