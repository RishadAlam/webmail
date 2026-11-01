import * as Dialog from '@radix-ui/react-dialog';
import { router, usePage } from '@inertiajs/react';
import {
    createContext,
    lazy,
    Suspense,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import {
    ArrowLeft,
    ArrowUpRight,
    Check,
    Maximize2,
    Minimize2,
    Minus,
    Send,
    Trash2,
    X,
} from 'lucide-react';
import { api, type Draft, type MailProps } from '@/lib/mail';
import { IconButton, Sheet } from './ui';
const Editor = lazy(() => import('./editor'));
type Value = {
    open: (box: number, reply?: number, mode?: string) => Promise<void>;
    resume: (draft: Draft) => void;
    draft: Draft | null;
    close: () => Promise<boolean>;
};
const Context = createContext<Value | null>(null);
export const useCompose = () => {
    const value = useContext(Context);
    if (!value) throw new Error('Compose context missing');
    return value;
};
function RecipientInput({
    label,
    values,
    onChange,
    disabled,
    onPending,
    pending,
}: {
    label: string;
    values: string[];
    onChange: (value: string[]) => void;
    disabled: boolean;
    onPending: (value: string) => void;
    pending: string;
}) {
    const [error, setError] = useState('');
    const commit = () => {
        const addresses = pending.split(/[,;\s]+/).filter(Boolean);
        if (!addresses.length) return;
        if (addresses.some((a) => !/^\S+@[^\s@]+\.[^\s@]+$/.test(a))) {
            setError('Enter a complete email address.');
            return;
        }
        onChange([...new Set([...values, ...addresses])]);
        onPending('');
        setError('');
    };
    return (
        <div className="recipient-line">
            <label htmlFor={`recipient-${label}`}>{label}</label>
            <div className="recipient-field">
                {values.map((address) => (
                    <span className="recipient-chip" key={address}>
                        {address}
                        <button
                            type="button"
                            aria-label={`Remove ${address} from ${label}`}
                            onClick={() =>
                                onChange(values.filter((v) => v !== address))
                            }
                            disabled={disabled}
                        >
                            <X size={13} />
                        </button>
                    </span>
                ))}
                <input
                    id={`recipient-${label}`}
                    value={pending}
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    disabled={disabled}
                    onChange={(e) => {
                        onPending(e.target.value);
                        setError('');
                    }}
                    onBlur={commit}
                    aria-invalid={!!error}
                    aria-describedby={error ? `error-${label}` : undefined}
                    onKeyDown={(e) => {
                        if (
                            ['Enter', ',', ';', 'Tab'].includes(e.key) &&
                            pending
                        ) {
                            if (e.key !== 'Tab') e.preventDefault();
                            commit();
                        }
                    }}
                />
                {error && (
                    <span className="field-error" id={`error-${label}`}>
                        {error}
                    </span>
                )}
            </div>
        </div>
    );
}
export function ComposeProvider({ children }: { children: ReactNode }) {
    const page = usePage(),
        props = page.props as unknown as MailProps;
    const userId = (page.props.auth as { user: { id: number } | null })?.user
        ?.id;
    const [draft, setDraft] = useState<Draft | null>(null),
        [senderIdentities, setSenderIdentities] = useState<string[]>([]),
        [recipientInputs, setRecipientInputs] = useState<
            Record<string, string>
        >({}),
        [status, setStatus] = useState('Saved to WebMail'),
        [error, setError] = useState(''),
        [minimized, setMinimized] = useState(false),
        [expanded, setExpanded] = useState(false),
        [cc, setCc] = useState(false),
        [bcc, setBcc] = useState(false),
        [confirmDiscard, setConfirmDiscard] = useState(false),
        [sending, setSending] = useState(false),
        [offline, setOffline] = useState(!navigator.onLine),
        [mobile, setMobile] = useState(
            matchMedia('(max-width: 767px)').matches,
        );
    const current = useRef(draft),
        saved = useRef(''),
        saving = useRef<Promise<boolean> | null>(null),
        timer = useRef<ReturnType<typeof setTimeout> | null>(null),
        busy = useRef(false),
        revision = useRef(0),
        allowNavigation = useRef(false),
        pendingRecipients = useRef<Record<string, string>>({}),
        mobileReturn = useRef<string | null>(null),
        loadingDraft = useRef<string | null>(null),
        returnFocus = useRef<HTMLElement | null>(null);
    const listRoute = () => {
        const url = new URL(location.href);
        url.searchParams.delete('compose');
        return url.pathname + url.search;
    };
    const fields = (d: Draft) =>
        JSON.stringify([d.from_email, d.to, d.cc, d.bcc, d.subject, d.body]);
    const dirty = () =>
        !!current.current &&
        (fields(current.current) !== saved.current ||
            Object.values(pendingRecipients.current).some(Boolean));
    const save = useCallback(async (): Promise<boolean> => {
        while (saving.current) await saving.current;
        if (Object.values(pendingRecipients.current).some(Boolean)) {
            if (pendingRecipients.current.Cc) setCc(true);
            if (pendingRecipients.current.Bcc) setBcc(true);
            setError(
                'Complete or remove the unfinished recipient address before leaving or sending.',
            );
            return false;
        }
        const data = current.current;
        if (!data) return true;
        if (!dirty()) {
            if (['draft', 'held'].includes(data.status)) {
                setStatus('Saved to WebMail');
                setError('');
            }
            return true;
        }
        if (!['draft', 'held'].includes(data.status)) return false;
        if (timer.current) clearTimeout(timer.current);
        setStatus('Saving…');
        setError('');
        const captured = revision.current;
        const promise = (async () => {
            try {
                const result = await api<Draft>(
                    `/drafts/${data.id}`,
                    'PUT',
                    data,
                );
                saved.current = fields(data);
                if (current.current?.id === data.id) {
                    const next =
                        captured === revision.current
                            ? result
                            : { ...current.current, version: result.version };
                    current.current = next;
                    setDraft(next);
                    setStatus(!dirty() ? 'Saved to WebMail' : 'Not saved yet');
                }
                return true;
            } catch (e) {
                setStatus('Draft not saved');
                setError((e as Error).message);
                return false;
            } finally {
                saving.current = null;
            }
        })();
        saving.current = promise;
        return promise;
    }, []);
    const flush = async () => {
        do {
            if (!(await save())) return false;
        } while (dirty());
        return true;
    };
    const change = (patch: Partial<Draft>) => {
        if (!current.current) return;
        revision.current++;
        const next = { ...current.current, ...patch };
        current.current = next;
        setDraft(next);
        setStatus('Not saved yet');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void save(), 650);
    };
    const updatePending = (field: string, value: string) => {
        pendingRecipients.current[field] = value;
        setRecipientInputs({ ...pendingRecipients.current });
        if (value) setStatus('Not saved yet');
        if (timer.current) clearTimeout(timer.current);
        if (!Object.values(pendingRecipients.current).some(Boolean))
            timer.current = setTimeout(() => void save(), 650);
    };
    const resume = (value: Draft) => {
        if (current.current?.id === value.id) {
            setMinimized(false);
            return;
        }
        if (dirty()) {
            setError(
                'Save or close your current draft before opening another.',
            );
            return;
        }
        returnFocus.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        pendingRecipients.current = {};
        setRecipientInputs({});
        current.current = value;
        saved.current = fields(value);
        revision.current = 0;
        setDraft(value);
        setSenderIdentities(
            props.mailbox?.id === value.mailbox_id
                ? props.identities
                : [value.from_email],
        );
        setStatus('Saved to WebMail');
        setError('');
        setMinimized(false);
        setCc(value.cc.length > 0);
        setBcc(value.bcc.length > 0);
        if (
            matchMedia('(max-width: 767px)').matches &&
            new URLSearchParams(location.search).get('compose') !== value.id
        ) {
            mobileReturn.current = listRoute();
            const url = new URL(location.href);
            url.searchParams.set('compose', value.id);
            router.push({
                url: url.pathname + url.search,
                preserveState: true,
                preserveScroll: true,
            });
        }
    };
    const open = async (box: number, reply?: number, mode?: string) => {
        if (busy.current) return;
        if (current.current) {
            setMinimized(false);
            return;
        }
        busy.current = true;
        try {
            resume(
                await api<Draft>(`/mail/${box}/drafts`, 'POST', {
                    reply_to: reply,
                    mode,
                }),
            );
        } catch (e) {
            setError((e as Error).message);
        } finally {
            busy.current = false;
        }
    };
    const close = async (): Promise<boolean> => {
        if (sending || !(await flush())) return false;
        if (!current.current) return true;
        mobileReturn.current = null;
        return new Promise((resolve) => {
            router.get(
                listRoute(),
                {},
                {
                    replace: true,
                    preserveState: true,
                    preserveScroll: true,
                    only: ['drafts', 'counts', 'mailbox'],
                    onSuccess: () => {
                        current.current = null;
                        setDraft(null);
                        setError('');
                        resolve(true);
                    },
                    onError: () => {
                        setError(
                            'The host could not close this draft. Your saved copy is retained.',
                        );
                        resolve(false);
                    },
                    onCancel: () => resolve(false),
                },
            );
        });
    };
    const send = async () => {
        if (busy.current || !current.current) return;
        busy.current = true;
        setSending(true);
        setError('');
        try {
            if (!(await flush())) return;
            const d = current.current!;
            const result = await api<{
                status: string;
                error: string | null;
                simulated: boolean;
            }>(`/drafts/${d.id}/send`, 'POST', { version: d.version });
            const next = { ...d, status: result.status };
            current.current = next;
            setDraft(next);
            if (result.status === 'accepted')
                setStatus(
                    result.simulated
                        ? 'Accepted by local simulator · no email sent'
                        : 'Accepted by provider · delivery pending',
                );
            else {
                setStatus(
                    result.status === 'uncertain'
                        ? 'Delivery status uncertain'
                        : result.status === 'dispatching'
                          ? 'Sending result pending'
                          : result.status,
                );
                setError(result.error ?? 'Delivery is pending. Do not resend.');
            }
            router.reload({ only: ['drafts', 'counts', 'messages'] });
        } catch (e) {
            setError((e as Error).message);
            setStatus('Draft retained');
        } finally {
            busy.current = false;
            setSending(false);
        }
    };
    useEffect(() => {
        document.documentElement.dataset.userId = String(userId ?? '');
        current.current = null;
        setDraft(null);
        setSenderIdentities([]);
        saved.current = '';
        pendingRecipients.current = {};
        setRecipientInputs({});
        setError('');
    }, [userId]);
    useEffect(() => {
        const unload = (e: BeforeUnloadEvent) => {
            if (dirty()) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        const off = () => {
                setOffline(true);
                if (dirty()) setStatus('Draft not saved');
            },
            on = () => setOffline(false);
        window.addEventListener('beforeunload', unload);
        window.addEventListener('offline', off);
        window.addEventListener('online', on);
        const stop = router.on('before', (e) => {
            if (allowNavigation.current || !dirty()) return;
            const visit = e.detail.visit;
            if (visit.method !== 'get') return;
            e.preventDefault();
            void save().then((ok) => {
                if (ok && !dirty()) {
                    allowNavigation.current = true;
                    router.visit(visit.url, {
                        preserveState: true,
                        preserveScroll: true,
                        onFinish: () => {
                            allowNavigation.current = false;
                        },
                    });
                }
            });
        });
        return () => {
            stop();
            window.removeEventListener('beforeunload', unload);
            window.removeEventListener('offline', off);
            window.removeEventListener('online', on);
        };
    }, [save]);
    useEffect(() => {
        if (!draft) return;
        const viewport = window.visualViewport;
        const update = () => {
            if (viewport && viewport.scale === 1)
                document.documentElement.style.setProperty(
                    '--visual-height',
                    `${viewport.height}px`,
                );
        };
        update();
        viewport?.addEventListener('resize', update);
        return () => viewport?.removeEventListener('resize', update);
    }, [!!draft]);
    useEffect(() => {
        const update = () => {
            const isMobile = matchMedia('(max-width: 767px)').matches;
            setMobile(isMobile);
            if (isMobile) setMinimized(false);
        };
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);
    useEffect(() => {
        const id = new URLSearchParams(location.search).get('compose');
        if (id && !mobileReturn.current) mobileReturn.current = listRoute();
        if (
            id &&
            /^[0-9a-f-]{36}$/.test(id) &&
            id !== current.current?.id &&
            loadingDraft.current !== id
        ) {
            loadingDraft.current = id;
            void api<Draft>('/drafts/' + id)
                .then(resume)
                .catch((e) => setError(e.message))
                .finally(() => {
                    loadingDraft.current = null;
                });
        }
        // Inertia owns this history entry; system Back closes the full-screen composer after saving.
        if (!id && mobileReturn.current && current.current) {
            mobileReturn.current = null;
            void close();
        }
    }, [page.url]);
    const locked =
        sending || (draft && !['draft', 'held'].includes(draft.status));
    return (
        <Context.Provider value={{ open, resume, draft, close }}>
            {children}
            {error && !draft && (
                <div className="toast" role="alert">
                    {error}
                    <button onClick={() => setError('')}>Dismiss</button>
                </div>
            )}
            <Dialog.Root
                open={!!draft}
                modal={mobile}
                onOpenChange={(open) => {
                    if (!open) void close();
                }}
            >
                {draft && (
                    <Dialog.Portal>
                        <Dialog.Content
                            asChild
                            aria-describedby={undefined}
                            onInteractOutside={(e) => e.preventDefault()}
                            onOpenAutoFocus={(e) => {
                                e.preventDefault();
                                requestAnimationFrame(() => {
                                    document
                                        .getElementById('recipient-To')
                                        ?.focus();
                                });
                            }}
                            onCloseAutoFocus={(e) => {
                                e.preventDefault();
                                returnFocus.current?.focus();
                            }}
                        >
                            <section
                                className={`composer ${minimized ? 'minimized' : ''} ${expanded ? 'expanded' : ''}`}
                                aria-label="Compose message"
                            >
                                <header className="compose-heading">
                                    <span className="compose-mobile">
                                        <IconButton
                                            icon={ArrowLeft}
                                            label="Save and close draft"
                                            onClick={() => void close()}
                                        />
                                    </span>
                                    <Dialog.Title asChild>
                                        <h2>
                                            {draft.subject || 'New message'}
                                        </h2>
                                    </Dialog.Title>
                                    <span className="compose-desktop">
                                        <IconButton
                                            icon={Minus}
                                            label={
                                                minimized
                                                    ? 'Restore compose'
                                                    : 'Minimize compose'
                                            }
                                            onClick={() =>
                                                setMinimized(!minimized)
                                            }
                                        />
                                        <IconButton
                                            icon={
                                                expanded ? Minimize2 : Maximize2
                                            }
                                            label={
                                                expanded
                                                    ? 'Dock compose'
                                                    : 'Expand compose'
                                            }
                                            onClick={() => {
                                                setExpanded(!expanded);
                                                setMinimized(false);
                                            }}
                                        />
                                        <IconButton
                                            icon={X}
                                            label="Save and close draft"
                                            onClick={() => void close()}
                                        />
                                    </span>
                                    <button
                                        className="compose-mobile icon-button"
                                        onClick={() => void send()}
                                        disabled={sending || !!locked}
                                        aria-label="Send message"
                                    >
                                        <Send size={21} />
                                    </button>
                                </header>
                                <div
                                    className="compose-body"
                                    hidden={minimized}
                                >
                                    <div className="compose-fields">
                                        <div className="from-line">
                                            <label htmlFor="from-identity">
                                                From
                                            </label>
                                            <select
                                                id="from-identity"
                                                value={draft.from_email}
                                                onChange={(e) =>
                                                    change({
                                                        from_email:
                                                            e.target.value,
                                                    })
                                                }
                                                disabled={!!locked}
                                            >
                                                <option>
                                                    {draft.from_email}
                                                </option>
                                                {senderIdentities
                                                    .filter(
                                                        (v) =>
                                                            v !==
                                                            draft.from_email,
                                                    )
                                                    .map((value) => (
                                                        <option key={value}>
                                                            {value}
                                                        </option>
                                                    ))}
                                            </select>
                                            <button
                                                onClick={() => setCc(!cc)}
                                                aria-expanded={cc}
                                            >
                                                Cc
                                            </button>
                                            <button
                                                onClick={() => setBcc(!bcc)}
                                                aria-expanded={bcc}
                                            >
                                                Bcc
                                            </button>
                                        </div>
                                        <RecipientInput
                                            label="To"
                                            pending={recipientInputs.To ?? ''}
                                            values={draft.to}
                                            onChange={(to) => change({ to })}
                                            disabled={!!locked}
                                            onPending={(value) =>
                                                updatePending('To', value)
                                            }
                                        />
                                        <div hidden={!cc}>
                                            <RecipientInput
                                                label="Cc"
                                                pending={
                                                    recipientInputs.Cc ?? ''
                                                }
                                                values={draft.cc}
                                                onChange={(cc) =>
                                                    change({ cc })
                                                }
                                                disabled={!!locked}
                                                onPending={(value) =>
                                                    updatePending('Cc', value)
                                                }
                                            />
                                        </div>{' '}
                                        <div hidden={!bcc}>
                                            <RecipientInput
                                                label="Bcc"
                                                pending={
                                                    recipientInputs.Bcc ?? ''
                                                }
                                                values={draft.bcc}
                                                onChange={(bcc) =>
                                                    change({ bcc })
                                                }
                                                disabled={!!locked}
                                                onPending={(value) =>
                                                    updatePending('Bcc', value)
                                                }
                                            />
                                        </div>
                                        <label className="subject-line">
                                            <span className="sr-only">
                                                Subject
                                            </span>
                                            <input
                                                placeholder="Subject"
                                                value={draft.subject}
                                                onChange={(e) =>
                                                    change({
                                                        subject: e.target.value,
                                                    })
                                                }
                                                disabled={!!locked}
                                            />
                                        </label>
                                    </div>
                                    <Suspense
                                        fallback={
                                            <p className="editor-loading">
                                                Opening editor…
                                            </p>
                                        }
                                    >
                                        <Editor
                                            key={draft.id}
                                            value={draft.body}
                                            onChange={(body) =>
                                                change({ body })
                                            }
                                            disabled={!!locked}
                                        />
                                    </Suspense>
                                    <div className="draft-feedback">
                                        <span
                                            className={
                                                error ? 'error-text' : ''
                                            }
                                            role="status"
                                        >
                                            {status === 'Saved to WebMail' && (
                                                <Check size={14} />
                                            )}{' '}
                                            {status}
                                        </span>
                                        {error && (
                                            <p role="alert">
                                                {error}{' '}
                                                {!locked && (
                                                    <button
                                                        onClick={() =>
                                                            void save()
                                                        }
                                                    >
                                                        Retry save
                                                    </button>
                                                )}
                                            </p>
                                        )}
                                        {offline && (
                                            <p role="alert">
                                                You’re offline. Unsaved edits
                                                stay in this window only. Keep
                                                it open.
                                            </p>
                                        )}
                                    </div>
                                    <footer className="compose-footer">
                                        {draft.status === 'failed' && (
                                            <button
                                                className="secondary"
                                                onClick={() => {
                                                    void api<Draft>(
                                                        `/mail/${draft.mailbox_id}/drafts`,
                                                        'POST',
                                                        {
                                                            copy_failed:
                                                                draft.id,
                                                        },
                                                    )
                                                        .then(resume)
                                                        .catch((e) =>
                                                            setError(e.message),
                                                        );
                                                }}
                                            >
                                                Edit a new copy
                                            </button>
                                        )}
                                        <button
                                            className="primary send-desktop"
                                            onClick={() => void send()}
                                            disabled={sending || !!locked}
                                        >
                                            <Send size={17} />
                                            {sending ? 'Sending…' : 'Send'}
                                        </button>
                                        <span className="attachment-policy">
                                            Attachments off · 256 KiB maximum
                                        </span>
                                        {!locked && (
                                            <IconButton
                                                icon={Trash2}
                                                label="Discard draft"
                                                onClick={() =>
                                                    setConfirmDiscard(true)
                                                }
                                            />
                                        )}
                                    </footer>
                                </div>
                                {minimized && (
                                    <button
                                        className="restore-compose"
                                        onClick={() => setMinimized(false)}
                                    >
                                        Continue writing{' '}
                                        <ArrowUpRight size={16} />
                                    </button>
                                )}
                            </section>
                        </Dialog.Content>
                    </Dialog.Portal>
                )}
            </Dialog.Root>
            <Sheet
                open={confirmDiscard}
                onClose={() => setConfirmDiscard(false)}
                title="Discard this draft?"
                side="bottom"
            >
                <p>
                    This permanently removes the saved draft and your unsaved
                    edits.
                </p>
                <div className="button-row">
                    <button
                        className="secondary"
                        onClick={() => setConfirmDiscard(false)}
                    >
                        Keep editing
                    </button>
                    <button
                        className="danger-button"
                        onClick={() => {
                            if (!draft) return;
                            void api(`/drafts/${draft.id}`, 'DELETE')
                                .then(() => {
                                    current.current = null;
                                    setDraft(null);
                                    setConfirmDiscard(false);
                                    router.get(
                                        listRoute(),
                                        {},
                                        {
                                            replace: true,
                                            preserveState: true,
                                            preserveScroll: true,
                                            only: ['drafts', 'counts'],
                                        },
                                    );
                                })
                                .catch((e) => setError(e.message));
                        }}
                    >
                        Discard draft
                    </button>
                </div>
            </Sheet>
        </Context.Provider>
    );
}
