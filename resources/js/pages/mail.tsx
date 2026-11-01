import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import {
    Archive,
    ArrowLeft,
    ArrowRight,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    CircleHelp,
    FilePenLine,
    Inbox,
    Mail,
    MailOpen,
    Menu,
    MoreHorizontal,
    Pencil,
    RefreshCw,
    Reply,
    ReplyAll,
    Search,
    Send,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    Star,
    Tag,
    Trash2,
    TriangleAlert,
    X,
} from 'lucide-react';
import {
    api,
    byteText,
    defaultPreferences,
    initials,
    type MailProps,
    type Message,
    type Preferences,
} from '@/lib/mail';
import { Brand, IconButton, Sheet } from '@/components/postroom/ui';
import { useCompose } from '@/components/postroom/compose';
import { useMailNavigation } from '@/lib/mail-navigation';
import { updateAppearance } from '@/hooks/use-appearance';
const folders = [
    ['inbox', 'Inbox', Inbox],
    ['starred', 'Starred', Star],
    ['sent', 'Sent', Send],
    ['drafts', 'Drafts', FilePenLine],
    ['archive', 'Archive', Archive],
    ['spam', 'Spam', TriangleAlert],
    ['trash', 'Trash', Trash2],
] as const;
const dates = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
    }).format(new Date(value));
export default function MailPage(props: MailProps) {
    const {
        mailbox,
        mailboxes,
        messages,
        thread,
        drafts,
        counts,
        filters,
        pagination,
        simulation,
    } = props;
    const page = usePage();
    const user = page.props.auth.user;
    const compose = useCompose();
    const navigationState = useMailNavigation();
    const [drawer, setDrawer] = useState(false),
        [settings, setSettings] = useState(false),
        [account, setAccount] = useState(false),
        [help, setHelp] = useState(false),
        [searchOptions, setSearchOptions] = useState(false),
        [mobileSearch, setMobileSearch] = useState(false);
    const [purgeIds, setPurgeIds] = useState<number[]>([]);
    const [purgeConfirmation, setPurgeConfirmation] = useState('');
    const [purgeError, setPurgeError] = useState('');
    useEffect(() => {
        const syncSearch = () =>
            setMobileSearch(
                new URLSearchParams(location.search).get('view') === 'search',
            );
        syncSearch();
        const stop = router.on('navigate', syncSearch);
        window.addEventListener('popstate', syncSearch);
        return () => {
            stop();
            window.removeEventListener('popstate', syncSearch);
        };
    }, []);
    const [navigating, setNavigating] = useState(false);
    const [query, setQuery] = useState(filters.q ?? ''),
        [selected, setSelected] = useState<number[]>([]),
        [prefs, setPrefs] = useState<Preferences>({
            ...defaultPreferences,
            ...(user.preferences as Partial<Preferences>),
        });
    const [toast, setToast] = useState<{
            message: string;
            operation?: string;
            error?: boolean;
        } | null>(null),
        [busy, setBusy] = useState(false),
        [more, setMore] = useState(false),
        [detail, setDetail] = useState<Message | null>(null),
        [label, setLabel] = useState(''),
        [htmlView, setHtmlView] = useState<Record<number, boolean>>({});
    const scroll = useRef<HTMLDivElement>(null),
        listPosition = useRef(0),
        focusRow = useRef<number | null>(null),
        mutating = useRef(false);
    const base = `/mail/${mailbox?.id ?? ''}`;
    const listUrl = (
        updates: Record<string, string | boolean | number> = {},
    ) => {
        const params = new URLSearchParams();
        const values = {
            folder: filters.folder ?? 'inbox',
            q: filters.q ?? '',
            unread: filters.unread ? '1' : '',
            page: filters.page ?? 1,
            ...updates,
        };
        for (const [key, value] of Object.entries(values))
            if (value !== '') params.set(key, String(value));
        return `${base}?${params}`;
    };
    const visit = (url: string) => {
        setNavigating(true);
        router.get(
            url,
            {},
            {
                preserveState: true,
                preserveScroll: true,
                onFinish: () => setNavigating(false),
            },
        );
    };
    const back = () => visit(listUrl());
    const rememberMail = () =>
        navigationState.remember({
            url: page.url,
            position: scroll.current?.scrollTop ?? listPosition.current,
            focus: focusRow.current,
        });
    useEffect(() => {
        setQuery(filters.q ?? '');
    }, [filters.q]);
    useEffect(() => {
        setSelected([]);
        listPosition.current = 0;
        focusRow.current = null;
        if (scroll.current) scroll.current.scrollTop = 0;
    }, [mailbox?.id, filters.folder, filters.q, filters.page, filters.unread]);
    const restoredNavigation = useRef(false);
    useEffect(() => {
        if (restoredNavigation.current) return;
        restoredNavigation.current = true;
        if (navigationState.location?.url === page.url) {
            listPosition.current = navigationState.location.position;
            focusRow.current = navigationState.location.focus;
        }
    }, [navigationState.location, page.url]);
    useEffect(() => {
        if (!thread && !navigating) {
            requestAnimationFrame(() => {
                if (scroll.current)
                    scroll.current.scrollTop = listPosition.current;
                if (focusRow.current)
                    document
                        .getElementById(`open-${focusRow.current}`)
                        ?.focus({ preventScroll: true });
            });
        }
    }, [thread?.id, navigating]);
    const preference = async (patch: Partial<Preferences>) => {
        const before = prefs;
        setPrefs({ ...prefs, ...patch });
        if (patch.theme) updateAppearance(patch.theme);
        try {
            await api('/preferences', 'PUT', patch);
        } catch (e) {
            setPrefs(before);
            if (patch.theme) updateAppearance(before.theme);
            setToast({ message: (e as Error).message, error: true });
        }
    };
    const mutate = async (action: string, ids = selected) => {
        if (!mailbox || !ids.length || mutating.current) return;
        mutating.current = true;
        setBusy(true);
        try {
            const result = await api<{ operation: string }>(
                `${base}/actions`,
                'POST',
                { action, ids, label },
            );
            setToast({
                message:
                    action === 'archive'
                        ? `${ids.length === 1 ? 'Message' : `${ids.length} messages`} archived`
                        : action === 'trash'
                          ? 'Moved to Trash'
                          : 'Messages updated',
                operation: result.operation,
            });
            setSelected([]);
            setMore(false);
            if (
                thread &&
                ['archive', 'trash', 'spam', 'unread'].includes(action)
            )
                back();
            else router.reload({ only: ['messages', 'thread', 'counts'] });
        } catch (e) {
            setToast({ message: (e as Error).message, error: true });
        } finally {
            mutating.current = false;
            setBusy(false);
        }
    };
    const undo = async () => {
        if (!toast?.operation || mutating.current) return;
        mutating.current = true;
        try {
            await api(`/operations/${toast.operation}/undo`, 'POST');
            setToast({ message: 'Change undone' });
            router.reload({ only: ['messages', 'thread', 'counts'] });
        } catch (e) {
            setToast({ message: (e as Error).message, error: true });
        } finally {
            mutating.current = false;
        }
    };
    const openThread = (message: Message) => {
        listPosition.current = scroll.current?.scrollTop ?? 0;
        focusRow.current = message.id;
        const suffix = listUrl().split('?')[1];
        visit(
            `${base}/thread/${encodeURIComponent(message.thread_id)}?${suffix}`,
        );
    };
    const search = () => {
        setMobileSearch(false);
        visit(
            listUrl({
                q: query,
                folder: query.trim() ? 'all' : 'inbox',
                page: 1,
            }),
        );
    };
    const navigation = (
        <>
            <div className="nav-compose">
                <button
                    className="compose-button"
                    aria-label="Compose"
                    onClick={() => mailbox && void compose.open(mailbox.id)}
                >
                    <Pencil size={23} />
                    <span>Compose</span>
                </button>
            </div>
            <nav aria-label="Mail folders">
                {folders.map(([key, name, Icon]) => (
                    <Link
                        key={key}
                        title={name}
                        href={`${base}?folder=${key}`}
                        preserveState
                        preserveScroll
                        className={`nav-item ${filters.folder === key ? 'active' : ''}`}
                        onClick={() => setDrawer(false)}
                        aria-current={
                            filters.folder === key ? 'page' : undefined
                        }
                    >
                        <Icon
                            size={19}
                            strokeWidth={filters.folder === key ? 2 : 1.7}
                        />
                        <span>{name}</span>
                        {(key === 'inbox' ? counts.unread : counts[key]) >
                            0 && (
                            <span className="nav-count">
                                {key === 'inbox' ? counts.unread : counts[key]}
                            </span>
                        )}
                    </Link>
                ))}
            </nav>
            <div className="nav-separator" />
            <div className="nav-secondary">
                <p className="nav-subtitle">Your workspace</p>
                <button
                    className="nav-item"
                    title="Choose mailbox"
                    onClick={() => setAccount(true)}
                >
                    <span className="mini-avatar">
                        {initials(mailbox?.name ?? user.name)}
                    </span>
                    <span className="ellipsis">
                        {mailbox?.name ?? user.name}
                    </span>
                    <ChevronDown size={15} />
                </button>
                {['owner', 'admin'].includes(String(user.role)) && (
                    <Link
                        href="/admin"
                        className="nav-item"
                        onClick={rememberMail}
                    >
                        <ShieldCheck size={19} />
                        <span>Administration</span>
                    </Link>
                )}
            </div>
            <div className="sidebar-bottom">
                {mailbox && (
                    <>
                        <div className="storage-line">
                            <span>Mailbox storage</span>
                            <span>
                                {Math.max(
                                    1,
                                    Math.round(
                                        (mailbox.used_bytes /
                                            mailbox.quota_bytes) *
                                            100,
                                    ),
                                ) === 1 &&
                                mailbox.used_bytes / mailbox.quota_bytes < 0.01
                                    ? '<1%'
                                    : `${Math.round((mailbox.used_bytes / mailbox.quota_bytes) * 100)}%`}
                            </span>
                        </div>
                        <progress
                            max={mailbox.quota_bytes}
                            value={mailbox.used_bytes}
                            aria-label="Mailbox storage"
                        />
                        <p>
                            {byteText(mailbox.used_bytes)} of{' '}
                            {byteText(mailbox.quota_bytes)}
                            <br />
                            Locally measured content
                        </p>
                    </>
                )}
                <span className="pilot-label">
                    <ShieldCheck size={13} />
                    {simulation
                        ? 'Local pilot · fictional mail'
                        : 'Strict-free pilot'}
                </span>
            </div>
        </>
    );
    const actions = thread ? thread.messages.map((m) => m.id) : selected;
    const canPurge =
        actions.length > 0 &&
        (thread
            ? thread.messages.every((message) => message.folder === 'trash')
            : filters.folder === 'trash');
    const confirmPurge = () => {
        setPurgeIds([...actions]);
        setPurgeConfirmation('');
        setPurgeError('');
        setMore(false);
    };
    const list = (
        <div className="message-list" ref={scroll} {...{ 'scroll-region': '' }}>
            <div className="list-title">
                <h1>
                    {filters.q
                        ? 'Search results'
                        : (folders.find((f) => f[0] === filters.folder)?.[1] ??
                          'All mail')}
                </h1>
                <span>
                    {filters.q
                        ? `Results for “${filters.q}”`
                        : filters.folder === 'inbox'
                          ? 'A little room to focus.'
                          : `${pagination?.total ?? drafts.length} messages`}
                </span>
            </div>
            {filters.folder === 'drafts' ? (
                <div>
                    {drafts.length === 0 ? (
                        <Empty
                            title="No saved drafts"
                            description="Start a message. Your draft will be saved here as you write."
                        />
                    ) : (
                        drafts.map((d) => (
                            <button
                                className="draft-row"
                                key={d.id}
                                aria-label={`Resume draft: ${d.subject || 'Untitled'}`}
                                onClick={() => compose.resume(d)}
                            >
                                <FilePenLine size={22} />
                                <span>
                                    <strong>
                                        {d.subject || 'Untitled draft'}
                                    </strong>
                                    <small>
                                        {d.to.join(', ') || 'No recipients yet'}{' '}
                                        · {d.status}
                                    </small>
                                </span>
                                <time>{dates(d.updated_at)}</time>
                                <ChevronRight size={17} />
                            </button>
                        ))
                    )}
                </div>
            ) : messages.length === 0 ? (
                <Empty
                    title={
                        filters.q ? 'No messages found' : 'All clear in here'
                    }
                    description={
                        filters.q
                            ? 'Try another sender or subject, or clear your search.'
                            : 'Messages in this folder will appear here.'
                    }
                />
            ) : (
                <ul className="rows" aria-label="Messages">
                    {messages.map((message, index) => (
                        <MessageRow
                            key={message.id}
                            disabled={navigating}
                            message={message}
                            selected={selected.includes(message.id)}
                            index={index}
                            preferences={prefs}
                            onSelect={() =>
                                setSelected(
                                    selected.includes(message.id)
                                        ? selected.filter(
                                              (id) => id !== message.id,
                                          )
                                        : [...selected, message.id],
                                )
                            }
                            onOpen={() => openThread(message)}
                            onAction={(action) =>
                                void mutate(action, [message.id])
                            }
                        />
                    ))}
                </ul>
            )}
            {pagination && pagination.total > 30 && (
                <nav className="mobile-pagination" aria-label="Message pages">
                    <IconButton
                        icon={ChevronLeft}
                        label="Previous page"
                        disabled={!pagination.prev}
                        onClick={() =>
                            pagination.prev && visit(pagination.prev)
                        }
                    />
                    <span>
                        {pagination.from}–{pagination.to} of {pagination.total}
                    </span>
                    <IconButton
                        icon={ChevronRight}
                        label="Next page"
                        disabled={!pagination.next}
                        onClick={() =>
                            pagination.next && visit(pagination.next)
                        }
                    />
                </nav>
            )}
            <div className="list-end">
                {simulation
                    ? 'Fictional local mail · no live provider connected'
                    : 'Private correspondence, in one place.'}
            </div>
        </div>
    );
    const reader = thread && (
        <article className="conversation" {...{ 'scroll-region': '' }}>
            {thread.pagination.total > 30 && (
                <nav
                    className="thread-pagination"
                    aria-label="Conversation pages"
                >
                    <button
                        className="secondary"
                        disabled={!thread.pagination.older}
                        onClick={() =>
                            thread.pagination.older &&
                            visit(thread.pagination.older)
                        }
                    >
                        <ChevronLeft size={18} />
                        Older messages
                    </button>
                    <span>
                        {thread.messages.length} of {thread.pagination.total}{' '}
                        messages. Actions affect this page.
                    </span>
                    <button
                        className="secondary"
                        disabled={!thread.pagination.newer}
                        onClick={() =>
                            thread.pagination.newer &&
                            visit(thread.pagination.newer)
                        }
                    >
                        Newer messages
                        <ChevronRight size={18} />
                    </button>
                </nav>
            )}
            <div className="conversation-subject">
                <h1>{thread.subject || '(No subject)'}</h1>
                <span className="folder-badge">
                    {thread.messages[0]?.folder}
                </span>
            </div>
            {thread.messages.map((message) => (
                <section className="conversation-message" key={message.id}>
                    <header className="sender-header">
                        <span className="sender-avatar">
                            {initials(message.from_name || message.from_email)}
                        </span>
                        <div className="sender-identity">
                            <strong>
                                {message.from_name || message.from_email}
                            </strong>
                            <span className="sender-address">
                                &lt;{message.from_email}&gt;
                            </span>
                            <button
                                className="recipient-disclosure"
                                onClick={() => setDetail(message)}
                            >
                                to{' '}
                                {message.to.includes(mailbox?.email ?? '')
                                    ? 'me'
                                    : message.to.join(', ')}{' '}
                                <ChevronDown size={13} />
                            </button>
                        </div>
                        <time
                            title={new Date(
                                message.created_at,
                            ).toLocaleString()}
                        >
                            {dates(message.created_at)}
                        </time>
                        <IconButton
                            icon={Star}
                            label={
                                message.starred
                                    ? 'Unstar message'
                                    : 'Star message'
                            }
                            className={`icon-button ${message.starred ? 'starred' : ''}`}
                            onClick={() =>
                                void mutate(
                                    message.starred ? 'unstar' : 'star',
                                    [message.id],
                                )
                            }
                        />
                    </header>
                    {message.delivery_status && (
                        <div className="delivery-status">
                            {simulation ? 'Local simulator · ' : ''}
                            {{
                                accepted: 'Accepted · delivery pending',
                                delivered: 'Delivered to recipient server',
                                uncertain: 'Delivery status uncertain',
                                failed: 'Delivery failed',
                                queued: 'Queued',
                                bounced: 'Bounced',
                            }[message.delivery_status] ??
                                message.delivery_status}
                        </div>
                    )}
                    {message.has_attachments && (
                        <p className="reader-notice">
                            This message contains attachments. They are retained
                            in the original MIME; attachment access is disabled
                            in this pilot.
                        </p>
                    )}
                    {message.has_html && (
                        <div className="reader-notice">
                            Remote images and active content are blocked.
                            <button
                                onClick={() =>
                                    setHtmlView({
                                        ...htmlView,
                                        [message.id]: !htmlView[message.id],
                                    })
                                }
                            >
                                {htmlView[message.id]
                                    ? 'Show plain text'
                                    : 'Show safe HTML'}
                            </button>
                        </div>
                    )}
                    {htmlView[message.id] ? (
                        <iframe
                            className="safe-email"
                            src={`/messages/${message.id}/html`}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            referrerPolicy="no-referrer"
                            title={`Email from ${message.from_name || message.from_email}`}
                        />
                    ) : (
                        <div className="message-body">{message.body_text}</div>
                    )}
                </section>
            ))}
            <div className="reply-actions">
                <button
                    className="secondary"
                    onClick={() =>
                        mailbox &&
                        void compose.open(
                            mailbox.id,
                            thread.messages.at(-1)?.id,
                            'reply',
                        )
                    }
                >
                    <Reply size={18} />
                    Reply
                </button>
                <button
                    className="secondary"
                    onClick={() =>
                        mailbox &&
                        void compose.open(
                            mailbox.id,
                            thread.messages.at(-1)?.id,
                            'reply-all',
                        )
                    }
                >
                    <ReplyAll size={18} />
                    Reply all
                </button>
                <button
                    className="secondary"
                    onClick={() =>
                        mailbox &&
                        void compose.open(
                            mailbox.id,
                            thread.messages.at(-1)?.id,
                            'forward',
                        )
                    }
                >
                    <ArrowRight size={18} />
                    Forward
                </button>
            </div>
        </article>
    );
    return (
        <div
            className={`mail-app ${prefs.collapsed ? 'nav-collapsed' : ''} density-${prefs.density} ${thread ? 'reading' : ''}`}
        >
            <Head title={thread?.subject || filters.folder || 'Mail'} />
            <a className="skip-link" href="#mail-main">
                Skip to mail
            </a>
            <header className="app-header">
                <div className="header-brand">
                    <IconButton
                        icon={Menu}
                        label="Open navigation"
                        onClick={() => {
                            if (innerWidth < 1024) setDrawer(true);
                            else
                                void preference({
                                    collapsed: !prefs.collapsed,
                                });
                        }}
                    />
                    <Link
                        href="/mail"
                        className="brand-link"
                        aria-label="WebMail by Hookstack inbox"
                    >
                        <Brand />
                    </Link>
                </div>
                <form
                    className="search-bar"
                    onSubmit={(e) => {
                        e.preventDefault();
                        search();
                    }}
                >
                    <span className="search-desktop">
                        <Search size={21} />
                    </span>
                    <button
                        className="search-mobile icon-button"
                        type="button"
                        aria-label="Open navigation"
                        onClick={() => setDrawer(true)}
                    >
                        <Menu size={22} />
                    </button>
                    <input
                        placeholder="Search mail"
                        aria-label="Search mail"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => {
                            if (innerWidth < 768) {
                                setMobileSearch(true);
                                router.push({
                                    url: (() => {
                                        const url = new URL(location.href);
                                        url.searchParams.set('view', 'search');
                                        return url.pathname + url.search;
                                    })(),
                                    preserveState: true,
                                    preserveScroll: true,
                                });
                            }
                        }}
                    />
                    {query && (
                        <IconButton
                            icon={X}
                            label="Clear search"
                            onClick={() => {
                                setQuery('');
                                visit(listUrl({ q: '', page: 1 }));
                            }}
                        />
                    )}
                    <IconButton
                        icon={SlidersHorizontal}
                        label="Search options"
                        onClick={() => setSearchOptions(true)}
                    />
                    <button
                        className="account-avatar mobile-avatar"
                        type="button"
                        aria-label={`${initials(user.name)} · Account and mailboxes`}
                        onClick={() => setAccount(true)}
                    >
                        {initials(user.name)}
                    </button>
                </form>
                <div className="header-actions">
                    <IconButton
                        icon={CircleHelp}
                        label="Help and installation"
                        onClick={() => setHelp(true)}
                    />
                    <IconButton
                        icon={Settings2}
                        label="Quick settings"
                        onClick={() => setSettings(true)}
                    />
                    <span className="header-rule" />
                    <button
                        className="account-avatar"
                        aria-label={`${initials(user.name)} · Account and mailboxes`}
                        onClick={() => setAccount(true)}
                    >
                        {initials(user.name)}
                    </button>
                </div>
            </header>
            <aside className="mail-sidebar">{navigation}</aside>
            <main id="mail-main" className="mail-surface" tabIndex={-1}>
                <div
                    className={`mail-toolbar ${selected.length && !thread ? 'selection-active' : ''}`}
                >
                    {thread ? (
                        <IconButton
                            icon={ArrowLeft}
                            label="Back to messages"
                            onClick={back}
                        />
                    ) : selected.length > 0 ? (
                        <IconButton
                            icon={X}
                            label="Clear selection"
                            onClick={() => {
                                const firstSelected = selected[0];
                                setSelected([]);
                                requestAnimationFrame(() => {
                                    (
                                        document.getElementById(
                                            `open-${firstSelected}`,
                                        ) ??
                                        document.getElementById('mail-main')
                                    )?.focus({ preventScroll: true });
                                });
                            }}
                            disabled={busy}
                        />
                    ) : (
                        <label className="select-all">
                            <input
                                type="checkbox"
                                aria-label="Select current page"
                                checked={
                                    messages.length > 0 &&
                                    messages.every((message) =>
                                        selected.includes(message.id),
                                    )
                                }
                                onChange={() =>
                                    setSelected(
                                        messages.every((message) =>
                                            selected.includes(message.id),
                                        )
                                            ? []
                                            : messages.map((m) => m.id),
                                    )
                                }
                            />
                        </label>
                    )}
                    {actions.length > 0 ? (
                        <>
                            <span className="selection-scope">
                                {!thread && (
                                    <>
                                        <span>{selected.length} selected</span>
                                        <small>on this page</small>
                                    </>
                                )}
                            </span>
                            <IconButton
                                icon={Archive}
                                label={
                                    thread
                                        ? thread.pagination.total > 30
                                            ? 'Archive visible messages'
                                            : 'Archive conversation'
                                        : 'Archive selected'
                                }
                                onClick={() => void mutate('archive', actions)}
                                disabled={busy}
                            />
                            <IconButton
                                icon={Trash2}
                                label={
                                    canPurge
                                        ? 'Delete selected permanently'
                                        : thread
                                          ? thread.pagination.total > 30
                                              ? 'Trash visible messages'
                                              : 'Trash conversation'
                                          : 'Trash selected'
                                }
                                onClick={() =>
                                    canPurge
                                        ? confirmPurge()
                                        : void mutate('trash', actions)
                                }
                                disabled={busy}
                            />
                            <span className="toolbar-divider" />
                            <IconButton
                                icon={Mail}
                                label="Mark unread"
                                onClick={() => void mutate('unread', actions)}
                                disabled={busy}
                            />
                            <IconButton
                                icon={MoreHorizontal}
                                label="More message actions"
                                onClick={() => setMore(true)}
                            />
                        </>
                    ) : (
                        <>
                            <IconButton
                                icon={RefreshCw}
                                label="Refresh mail"
                                disabled={busy}
                                onClick={() => {
                                    setBusy(true);
                                    void api<{
                                        imported: number;
                                        held: number;
                                        simulated: boolean;
                                    }>('/sync', 'POST')
                                        .then((result) => {
                                            setToast({
                                                message: result.simulated
                                                    ? 'Local inbox refreshed. No live provider connected.'
                                                    : `${result.imported} imported · ${result.held} awaiting recovery`,
                                            });
                                            router.reload({
                                                only: [
                                                    'messages',
                                                    'counts',
                                                    'mailbox',
                                                ],
                                            });
                                        })
                                        .catch((e) =>
                                            setToast({
                                                message: e.message,
                                                error: true,
                                            }),
                                        )
                                        .finally(() => setBusy(false));
                                }}
                            />
                            <div className="filter-buttons">
                                <button
                                    className={!filters.unread ? 'active' : ''}
                                    onClick={() =>
                                        visit(listUrl({ unread: '', page: 1 }))
                                    }
                                >
                                    All
                                </button>
                                <button
                                    className={filters.unread ? 'active' : ''}
                                    onClick={() =>
                                        visit(listUrl({ unread: '1', page: 1 }))
                                    }
                                >
                                    Unread
                                </button>
                            </div>
                        </>
                    )}
                    <div className="toolbar-right">
                        {pagination && (
                            <span>
                                {pagination.total
                                    ? `${pagination.from}–${pagination.to} of ${pagination.total}`
                                    : '0 messages'}
                            </span>
                        )}
                        {!thread && (
                            <>
                                <IconButton
                                    icon={ChevronLeft}
                                    label="Previous page"
                                    disabled={!pagination?.prev}
                                    onClick={() =>
                                        pagination?.prev &&
                                        visit(pagination.prev)
                                    }
                                />
                                <IconButton
                                    icon={ChevronRight}
                                    label="Next page"
                                    disabled={!pagination?.next}
                                    onClick={() =>
                                        pagination?.next &&
                                        visit(pagination.next)
                                    }
                                />
                            </>
                        )}
                        <span className="mobile-settings">
                            <IconButton
                                icon={Settings2}
                                label="Quick settings"
                                onClick={() => setSettings(true)}
                            />
                        </span>
                    </div>
                </div>
                <div
                    className={`mail-content ${prefs.pane === 'right' ? 'pane-enabled' : ''} ${thread ? 'has-thread' : ''}`}
                >
                    {(!thread || prefs.pane === 'right') && list}
                    {reader}
                </div>
            </main>
            <button
                className="mobile-compose compose-button"
                onClick={() => mailbox && void compose.open(mailbox.id)}
            >
                <Pencil size={22} />
                Compose
            </button>
            {toast && (
                <div
                    className={`toast ${toast.error ? 'toast-error' : ''}`}
                    role={toast.error ? 'alert' : 'status'}
                >
                    <span>{toast.message}</span>
                    {toast.operation && (
                        <button onClick={() => void undo()}>Undo</button>
                    )}
                    <IconButton
                        icon={X}
                        label="Dismiss notification"
                        onClick={() => setToast(null)}
                    />
                </div>
            )}
            <Sheet
                open={drawer}
                onClose={() => setDrawer(false)}
                title="WebMail"
                side="left"
            >
                <div className="drawer-navigation">
                    {navigation}
                    <button
                        className="nav-item"
                        onClick={() => {
                            setDrawer(false);
                            void api<{
                                imported: number;
                                held: number;
                                simulated: boolean;
                            }>('/sync', 'POST')
                                .then((r) => {
                                    setToast({
                                        message: r.simulated
                                            ? 'Local simulator checked · no live connection'
                                            : `${r.imported} imported · ${r.held} held for review`,
                                    });
                                    router.reload();
                                })
                                .catch((e) =>
                                    setToast({
                                        message: e.message,
                                        error: true,
                                    }),
                                );
                        }}
                    >
                        <RefreshCw size={19} />
                        Refresh mail
                    </button>
                    <button
                        className="nav-item"
                        onClick={() => {
                            setDrawer(false);
                            setHelp(true);
                        }}
                    >
                        <CircleHelp size={19} />
                        Help and installation
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={settings}
                onClose={() => setSettings(false)}
                title="Quick settings"
            >
                <p className="sheet-description">
                    Make a little room for the way you work.
                </p>
                <fieldset>
                    <legend>Appearance</legend>
                    <div className="theme-options">
                        {(['light', 'dark', 'system'] as const).map((theme) => (
                            <button
                                key={theme}
                                className={`theme-option ${prefs.theme === theme ? 'chosen' : ''}`}
                                aria-pressed={prefs.theme === theme}
                                onClick={() => void preference({ theme })}
                            >
                                <span
                                    className={`theme-preview theme-${theme}`}
                                >
                                    <i />
                                    <i />
                                    <i />
                                </span>
                                {theme[0].toUpperCase() + theme.slice(1)}
                                {prefs.theme === theme && <Check size={14} />}
                            </button>
                        ))}
                    </div>
                </fieldset>
                <fieldset>
                    <legend>Density</legend>
                    {(['comfortable', 'compact'] as const).map((density) => (
                        <label className="radio-row" key={density}>
                            <input
                                type="radio"
                                name="density"
                                checked={prefs.density === density}
                                onChange={() => void preference({ density })}
                            />
                            <span>
                                {density === 'comfortable'
                                    ? 'Comfortable'
                                    : 'Compact'}
                                <small>
                                    {density === 'comfortable'
                                        ? 'A little more breathing room'
                                        : 'More messages at a glance'}
                                </small>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <fieldset>
                    <legend>Reading pane</legend>
                    {(['none', 'right'] as const).map((pane) => (
                        <label className="radio-row" key={pane}>
                            <input
                                type="radio"
                                name="pane"
                                checked={prefs.pane === pane}
                                onChange={() => void preference({ pane })}
                            />
                            <span>
                                {pane === 'none'
                                    ? 'No split'
                                    : 'Right of inbox'}
                            </span>
                        </label>
                    ))}
                    <p className="field-help">
                        On smaller screens, conversations always open
                        full-screen.
                    </p>
                </fieldset>
                <fieldset>
                    <legend>Swipe actions</legend>
                    {(['swipe_left', 'swipe_right'] as const).map(
                        (direction) => (
                            <label className="stacked-label" key={direction}>
                                {direction === 'swipe_left'
                                    ? 'Swipe left'
                                    : 'Swipe right'}
                                <select
                                    value={prefs[direction]}
                                    onChange={(e) =>
                                        void preference({
                                            [direction]: e.target.value,
                                        })
                                    }
                                >
                                    <option value="archive">Archive</option>
                                    <option value="read">
                                        Mark read / unread
                                    </option>
                                    <option value="none">Off</option>
                                </select>
                            </label>
                        ),
                    )}
                </fieldset>
            </Sheet>
            <Sheet
                open={account}
                onClose={() => setAccount(false)}
                title="Your account"
                side="bottom"
            >
                <div className="account-summary">
                    <span className="account-avatar">
                        {initials(user.name)}
                    </span>
                    <div>
                        <strong>{user.name}</strong>
                        <p>{user.email}</p>
                    </div>
                </div>
                <h3>Mailboxes</h3>
                {mailboxes.map((box) => (
                    <Link
                        className="mailbox-option"
                        key={box.id}
                        href={`/mail/${box.id}`}
                        onClick={() => setAccount(false)}
                    >
                        <Mail size={19} />
                        <span>
                            {box.name}
                            <small>{box.email}</small>
                        </span>
                        {box.id === mailbox?.id && <Check size={17} />}
                    </Link>
                ))}
                <div className="account-links">
                    <Link href="/settings/security" onClick={rememberMail}>
                        Password & two-factor authentication
                    </Link>
                    {['owner', 'admin'].includes(String(user.role)) && (
                        <Link href="/admin" onClick={rememberMail}>
                            Administration
                        </Link>
                    )}
                    <button
                        className="secondary"
                        onClick={() => {
                            void compose.close().then((ok) => {
                                if (ok) {
                                    router.clearHistory();
                                    router.post(
                                        '/logout',
                                        {},
                                        {
                                            onSuccess: () => {
                                                window.location.assign(
                                                    '/login',
                                                );
                                            },
                                        },
                                    );
                                }
                            });
                        }}
                    >
                        Sign out
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={searchOptions}
                onClose={() => setSearchOptions(false)}
                title="Search options"
                side="bottom"
            >
                <p>
                    Search sender names, recipients, and subjects in this
                    mailbox. New searches include all mail except Spam and
                    Trash.
                </p>
                <div className="search-scope-field">
                    <label htmlFor="search-scope">Search scope</label>
                    <select
                        id="search-scope"
                        value={filters.folder}
                        onChange={(event) => {
                            visit(
                                listUrl({
                                    folder: event.target.value,
                                    page: 1,
                                }),
                            );
                            setSearchOptions(false);
                        }}
                    >
                        <option value="all">
                            All mail except Spam and Trash
                        </option>
                        {folders
                            .filter(([key]) => key !== 'drafts')
                            .map(([key, name]) => (
                                <option key={key} value={key}>
                                    {name}
                                </option>
                            ))}
                    </select>
                </div>
                <label className="radio-row">
                    <input
                        type="checkbox"
                        checked={filters.unread}
                        onChange={(e) => {
                            visit(
                                listUrl({
                                    unread: e.target.checked ? '1' : '',
                                    page: 1,
                                }),
                            );
                            setSearchOptions(false);
                        }}
                    />
                    Unread only
                </label>
            </Sheet>
            <Sheet
                open={mobileSearch}
                onClose={() => {
                    setMobileSearch(false);
                    router.replace({
                        url: listUrl(),
                        preserveState: true,
                        preserveScroll: true,
                    });
                }}
                title="Search mail"
            >
                <form
                    className="mobile-search-form"
                    onSubmit={(e) => {
                        e.preventDefault();
                        search();
                    }}
                >
                    <label>
                        Sender, recipient or subject
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search this mailbox"
                        />
                    </label>
                    <button className="primary" type="submit">
                        <Search size={18} />
                        Search
                    </button>
                </form>
                <p className="field-help">
                    Only mailboxes you belong to are searchable.
                </p>
            </Sheet>
            <Sheet
                open={more}
                onClose={() => setMore(false)}
                title="Message actions"
                side="bottom"
            >
                <div className="action-menu">
                    {thread && thread.pagination.total > 30 && (
                        <p className="field-help">
                            Actions affect only the {thread.messages.length}{' '}
                            messages on this conversation page.
                        </p>
                    )}
                    <button onClick={() => void mutate('read', actions)}>
                        <MailOpen size={19} />
                        Mark read
                    </button>
                    <button onClick={() => void mutate('unread', actions)}>
                        <Mail size={19} />
                        Mark unread
                    </button>
                    <button onClick={() => void mutate('inbox', actions)}>
                        <Inbox size={19} />
                        Move to Inbox
                    </button>
                    <button onClick={() => void mutate('spam', actions)}>
                        <TriangleAlert size={19} />
                        Move to Spam
                    </button>
                    {canPurge && (
                        <button className="error-text" onClick={confirmPurge}>
                            <Trash2 size={19} />
                            Delete permanently
                        </button>
                    )}
                    <label>
                        Label
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            maxLength={32}
                            placeholder="e.g. Projects"
                        />
                    </label>
                    <button
                        className="secondary"
                        onClick={() => void mutate('label', actions)}
                    >
                        <Tag size={18} />
                        {label ? 'Apply label' : 'Clear label'}
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={purgeIds.length > 0}
                onClose={() => {
                    if (!busy) setPurgeIds([]);
                }}
                title="Permanently delete these messages?"
                side="bottom"
            >
                <p>
                    The {purgeIds.length} selected Trash{' '}
                    {purgeIds.length === 1 ? 'message' : 'messages'}, including
                    original content and attachments, will be deleted. This
                    cannot be undone. Other mail and drafts are retained.
                </p>
                <form
                    className="admin-form"
                    onSubmit={async (event) => {
                        event.preventDefault();
                        if (!mailbox || busy || purgeConfirmation !== 'DELETE')
                            return;
                        setBusy(true);
                        setPurgeError('');
                        try {
                            const result = await api<{ deleted: number }>(
                                `${base}/trash`,
                                'DELETE',
                                {
                                    ids: purgeIds,
                                    confirmation: purgeConfirmation,
                                },
                            );
                            setPurgeIds([]);
                            setSelected([]);
                            setToast({
                                message: `${result.deleted} ${result.deleted === 1 ? 'message' : 'messages'} permanently deleted.`,
                            });
                            visit(listUrl());
                        } catch (cause) {
                            setPurgeError(
                                `Deletion not confirmed. Refresh Trash before trying again. ${(cause as Error).message}`,
                            );
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <label>
                        Type DELETE to confirm
                        <input
                            value={purgeConfirmation}
                            onChange={(event) =>
                                setPurgeConfirmation(event.target.value)
                            }
                            autoComplete="off"
                            spellCheck={false}
                            required
                            disabled={busy}
                        />
                    </label>
                    {purgeError && (
                        <p role="alert" className="error-text">
                            {purgeError}
                        </p>
                    )}
                    <div className="button-row">
                        <button
                            type="button"
                            className="secondary"
                            onClick={() => setPurgeIds([])}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                        <button
                            className="danger-button"
                            disabled={busy || purgeConfirmation !== 'DELETE'}
                        >
                            {busy ? 'Deleting…' : 'Delete permanently'}
                        </button>
                    </div>
                </form>
            </Sheet>
            <Sheet
                open={!!detail}
                onClose={() => setDetail(null)}
                title="Message details"
                side="bottom"
            >
                {detail && (
                    <>
                        <dl className="message-details">
                            <dt>From</dt>
                            <dd>
                                {detail.from_name} &lt;{detail.from_email}&gt;
                            </dd>
                            <dt>To</dt>
                            <dd>{detail.to.join(', ')}</dd>
                            {detail.cc.length > 0 && (
                                <>
                                    <dt>Cc</dt>
                                    <dd>{detail.cc.join(', ')}</dd>
                                </>
                            )}
                            <dt>Date</dt>
                            <dd>
                                {new Date(detail.created_at).toLocaleString()}
                            </dd>
                            <dt>Subject</dt>
                            <dd>{detail.subject || '(No subject)'}</dd>
                        </dl>
                        <a
                            className="secondary"
                            href={`/messages/${detail.id}/original`}
                            download
                        >
                            <Download size={18} />
                            Download original (.eml)
                        </a>
                        <p className="field-help">
                            Contains the original message, including any
                            attachments. Only open files you trust.
                        </p>
                    </>
                )}
            </Sheet>
            <Sheet
                open={help}
                onClose={() => setHelp(false)}
                title="A quieter place for your mail"
            >
                <p>
                    WebMail is a private, limited free-tier pilot. Your
                    administrator creates your account and manages providers.
                </p>
                <h3>Install on your device</h3>
                <p>
                    Where supported, use your browser’s Install app option. On
                    iPhone Safari, use Share → Add to Home Screen. Installation
                    and standalone behavior depend on your browser.
                </p>
                <h3>When you’re offline</h3>
                <p>
                    Mail requires a connection. Unsaved drafts stay in the open
                    window only. Keep it open and reconnect before closing.
                </p>
                <h3>Sending limits</h3>
                <p>
                    The organization shares its sending allowance. Attachments
                    are off and complete messages are limited to 256 KiB.
                </p>
                {simulation && (
                    <p className="notice">
                        This local pilot uses fictional messages and a
                        deterministic provider. No real email is sent.
                    </p>
                )}
            </Sheet>
        </div>
    );
}
function Empty({ title, description }: { title: string; description: string }) {
    return (
        <div className="empty-state">
            <Inbox size={38} strokeWidth={1.2} />
            <h2>{title}</h2>
            <p>{description}</p>
        </div>
    );
}
function MessageRow({
    message,
    selected,
    index,
    preferences,
    onSelect,
    onOpen,
    onAction,
    disabled,
}: {
    disabled: boolean;
    message: Message;
    selected: boolean;
    index: number;
    preferences: Preferences;
    onSelect: () => void;
    onOpen: () => void;
    onAction: (action: string) => void;
}) {
    const pointer = useRef<{ x: number; y: number } | null>(null),
        [drag, setDrag] = useState(0);
    return (
        <li
            className={`message-row ${!message.is_read ? 'unread' : ''} ${selected ? 'selected' : ''} ${drag ? 'swiping' : ''}`}
            onPointerDown={(e) => {
                if (
                    e.pointerType === 'touch' &&
                    e.clientX > 24 &&
                    e.clientX < innerWidth - 24
                )
                    pointer.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={(e) => {
                if (!pointer.current) return;
                const x = e.clientX - pointer.current.x,
                    y = e.clientY - pointer.current.y;
                if (Math.abs(y) > 18 && Math.abs(y) > Math.abs(x)) {
                    pointer.current = null;
                    setDrag(0);
                    return;
                }
                if (Math.abs(x) > 24 && Math.abs(x) > Math.abs(y) * 1.7)
                    setDrag(Math.max(-110, Math.min(110, x)));
            }}
            onPointerCancel={() => {
                pointer.current = null;
                setDrag(0);
            }}
            onPointerUp={() => {
                if (Math.abs(drag) > 75) {
                    const action =
                        drag < 0
                            ? preferences.swipe_left
                            : preferences.swipe_right;
                    if (action !== 'none')
                        onAction(
                            action === 'read'
                                ? message.is_read
                                    ? 'unread'
                                    : 'read'
                                : action,
                        );
                }
                pointer.current = null;
                setDrag(0);
            }}
        >
            <span className="swipe-label" aria-hidden="true">
                {drag < 0
                    ? preferences.swipe_left === 'archive'
                        ? 'Archive'
                        : 'Mark read / unread'
                    : preferences.swipe_right === 'archive'
                      ? 'Archive'
                      : 'Mark read / unread'}
            </span>
            <div
                className="row-inner"
                style={
                    drag ? { transform: `translateX(${drag}px)` } : undefined
                }
            >
                <label className="row-select">
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={onSelect}
                        aria-label={`Select ${message.subject || '(No subject)'}`}
                    />
                    <span
                        className={`row-avatar avatar-${index % 5}`}
                        aria-hidden="true"
                    >
                        {selected ? (
                            <Check size={19} />
                        ) : (
                            initials(message.from_name || message.from_email)
                        )}
                    </span>
                </label>
                <button
                    className={`row-star ${message.starred ? 'starred' : ''}`}
                    aria-label={
                        message.starred ? 'Unstar message' : 'Star message'
                    }
                    onClick={() =>
                        onAction(message.starred ? 'unstar' : 'star')
                    }
                >
                    <Star size={18} strokeWidth={1.6} />
                </button>
                <button
                    disabled={disabled}
                    className="row-open"
                    id={`open-${message.id}`}
                    onClick={() => {
                        if (Math.abs(drag) < 24) onOpen();
                    }}
                >
                    <span className="row-sender">
                        {message.from_name || message.from_email}
                    </span>
                    <span className="row-content">
                        {message.labels?.[0] && (
                            <span
                                className={`message-label label-${index % 3}`}
                            >
                                {message.labels[0]}
                            </span>
                        )}
                        <span
                            className="row-subject"
                            id={`subject-${message.id}`}
                        >
                            <span className="sr-only">Open conversation: </span>
                            {message.subject || '(No subject)'}
                        </span>
                        <span className="row-dash"> — </span>
                        <span className="row-snippet">
                            {message.body_text
                                .replace(/\s+/g, ' ')
                                .slice(0, 180)}
                        </span>
                    </span>
                    <time title={new Date(message.created_at).toLocaleString()}>
                        {dates(message.created_at)}
                    </time>
                </button>
                <div className="row-hover-actions">
                    <IconButton
                        icon={Archive}
                        label={`Archive ${message.subject || 'message'}`}
                        onClick={() => onAction('archive')}
                    />
                    <IconButton
                        icon={message.is_read ? Mail : MailOpen}
                        label={
                            message.is_read
                                ? 'Mark message unread'
                                : 'Mark message read'
                        }
                        onClick={() =>
                            onAction(message.is_read ? 'unread' : 'read')
                        }
                    />
                </div>
            </div>
        </li>
    );
}
