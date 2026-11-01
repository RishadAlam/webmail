import { Form, Head, Link, setLayoutProps } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import { store } from '@/routes/two-factor/login';

export default function TwoFactorChallenge() {
    const [showRecoveryInput, setShowRecoveryInput] = useState<boolean>(false);
    const [code, setCode] = useState<string>('');

    const authConfigContent = useMemo<{
        title: string;
        description: string;
        toggleText: string;
    }>(() => {
        if (showRecoveryInput) {
            return {
                title: 'Recovery code',
                description:
                    'Enter one of the recovery codes you saved when setting up two-factor authentication. Each code works once.',
                toggleText: 'login using an authentication code',
            };
        }

        return {
            title: 'Authentication code',
            description:
                'Enter the six-digit code from your authenticator app to finish signing in.',
            toggleText: 'login using a recovery code',
        };
    }, [showRecoveryInput]);

    setLayoutProps({
        title: authConfigContent.title,
        description: authConfigContent.description,
    });

    const toggleRecoveryMode = (clearErrors: () => void): void => {
        setShowRecoveryInput(!showRecoveryInput);
        clearErrors();
        setCode('');
    };

    return (
        <>
            <Head title="Two-factor authentication" />

            <div className="space-y-6">
                <Form
                    {...store.form()}
                    className="space-y-4"
                    resetOnError
                    resetOnSuccess={!showRecoveryInput}
                >
                    {({ errors, processing, clearErrors }) => (
                        <>
                            {showRecoveryInput ? (
                                <>
                                    <label htmlFor="recovery-code">
                                        Recovery code
                                    </label>
                                    <Input
                                        id="recovery-code"
                                        name="recovery_code"
                                        type="text"
                                        placeholder="Enter recovery code"
                                        autoFocus={showRecoveryInput}
                                        autoComplete="off"
                                        spellCheck={false}
                                        aria-invalid={!!errors.recovery_code}
                                        aria-describedby={
                                            errors.recovery_code
                                                ? 'recovery-error'
                                                : undefined
                                        }
                                        required
                                    />
                                    <InputError
                                        id="recovery-error"
                                        message={errors.recovery_code}
                                    />
                                </>
                            ) : (
                                <div className="auth-code-field">
                                    <label htmlFor="authentication-code">
                                        Six-digit code
                                    </label>
                                    <input
                                        id="authentication-code"
                                        name="code"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        className="authentication-code"
                                        minLength={OTP_MAX_LENGTH}
                                        maxLength={OTP_MAX_LENGTH}
                                        value={code}
                                        onChange={(event) =>
                                            setCode(
                                                event.target.value.replace(
                                                    /\D/g,
                                                    '',
                                                ),
                                            )
                                        }
                                        disabled={processing}
                                        pattern="[0-9]{6}"
                                        aria-invalid={!!errors.code}
                                        aria-describedby={
                                            errors.code
                                                ? 'code-error'
                                                : undefined
                                        }
                                        required
                                        autoFocus
                                    />
                                    <InputError
                                        id="code-error"
                                        message={errors.code}
                                    />
                                </div>
                            )}

                            <Button
                                type="submit"
                                className="auth-submit w-full"
                                disabled={processing}
                            >
                                Continue
                            </Button>

                            <div className="text-center text-sm text-muted-foreground">
                                <span>or you can </span>
                                <button
                                    type="button"
                                    className="auth-switch"
                                    onClick={() =>
                                        toggleRecoveryMode(clearErrors)
                                    }
                                >
                                    {authConfigContent.toggleText}
                                </button>
                            </div>
                            <Link
                                href="/login"
                                className="auth-switch auth-back"
                            >
                                Use another account
                            </Link>
                        </>
                    )}
                </Form>
            </div>
        </>
    );
}
