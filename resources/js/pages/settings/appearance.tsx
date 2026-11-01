import { Head } from '@inertiajs/react';
import { Check, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import AppearanceTabs from '@/components/appearance-tabs';
import type { Preferences } from '@/lib/mail';
import { useMailPreferences } from '@/lib/mail-preferences';
import { mailThemes } from '@/lib/mail-themes';

export default function Appearance() {
    const { preferences, updatePreferences } = useMailPreferences();
    const [pending, setPending] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');

    const choose = async (palette: Preferences['palette']) => {
        if (pending) return;
        setPending(true);
        setError('');
        setStatus('Saving theme…');
        try {
            await updatePreferences({ palette });
            setStatus('Theme saved to your account.');
        } catch {
            setStatus('');
            setError(
                'Your theme could not be saved. Your previous theme is restored. Check your connection and try again.',
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <>
            <Head title="Themes" />
            <div className="themes-page">
                <header>
                    <h1>Themes</h1>
                    <p>
                        Make your inbox feel like your space. Changes save
                        automatically.
                    </p>
                </header>
                <section
                    aria-labelledby="display-mode-title"
                    className="theme-mode-setting"
                >
                    <h2 id="display-mode-title">Display mode</h2>
                    <AppearanceTabs />
                </section>
                <fieldset className="palette-fieldset" aria-busy={pending}>
                    <legend>Choose a color theme</legend>
                    <p className="setting-description">
                        Each theme adapts to your display mode.
                    </p>
                    <div className="palette-gallery">
                        {mailThemes.map(({ value, name, description }) => (
                            <label
                                className={`palette-choice ${preferences.palette === value ? 'chosen' : ''}`}
                                key={value}
                            >
                                <input
                                    type="radio"
                                    name="palette"
                                    value={value}
                                    checked={preferences.palette === value}
                                    onChange={() => void choose(value)}
                                    aria-label={name}
                                />
                                <span
                                    className="palette-preview"
                                    data-palette={value}
                                    aria-hidden="true"
                                >
                                    <span className="palette-preview-header">
                                        <Menu />
                                        <AppLogoIcon />
                                        <span>
                                            <Search />
                                        </span>
                                    </span>
                                    <span className="palette-preview-workspace">
                                        <span className="palette-preview-nav">
                                            <b />
                                            <i />
                                            <i />
                                            <i />
                                        </span>
                                        <span className="palette-preview-list">
                                            <i />
                                            <i />
                                            <i />
                                            <i />
                                        </span>
                                    </span>
                                </span>
                                <span className="palette-choice-name">
                                    {name}
                                    {preferences.palette === value && (
                                        <Check size={17} aria-hidden="true" />
                                    )}
                                </span>
                                <span className="palette-choice-description">
                                    {description}
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="theme-feedback">
                    <p role="status">{status}</p>
                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}
                </div>
                <p className="setting-description">
                    Themes change WebMail’s interface. Email content keeps its
                    original formatting.
                </p>
            </div>
        </>
    );
}
