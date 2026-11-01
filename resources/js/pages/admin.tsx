import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import {
    ArrowLeft,
    ChevronRight,
    Gauge,
    Globe2,
    Mail,
    Menu,
    Plus,
    ShieldCheck,
    Users,
    X,
} from 'lucide-react';
import { Brand, IconButton, Sheet } from '@/components/postroom/ui';
import { api, initials } from '@/lib/mail';
import { useMailNavigation } from '@/lib/mail-navigation';
import {
    MailboxAdministration,
    PersonAccess,
    ProviderConnections,
    type AdminAddress,
    type AdminLimits,
    type AdminMailbox,
    type DirectoryState,
} from '@/components/postroom/admin-controls';
type Meter = {
    provider: string;
    resource: string;
    scope: string;
    used: number | null;
    limit: number | null;
    reserved: number | null;
    unit: string;
    accuracy: string;
    status: string;
    observed_at: string | null;
    resets_at: string | null;
    last_error: string | null;
};
type Person = {
    id: number;
    name: string;
    email: string;
    role: string;
    active: boolean;
    two_factor_confirmed_at: string | null;
};
type Props = {
    people: Person[];
    mailboxes: AdminMailbox[];
    addresses: AdminAddress[];
    limits: AdminLimits;
    directory: DirectoryState;
    meters: Meter[];
    deliveries: {
        id: string;
        status: string;
        recipients: number;
        last_error: string | null;
        created_at: string;
    }[];
    audits: {
        id: number;
        action: string;
        target: string;
        created_at: string;
    }[];
    simulation: boolean;
    returnMailbox: number | null;
};
export default function Admin(props: Props) {
    const navigation = useMailNavigation();
    const page = usePage();
    const actor = page.props.auth.user;
    const requestedSection = page.url.startsWith('/admin/connection-settings')
        ? 'Connections'
        : new URL(page.url, location.origin).searchParams.get('section');
    const section = [
        'Overview',
        'People',
        'Mailboxes',
        'Connections',
        'Delivery',
        'Usage',
        'Security',
    ].includes(requestedSection ?? '')
        ? requestedSection!
        : 'Overview';
    const [navigationOpen, setNavigationOpen] = useState(false);
    const setSection = (name: string) => {
        setNavigationOpen(false);
        if (name === 'Connections')
            router.get(
                '/admin/connection-settings',
                {},
                { preserveState: true },
            );
        else
            router.push({
                url: `/admin?section=${encodeURIComponent(name)}`,
                preserveState: true,
            });
    };
    const [create, setCreate] = useState(false),
        [name, setName] = useState(''),
        [address, setAddress] = useState(''),
        [password, setPassword] = useState(''),
        [busy, setBusy] = useState(false),
        [message, setMessage] = useState(''),
        [suspend, setSuspend] = useState<Person | null>(null);
    const sections = [
        ['Overview', Gauge],
        ['People', Users],
        ['Mailboxes', Mail],
        ['Connections', Globe2],
        ['Delivery', Mail],
        ['Usage', Gauge],
        ['Security', ShieldCheck],
    ] as const;
    const sectionNavigation = sections.map(([name, Icon]) => (
        <button
            key={name}
            aria-current={section === name ? 'page' : undefined}
            className={`nav-item ${section === name ? 'active' : ''}`}
            onClick={() => setSection(name)}
        >
            <Icon size={19} />
            {name}
        </button>
    ));
    const createPerson = async () => {
        setBusy(true);
        setMessage('');
        try {
            const result = await api<{ message: string }>(
                '/admin/people',
                'POST',
                { name, address, password },
            );
            setCreate(false);
            setPassword('');
            setName('');
            setAddress('');
            setMessage(result.message);
            router.reload();
        } catch (e) {
            setMessage((e as Error).message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="admin-app">
            <Head title={`Admin · ${section}`} />
            <header className="admin-header">
                <Brand />
                <span className="admin-mode">Administration</span>
                <Link
                    className="secondary"
                    href={
                        navigation.location?.url ??
                        (props.returnMailbox
                            ? `/mail/${props.returnMailbox}`
                            : '/mail')
                    }
                >
                    <ArrowLeft size={17} />
                    <span>Back to mail</span>
                </Link>
            </header>
            <button
                className="admin-menu-toggle"
                aria-label={`${section} Change section`}
                onClick={() => setNavigationOpen(true)}
            >
                <Menu size={20} />
                {section} <span>Change section</span>
            </button>
            <div className="admin-grid">
                <nav className="admin-nav" aria-label="Administration sections">
                    {sectionNavigation}
                </nav>
                <main className="admin-main" tabIndex={-1}>
                    <div className="admin-title">
                        <div>
                            <p className="admin-context">WebMail workspace</p>
                            <h1>{section}</h1>
                        </div>
                        {section === 'People' && (
                            <button
                                className="primary"
                                onClick={() => setCreate(true)}
                            >
                                <Plus size={17} />
                                Add person
                            </button>
                        )}
                    </div>
                    {message && (
                        <div className="notice" role="status">
                            {message}
                            <IconButton
                                icon={X}
                                label="Dismiss message"
                                onClick={() => setMessage('')}
                            />
                        </div>
                    )}
                    {section === 'Overview' && (
                        <>
                            <p className="section-intro">
                                A clear view of your mail workspace.
                            </p>
                            <div className="status-banner">
                                <ShieldCheck size={22} />
                                <div>
                                    <strong>Strict-free pilot</strong>
                                    <p>
                                        Paid services and automatic upgrades are
                                        disabled. Availability depends on
                                        provider free-tier capacity.
                                    </p>
                                </div>
                            </div>
                            <h2>Connection readiness</h2>
                            <div className="readiness-row">
                                <div>
                                    <strong>Incoming mail</strong>
                                    <p>
                                        Cloudflare Email Routing → durable D1
                                        spool → WebMail
                                    </p>
                                </div>
                                <span className="status-pill warning">
                                    Not live-verified
                                </span>
                            </div>
                            <div className="readiness-row">
                                <div>
                                    <strong>Outgoing mail</strong>
                                    <p>
                                        {props.simulation
                                            ? 'Deterministic local adapter. No messages leave this application.'
                                            : 'Resend transport configured; live delivery still requires verification.'}
                                    </p>
                                </div>
                                <span className="status-pill">
                                    {props.simulation
                                        ? 'Local simulator'
                                        : 'Verification pending'}
                                </span>
                            </div>
                            <div className="readiness-row">
                                <div>
                                    <strong>People & mailboxes</strong>
                                    <p>
                                        {props.people.length} of{' '}
                                        {props.limits.max_users} pilot accounts
                                        · managed here in WebMail
                                    </p>
                                </div>
                                <button
                                    className="text-button"
                                    onClick={() => setSection('People')}
                                >
                                    Manage people <ChevronRight size={15} />
                                </button>
                            </div>
                            <div className="readiness-row">
                                <div>
                                    <strong>Mailbox storage</strong>
                                    <p>
                                        Content is stored in the application
                                        database. Provider capacity is shown
                                        separately.
                                    </p>
                                </div>
                                <button
                                    className="text-button"
                                    onClick={() => setSection('Usage')}
                                >
                                    Review usage <ChevronRight size={15} />
                                </button>
                            </div>
                            <p className="field-help">
                                This is a strict-free pilot. Provider signup,
                                initial deployment, master key and database
                                connection remain owner bootstrap steps.
                            </p>
                        </>
                    )}
                    {section === 'People' && (
                        <>
                            <p className="section-intro">
                                Create private accounts without sending anyone
                                to a provider dashboard.
                            </p>
                            <div className="people-list">
                                {props.people.map((person) => (
                                    <div className="person-row" key={person.id}>
                                        <span className="sender-avatar">
                                            {initials(person.name)}
                                        </span>
                                        <div className="person-identity">
                                            <strong>{person.name}</strong>
                                            <p>{person.email}</p>
                                        </div>
                                        <span className="person-role">
                                            {person.role}
                                        </span>
                                        {person.role === 'member' &&
                                            person.id !== actor.id && (
                                                <PersonAccess person={person} />
                                            )}
                                        <span
                                            className={`status-pill ${!person.active ? 'warning' : ''}`}
                                        >
                                            {person.active
                                                ? 'Active'
                                                : 'Suspended'}
                                        </span>
                                        {person.role === 'member' &&
                                            person.id !== actor.id && (
                                                <button
                                                    className="text-button"
                                                    onClick={() => {
                                                        setMessage('');
                                                        setSuspend(person);
                                                    }}
                                                >
                                                    {person.active
                                                        ? 'Suspend'
                                                        : 'Reinstate'}
                                                </button>
                                            )}
                                    </div>
                                ))}
                            </div>
                            <p className="field-help">
                                New receiving addresses remain pending until the
                                edge directory is synchronized. Local suspension
                                takes effect immediately; remote routing status
                                is separate.
                            </p>
                        </>
                    )}
                    {section === 'Mailboxes' && (
                        <MailboxAdministration
                            boxes={props.mailboxes}
                            people={props.people}
                            addresses={props.addresses}
                            limits={props.limits}
                            directory={props.directory}
                            actor={actor.id}
                        />
                    )}
                    {section === 'Usage' && (
                        <>
                            <p className="section-intro">
                                Exact sources, shared allowances, and honest
                                gaps. Unknown is never zero.
                            </p>
                            <div className="usage-list">
                                {props.meters.map((meter) => (
                                    <UsageMeter
                                        key={meter.resource}
                                        meter={meter}
                                    />
                                ))}
                            </div>
                            <p className="field-help">
                                WebMail holds sending at 95% to protect
                                operational headroom. The local daily guard uses
                                a rolling 24 hours; live reset times must come
                                from the provider.
                            </p>
                        </>
                    )}
                    {section === 'Connections' && (
                        <ProviderConnections owner={actor.role === 'owner'} />
                    )}
                    {section === 'Delivery' && (
                        <>
                            <p className="section-intro">
                                Provider acceptance and delivery to a recipient
                                server are separate events.
                            </p>
                            {props.deliveries.length === 0 ? (
                                <p className="admin-empty">
                                    No send intents yet. They appear here when a
                                    user sends a message.
                                </p>
                            ) : (
                                props.deliveries.map((delivery) => (
                                    <div
                                        className="delivery-row"
                                        key={delivery.id}
                                    >
                                        <div>
                                            <strong>
                                                {delivery.status === 'accepted'
                                                    ? 'Accepted · delivery pending'
                                                    : delivery.status}
                                            </strong>
                                            <p>
                                                {delivery.recipients} recipient
                                                deliveries ·{' '}
                                                {new Date(
                                                    delivery.created_at,
                                                ).toLocaleString()}
                                            </p>
                                            {delivery.last_error && (
                                                <p className="error-text">
                                                    {delivery.last_error}
                                                </p>
                                            )}
                                        </div>
                                        <code>{delivery.id.slice(0, 8)}</code>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                    {section === 'Security' && (
                        <>
                            <div className="status-banner">
                                <ShieldCheck size={23} />
                                <div>
                                    <strong>Administrator MFA required</strong>
                                    <p>
                                        Your administrator access is protected
                                        by server-side role and MFA checks.
                                    </p>
                                </div>
                            </div>
                            <Link
                                className="secondary"
                                href="/settings/security"
                            >
                                Manage my password & MFA{' '}
                                <ChevronRight size={16} />
                            </Link>
                            <h2>Administrative activity</h2>
                            {props.audits.length === 0 ? (
                                <p className="admin-empty">
                                    No administrative changes recorded yet.
                                </p>
                            ) : (
                                props.audits.map((audit) => (
                                    <div
                                        className="readiness-row"
                                        key={audit.id}
                                    >
                                        <span>
                                            {audit.action}
                                            <small>
                                                Account {audit.target}
                                            </small>
                                        </span>
                                        <time>
                                            {new Date(
                                                audit.created_at,
                                            ).toLocaleString()}
                                        </time>
                                    </div>
                                ))
                            )}
                        </>
                    )}
                </main>
            </div>
            <Sheet
                open={navigationOpen}
                onClose={() => setNavigationOpen(false)}
                title="Administration"
                side="left"
            >
                <nav
                    className="admin-drawer-nav"
                    aria-label="Administration sections"
                >
                    {sectionNavigation}
                </nav>
            </Sheet>
            <Sheet
                open={create}
                onClose={() => {
                    setCreate(false);
                    setPassword('');
                }}
                title="Add a person"
            >
                <p>They’ll sign in here. No provider account is needed.</p>
                <form
                    className="admin-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void createPerson();
                    }}
                >
                    <label>
                        Full name
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        Mailbox name
                        <input
                            value={address}
                            onChange={(e) =>
                                setAddress(e.target.value.toLowerCase())
                            }
                            required
                            pattern="[a-z0-9][a-z0-9._-]{0,63}"
                            placeholder="e.g. sam"
                        />
                        <small>
                            The configured business domain is added on the
                            server.
                        </small>
                    </label>
                    <label>
                        Initial password
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={12}
                            autoComplete="new-password"
                        />
                        <small>
                            At least 12 characters. Share securely outside
                            WebMail.
                        </small>
                    </label>
                    {message && (
                        <p role="alert" className="error-text">
                            {message}
                        </p>
                    )}
                    <button className="primary" disabled={busy}>
                        {busy ? 'Creating…' : 'Create account'}
                    </button>
                </form>
            </Sheet>
            <Sheet
                open={!!suspend}
                onClose={() => setSuspend(null)}
                title={
                    suspend?.active
                        ? 'Suspend this account?'
                        : 'Reinstate this account?'
                }
                side="bottom"
            >
                {message && (
                    <p role="alert" className="error-text">
                        {message}
                    </p>
                )}
                <p>
                    {suspend?.name}:{' '}
                    {suspend?.active
                        ? 'This revokes their sessions and blocks application access immediately. Edge routing synchronization remains pending.'
                        : 'This restores application access. Edge routing synchronization remains pending.'}
                </p>
                <div className="button-row">
                    <button
                        className="secondary"
                        onClick={() => setSuspend(null)}
                    >
                        Cancel
                    </button>
                    <button
                        className="primary"
                        onClick={() => {
                            if (!suspend) return;
                            void api(`/admin/people/${suspend.id}`, 'PATCH', {
                                active: !suspend.active,
                            })
                                .then(() => {
                                    setSuspend(null);
                                    router.reload();
                                })
                                .catch((e) => setMessage(e.message));
                        }}
                    >
                        {suspend?.active
                            ? 'Suspend account'
                            : 'Reinstate account'}
                    </button>
                </div>
            </Sheet>
        </div>
    );
}
export function UsageMeter({ meter }: { meter: Meter }) {
    const percentage =
        meter.used !== null && meter.limit !== null && meter.limit > 0
            ? (meter.used / meter.limit) * 100
            : null;
    const severity =
        percentage === null
            ? 'unknown'
            : percentage >= 100
              ? 'At capacity'
              : percentage >= 95
                ? 'Protected headroom'
                : percentage >= 85
                  ? 'Critical warning'
                  : percentage >= 70
                    ? 'Approaching limit'
                    : 'Within configured limit';
    return (
        <section className="usage-meter">
            <div className="meter-heading">
                <div>
                    <h2>{meter.resource}</h2>
                    <p>
                        {meter.provider} · {meter.scope}
                    </p>
                </div>
                <span
                    className={`status-pill ${percentage !== null && percentage >= 70 ? 'warning' : ''}`}
                >
                    {meter.status === 'stale'
                        ? 'Stale measurement'
                        : severity === 'unknown'
                          ? 'Unavailable'
                          : severity}
                </span>
            </div>
            {percentage !== null ? (
                <>
                    <div className="meter-values">
                        <strong>
                            {meter.used}{' '}
                            <span>
                                / {meter.limit} {meter.unit}
                            </span>
                        </strong>
                        <span>
                            {percentage > 0 && percentage < 1
                                ? '<1'
                                : percentage.toFixed(0)}
                            %
                        </span>
                    </div>
                    <progress
                        value={Math.min(meter.used!, meter.limit!)}
                        max={meter.limit!}
                        aria-label={`${meter.resource} usage`}
                    />
                    <p>
                        {Math.max(0, meter.limit! - meter.used!)} remaining ·{' '}
                        {meter.reserved === null
                            ? 'Reservation total unavailable'
                            : `${meter.reserved} pending or uncertain (included in local ledger)`}
                    </p>
                </>
            ) : (
                <p className="unavailable-value">No verified measurement</p>
            )}
            <div className="meter-meta">
                <span>
                    {meter.accuracy.replaceAll('_', ' ')}
                    {meter.observed_at
                        ? ` · Observed ${new Date(meter.observed_at).toLocaleString()}`
                        : ''}
                </span>
                {meter.resets_at && (
                    <span>
                        Provider reset:{' '}
                        {new Date(meter.resets_at).toLocaleString()}
                    </span>
                )}
            </div>
            {meter.last_error && (
                <p className="field-help">{meter.last_error}</p>
            )}
        </section>
    );
}
