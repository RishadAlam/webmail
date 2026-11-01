import { Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Settings2 } from 'lucide-react';
import { Sheet } from '@/components/postroom/ui';
import { api, byteText, type Mailbox } from '@/lib/mail';

const refreshAdministration = () =>
    new Promise<void>((resolve) =>
        router.reload({ onFinish: () => resolve() }),
    );

export type AdminPerson = {
    id: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
    two_factor_confirmed_at: string | null;
};
export type AdminMailbox = Mailbox & {
    members: (AdminPerson & { can_send: boolean })[];
};
export type AdminAddress = {
    id: number;
    mailbox_id: number;
    email: string;
    active: boolean;
    enabled: boolean;
    directory_status: string;
};
export type AdminLimits = {
    domain: string;
    max_users: number;
    max_mailboxes: number;
    max_addresses: number;
    max_mailbox_bytes: number;
    min_mailbox_bytes: number;
};
export type DirectoryState = {
    status: 'pending' | 'synced' | 'simulated' | 'failed';
    revision: number;
    count: number;
    last_synced_at: string | null;
    last_error: string | null;
    simulation: boolean;
};

export function DirectoryControl({ directory }: { directory: DirectoryState }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <section
            className="directory-control"
            aria-labelledby="directory-title"
        >
            <div className="readiness-row">
                <div>
                    <h2 id="directory-title">Receiving directory</h2>
                    <p>
                        {directory.count} addresses · revision{' '}
                        {directory.revision} ·{' '}
                        {directory.status === 'simulated'
                            ? 'Simulated locally'
                            : directory.status === 'synced'
                              ? 'Acknowledged by Worker'
                              : directory.status === 'failed'
                                ? 'Sync failed'
                                : 'Changes pending'}
                    </p>
                    {directory.last_synced_at && (
                        <small>
                            Last acknowledgment:{' '}
                            {new Date(
                                directory.last_synced_at,
                            ).toLocaleString()}
                        </small>
                    )}
                </div>
                <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                        setBusy(true);
                        setError('');
                        try {
                            await api('/admin/directory/sync', 'POST', {});
                            router.reload();
                        } catch (cause) {
                            setError((cause as Error).message);
                            router.reload();
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <RefreshCw size={17} />
                    {busy ? 'Synchronizing…' : 'Synchronize addresses'}
                </button>
            </div>
            <p className="field-help">
                {directory.simulation
                    ? 'Local simulation only. No Cloudflare directory has been updated.'
                    : 'Publishes enabled addresses to the configured Worker. This does not change DNS or routing.'}
            </p>
            {(error || directory.last_error) && (
                <p className="error-text" role="alert">
                    {error || directory.last_error}
                </p>
            )}
        </section>
    );
}

export function MailboxAdministration({
    boxes,
    people,
    addresses,
    limits,
    directory,
    actor,
}: {
    boxes: AdminMailbox[];
    people: AdminPerson[];
    addresses: AdminAddress[];
    limits: AdminLimits;
    directory: DirectoryState;
    actor: number;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const box = boxes.find((item) => item.id === selected);
    return (
        <>
            <div className="section-actions">
                <p>
                    Account administration does not grant access to another
                    person’s mail.
                </p>
                <button
                    className="secondary"
                    onClick={() => setCreating(true)}
                    disabled={boxes.length >= limits.max_mailboxes}
                >
                    <Plus size={17} />
                    Add mailbox
                </button>
            </div>
            {boxes.map((box) => (
                <div className="mailbox-admin-row" key={box.id}>
                    <div>
                        <strong>{box.name}</strong>
                        <p>{box.email}</p>
                        <small>
                            {box.members.length}{' '}
                            {box.members.length === 1 ? 'member' : 'members'}
                        </small>
                    </div>
                    <span>
                        {byteText(box.used_bytes)} / {byteText(box.quota_bytes)}
                    </span>
                    <progress
                        value={box.used_bytes}
                        max={box.quota_bytes}
                        aria-label={`${box.name} storage`}
                    />
                    <button
                        className="secondary"
                        onClick={() => setSelected(box.id)}
                        aria-label={`Manage ${box.name}`}
                    >
                        <Settings2 size={17} />
                        Manage
                    </button>
                </div>
            ))}
            <DirectoryControl directory={directory} />
            <h2>Receiving addresses</h2>
            {addresses.map((address) => (
                <div className="readiness-row" key={address.id}>
                    <span className="break-anywhere">{address.email}</span>
                    <span className="status-pill">
                        {!address.enabled
                            ? 'Disabled'
                            : !address.active
                              ? 'No active members'
                              : address.directory_status === 'synced'
                                ? 'Synchronized'
                                : address.directory_status === 'simulated' ||
                                    address.directory_status === 'local_only'
                                  ? 'Local simulation'
                                  : address.directory_status === 'failed'
                                    ? 'Sync failed'
                                    : 'Sync pending'}
                    </span>
                </div>
            ))}
            {box && (
                <MailboxEditor
                    key={box.id}
                    box={box}
                    addresses={addresses.filter(
                        (address) => address.mailbox_id === box.id,
                    )}
                    people={people}
                    actor={actor}
                    limits={limits}
                    onClose={() => setSelected(null)}
                />
            )}
            {creating && (
                <NewMailbox
                    people={people.filter(
                        (person) =>
                            person.role === 'member' &&
                            person.active &&
                            person.id !== actor,
                    )}
                    limits={limits}
                    onClose={() => setCreating(false)}
                />
            )}
        </>
    );
}

function MailboxEditor({
    box,
    addresses,
    people,
    actor,
    limits,
    onClose,
}: {
    box: AdminMailbox;
    addresses: AdminAddress[];
    people: AdminPerson[];
    actor: number;
    limits: AdminLimits;
    onClose: () => void;
}) {
    const [quota, setQuota] = useState(String(box.quota_bytes / 1048576));
    const [alias, setAlias] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const mutate = async (
        url: string,
        method: string,
        body: unknown,
        success: string,
    ) => {
        setBusy(true);
        setMessage('');
        try {
            await api(url, method, body);
            setMessage(success);
            await refreshAdministration();
            return true;
        } catch (cause) {
            setMessage((cause as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    };
    return (
        <Sheet open onClose={onClose} title={`Manage ${box.name}`}>
            <p className="break-anywhere">{box.email}</p>
            {(message || busy) && (
                <p role="status" className="notice">
                    {busy ? 'Saving change…' : message}
                </p>
            )}
            <form
                className="admin-form admin-subsection"
                onSubmit={(event) => {
                    event.preventDefault();
                    void mutate(
                        `/admin/mailboxes/${box.id}/quota`,
                        'PATCH',
                        { quota_bytes: Math.round(Number(quota) * 1048576) },
                        'Storage allocation saved.',
                    );
                }}
            >
                <h3>Storage allocation</h3>
                <label>
                    Mailbox limit (MiB)
                    <input
                        type="number"
                        min={limits.min_mailbox_bytes / 1048576}
                        max={limits.max_mailbox_bytes / 1048576}
                        step="1"
                        value={quota}
                        onChange={(event) => setQuota(event.target.value)}
                        required
                    />
                </label>
                <p className="field-help">
                    Currently using {byteText(box.used_bytes)}. Limits cannot be
                    reduced below stored content or exceed the strict-free
                    application cap.
                </p>
                <button className="secondary" disabled={busy}>
                    Save allocation
                </button>
            </form>
            <section className="admin-subsection">
                <h3>Mailbox members</h3>
                <p className="field-help">
                    Reading and sending permissions are separate. Administrator
                    accounts cannot grant themselves mailbox access here.
                </p>
                {people.map((person) => {
                    const membership = box.members.find(
                        (member) => member.id === person.id,
                    );
                    const protectedAccount =
                        person.id === actor || person.role !== 'member';
                    return (
                        <div className="member-permission-row" key={person.id}>
                            <div>
                                <strong>{person.name}</strong>
                                <small>{person.email}</small>
                            </div>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={!!membership}
                                    disabled={busy || protectedAccount}
                                    onChange={(event) =>
                                        void mutate(
                                            `/admin/mailboxes/${box.id}/members/${person.id}`,
                                            'PUT',
                                            {
                                                present: event.target.checked,
                                                can_send:
                                                    membership?.can_send ??
                                                    false,
                                            },
                                            'Membership saved. Synchronize the receiving directory if its status is pending.',
                                        )
                                    }
                                />
                                Read mail
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={membership?.can_send ?? false}
                                    disabled={
                                        busy || protectedAccount || !membership
                                    }
                                    onChange={(event) =>
                                        void mutate(
                                            `/admin/mailboxes/${box.id}/members/${person.id}`,
                                            'PUT',
                                            {
                                                present: true,
                                                can_send: event.target.checked,
                                            },
                                            'Sender permission saved.',
                                        )
                                    }
                                />
                                Send mail
                            </label>
                            {protectedAccount && membership && (
                                <small>
                                    Protected administrator membership
                                </small>
                            )}
                        </div>
                    );
                })}
            </section>
            <section className="admin-subsection">
                <h3>Aliases</h3>
                {addresses.map((address) => (
                    <label className="alias-toggle" key={address.id}>
                        <input
                            type="checkbox"
                            checked={address.enabled}
                            disabled={busy || address.email === box.email}
                            onChange={(event) =>
                                void mutate(
                                    `/admin/mailboxes/${box.id}/aliases/${address.id}`,
                                    'PATCH',
                                    { active: event.target.checked },
                                    'Alias updated. Synchronize addresses to publish the change.',
                                )
                            }
                        />
                        <span>
                            {address.email}
                            {address.email === box.email && (
                                <small>Primary address</small>
                            )}
                        </span>
                    </label>
                ))}
                <form
                    className="admin-form"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        if (
                            await mutate(
                                `/admin/mailboxes/${box.id}/aliases`,
                                'POST',
                                { address: alias },
                                'Alias added. Synchronize addresses to enable receiving.',
                            )
                        )
                            setAlias('');
                    }}
                >
                    <label>
                        New alias
                        <input
                            value={alias}
                            onChange={(event) =>
                                setAlias(event.target.value.toLowerCase())
                            }
                            autoComplete="off"
                            pattern="[a-z0-9][a-z0-9._-]{0,63}"
                            maxLength={64}
                            required
                        />
                        <small>@{limits.domain}</small>
                    </label>
                    <button className="secondary" disabled={busy}>
                        Add alias
                    </button>
                </form>
            </section>
        </Sheet>
    );
}

function NewMailbox({
    people,
    limits,
    onClose,
}: {
    people: AdminPerson[];
    limits: AdminLimits;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <Sheet open onClose={onClose} title="Add a mailbox">
            <p>
                Create a mailbox for an existing member. Additional members can
                be assigned afterward.
            </p>
            <form
                className="admin-form"
                onSubmit={async (event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    setBusy(true);
                    setError('');
                    try {
                        await api('/admin/mailboxes', 'POST', {
                            name: data.get('name'),
                            address: data.get('address'),
                            user_id: Number(data.get('user_id')),
                            can_send: data.get('can_send') === 'on',
                            quota_bytes: Number(data.get('quota')) * 1048576,
                        });
                        router.reload();
                        onClose();
                    } catch (cause) {
                        setError((cause as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <label>
                    Mailbox name
                    <input
                        name="name"
                        required
                        maxLength={80}
                        autoComplete="off"
                    />
                </label>
                <label>
                    Address
                    <input
                        name="address"
                        required
                        pattern="[a-z0-9][a-z0-9._-]{0,63}"
                        maxLength={64}
                        autoComplete="off"
                    />
                    <small>@{limits.domain}</small>
                </label>
                <label>
                    Initial member
                    <select
                        name="user_id"
                        required
                        defaultValue={people[0]?.id ?? ''}
                    >
                        <option value="" disabled>
                            Select a member
                        </option>
                        {people.map((person) => (
                            <option key={person.id} value={person.id}>
                                {person.name} · {person.email}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="check-label">
                    <input name="can_send" type="checkbox" defaultChecked />
                    Allow this member to send
                </label>
                <label>
                    Storage limit (MiB)
                    <input
                        name="quota"
                        type="number"
                        min={limits.min_mailbox_bytes / 1048576}
                        max={limits.max_mailbox_bytes / 1048576}
                        defaultValue={limits.max_mailbox_bytes / 1048576}
                        required
                    />
                </label>
                {error && (
                    <p role="alert" className="error-text">
                        {error}
                    </p>
                )}
                <button className="primary" disabled={busy || !people.length}>
                    {busy ? 'Creating…' : 'Create mailbox'}
                </button>
                {!people.length && (
                    <p className="field-help">
                        Create an active member in People first.
                    </p>
                )}
            </form>
        </Sheet>
    );
}

export function PersonAccess({ person }: { person: AdminPerson }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    return (
        <>
            <button
                className="text-button"
                onClick={() => {
                    setOpen(true);
                    setMessage('');
                }}
            >
                Manage access
            </button>
            <Sheet
                open={open}
                onClose={() => setOpen(false)}
                title={`Access for ${person.name}`}
            >
                <p className="break-anywhere">{person.email}</p>
                {message && (
                    <p className="notice" role="status">
                        {message}
                    </p>
                )}
                <section className="admin-subsection">
                    <h3>Active sessions</h3>
                    <p>
                        Sign this person out on all devices. Their mailbox and
                        drafts are retained.
                    </p>
                    <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                            setBusy(true);
                            setMessage('');
                            try {
                                await api(
                                    `/admin/people/${person.id}/revoke-sessions`,
                                    'POST',
                                    {},
                                );
                                setMessage(
                                    'All sessions revoked. The person can sign in again with their existing credentials.',
                                );
                                router.reload();
                            } catch (cause) {
                                setMessage((cause as Error).message);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        Revoke all sessions
                    </button>
                </section>
                <form
                    className="admin-form admin-subsection"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const data = new FormData(form);
                        setBusy(true);
                        setMessage('');
                        try {
                            await api(
                                `/admin/people/${person.id}/password`,
                                'PUT',
                                {
                                    current_password:
                                        data.get('current_password'),
                                    password: data.get('password'),
                                    password_confirmation: data.get(
                                        'password_confirmation',
                                    ),
                                },
                            );
                            form.reset();
                            setMessage(
                                'Password reset and sessions revoked. Share the new password securely. Existing two-factor authentication remains required.',
                            );
                            router.reload();
                        } catch (cause) {
                            setMessage((cause as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <h3>Reset password</h3>
                    <label>
                        Your administrator password
                        <input
                            name="current_password"
                            type="password"
                            autoComplete="current-password"
                            required
                        />
                    </label>
                    <label>
                        New password for {person.name}
                        <input
                            name="password"
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </label>
                    <label>
                        Confirm new password
                        <input
                            name="password_confirmation"
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            maxLength={128}
                            required
                        />
                    </label>
                    <button className="primary" disabled={busy}>
                        {busy ? 'Saving…' : 'Reset password'}
                    </button>
                </form>
            </Sheet>
        </>
    );
}

type SecretField =
    | 'resend_key'
    | 'resend_management_key'
    | 'cloudflare_token'
    | 'worker_secret';
type ConnectionField = SecretField | 'worker_url';
type ConnectionState = {
    mode: 'mock' | 'live';
    domain: string;
    sending_enabled: boolean;
    fields: Record<
        SecretField,
        { configured: boolean; source: string; masked: string | null }
    > & {
        worker_url: {
            configured: boolean;
            source: string;
            value: string | null;
        };
    };
    checks: Record<
        'resend_management' | 'cloudflare',
        { status: string; checked_at: string | null; error: string | null }
    >;
};
const fieldLabels: [ConnectionField, string, string][] = [
    [
        'worker_url',
        'Ingress Worker URL',
        'The HTTPS endpoint of your deployed Worker.',
    ],
    [
        'worker_secret',
        'Ingress shared secret',
        'Must match the secret installed on the Worker.',
    ],
    [
        'resend_key',
        'Resend sending key',
        'A sending-only key scoped to your domain. Saving it does not enable sending.',
    ],
    [
        'resend_management_key',
        'Resend management key',
        'A full-access key is required for the documented usage endpoint.',
    ],
    [
        'cloudflare_token',
        'Cloudflare inspection token',
        'Scope Zone Read and DNS Read to your business zone.',
    ],
];
const emptyValues = {
    worker_url: '',
    worker_secret: '',
    resend_key: '',
    resend_management_key: '',
    cloudflare_token: '',
};
export function ProviderConnections({ owner }: { owner: boolean }) {
    const [state, setState] = useState<ConnectionState | null>(null);
    const [values, setValues] = useState(emptyValues);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [remove, setRemove] = useState<ConnectionField | null>(null);
    useEffect(() => {
        if (!owner) return;
        let active = true;
        void api<ConnectionState>('/admin/connections')
            .then((value) => {
                if (active) setState(value);
            })
            .catch((cause: Error) => {
                if (active) setMessage(cause.message);
            });
        return () => {
            active = false;
        };
    }, [owner]);
    const run = async (url: string, method: string, body?: unknown) => {
        setBusy(true);
        setMessage('');
        try {
            const next = await api<ConnectionState>(url, method, body);
            setState(next);
            return true;
        } catch (cause) {
            setMessage((cause as Error).message);
            const refreshed = await api<ConnectionState>(
                '/admin/connections',
            ).catch(() => null);
            if (refreshed) setState(refreshed);
            return false;
        } finally {
            setBusy(false);
        }
    };
    if (!owner)
        return (
            <p className="section-intro">
                Only the owner can manage provider credentials. Your
                administrator account can manage people, mailboxes and the
                receiving directory.
            </p>
        );
    return (
        <>
            <p className="section-intro">
                Connect the owner’s provider accounts. Ordinary users only need
                their WebMail account.
            </p>
            <div className="status-banner">
                <div>
                    <strong>
                        {state?.mode === 'mock'
                            ? 'Local provider simulation'
                            : 'Connection setup'}
                    </strong>
                    <p>
                        {state?.mode === 'mock'
                            ? 'Checks use deterministic adapters. No provider account or delivery is verified.'
                            : 'Read-only access checks do not verify DNS, receiving or email delivery.'}{' '}
                        Sending is{' '}
                        {state?.sending_enabled
                            ? 'enabled in deployment configuration'
                            : 'disabled'}
                        .
                    </p>
                </div>
            </div>
            {message && (
                <p role="status" className="notice">
                    {message}
                </p>
            )}
            {!state ? (
                <p role="status">
                    {message
                        ? 'Connection settings are unavailable.'
                        : 'Loading connection settings…'}
                </p>
            ) : (
                <>
                    <form
                        className="admin-form connection-form"
                        autoComplete="off"
                        onSubmit={async (event) => {
                            event.preventDefault();
                            if (
                                await run('/admin/connections', 'PUT', values)
                            ) {
                                setValues(emptyValues);
                                setMessage(
                                    'Connection settings saved. Run the relevant checks before live verification.',
                                );
                            }
                        }}
                    >
                        {fieldLabels.map(([field, label, help]) => (
                            <div className="connection-field" key={field}>
                                <label htmlFor={`connection-${field}`}>
                                    {label}
                                </label>
                                <p className="field-help">{help}</p>
                                <div className="connection-state">
                                    <span>
                                        {state.fields[field].configured
                                            ? `Configured · ${state.fields[field].source}`
                                            : 'Not configured'}
                                    </span>
                                    {state.fields[field].configured && (
                                        <button
                                            type="button"
                                            className="text-button"
                                            disabled={busy}
                                            onClick={() => setRemove(field)}
                                        >
                                            Clear {label.toLowerCase()}
                                        </button>
                                    )}
                                </div>
                                {field === 'worker_url' &&
                                    state.fields.worker_url.value && (
                                        <p className="break-anywhere">
                                            {state.fields.worker_url.value}
                                        </p>
                                    )}
                                <input
                                    id={`connection-${field}`}
                                    disabled={busy}
                                    type={
                                        field === 'worker_url'
                                            ? 'url'
                                            : 'password'
                                    }
                                    value={values[field]}
                                    onChange={(event) =>
                                        setValues({
                                            ...values,
                                            [field]: event.target.value,
                                        })
                                    }
                                    autoComplete="off"
                                    spellCheck={false}
                                    maxLength={2048}
                                    placeholder={
                                        state.fields[field].configured
                                            ? 'Leave blank to keep the current value'
                                            : 'Enter a value'
                                    }
                                />
                            </div>
                        ))}
                        <p className="field-help">
                            Secrets are encrypted on the server and never
                            returned to this screen. Blank fields keep existing
                            values.
                        </p>
                        <button className="primary" disabled={busy}>
                            {busy ? 'Working…' : 'Save connections'}
                        </button>
                    </form>
                    <h2>Read-only access checks</h2>
                    {(['resend_management', 'cloudflare'] as const).map(
                        (connection) => (
                            <div className="readiness-row" key={connection}>
                                <div>
                                    <strong>
                                        {connection === 'resend_management'
                                            ? 'Resend usage access'
                                            : 'Cloudflare zone inspection'}
                                    </strong>
                                    <p>
                                        {state.checks[connection].status}
                                        {state.checks[connection].checked_at &&
                                            ` · ${new Date(state.checks[connection].checked_at!).toLocaleString()}`}
                                    </p>
                                    {state.checks[connection].error && (
                                        <p className="error-text">
                                            {state.checks[connection].error}
                                        </p>
                                    )}
                                </div>
                                <button
                                    className="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        void run(
                                            `/admin/connections/${connection}/test`,
                                            'POST',
                                            {},
                                        )
                                    }
                                >
                                    Check{' '}
                                    {connection === 'resend_management'
                                        ? 'Resend usage'
                                        : 'Cloudflare access'}
                                </button>
                            </div>
                        ),
                    )}
                </>
            )}
            <p className="field-help">
                If confirmation expires,{' '}
                <Link className="inline-link" href="/admin/connection-settings">
                    confirm your password again
                </Link>{' '}
                before saving. Keep any unsubmitted credentials in your password
                manager.
            </p>
            <h2>Deployment and DNS</h2>
            <p>
                Provider signup, the initial Worker and application deployment,
                the application key and database connection are owner bootstrap
                steps. No DNS or routing changes are made here. Existing DNS
                must be reviewed as an exact diff and explicitly approved before
                applying changes.
            </p>
            <p className="field-help">
                Live receiving, sending, webhook delivery and account free-tier
                limits remain separate verification steps. See the deployment
                runbook before enabling external sending.
            </p>
            <Sheet
                open={!!remove}
                onClose={() => setRemove(null)}
                title="Clear this connection value?"
                side="bottom"
            >
                <p>
                    Clearing{' '}
                    {fieldLabels.find(([field]) => field === remove)?.[1]} stops
                    using that value, including any environment fallback. Mail
                    and drafts are retained.
                </p>
                <div className="button-row">
                    <button
                        className="secondary"
                        onClick={() => setRemove(null)}
                    >
                        Cancel
                    </button>
                    <button
                        className="danger-button"
                        disabled={busy}
                        onClick={async () => {
                            if (
                                remove &&
                                (await run(
                                    `/admin/connections/${remove}`,
                                    'DELETE',
                                ))
                            ) {
                                setRemove(null);
                                setMessage('Connection value cleared.');
                            }
                        }}
                    >
                        Clear value
                    </button>
                </div>
            </Sheet>
        </>
    );
}
