import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useState, type HTMLAttributes } from 'react';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';
import { api } from '@/lib/mail';

export default function AppearanceToggleTab({
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    const { appearance, updateAppearance } = useAppearance();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const choose = async (value: Appearance) => {
        const before = appearance;
        setPending(true);
        setError('');
        updateAppearance(value);
        try {
            await api('/preferences', 'PUT', { theme: value });
        } catch (cause) {
            updateAppearance(before);
            setError((cause as Error).message);
        } finally {
            setPending(false);
        }
    };

    const tabs: { value: Appearance; icon: LucideIcon; label: string }[] = [
        { value: 'light', icon: Sun, label: 'Light' },
        { value: 'dark', icon: Moon, label: 'Dark' },
        { value: 'system', icon: Monitor, label: 'System' },
    ];

    return (
        <div className={cn('appearance-setting', className)} {...props}>
            <div
                className="appearance-choices"
                role="group"
                aria-label="Color theme"
                aria-busy={pending}
            >
                {tabs.map(({ value, icon: Icon, label }) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => void choose(value)}
                        disabled={pending}
                        aria-pressed={appearance === value}
                        className={appearance === value ? 'chosen' : ''}
                    >
                        <Icon className="-ml-1 h-4 w-4" />
                        <span className="ml-1.5 text-sm">{label}</span>
                    </button>
                ))}
            </div>
            {error && (
                <p role="alert" className="error">
                    {error}
                </p>
            )}
            <p className="setting-description">
                Saved to your account. System follows your device’s color theme.
            </p>
        </div>
    );
}
