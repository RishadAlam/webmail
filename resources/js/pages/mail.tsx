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
    Clock,
    Flag,
    Mails,
    Paperclip,
    Plus,
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
    initials,
    type MailProps,
    type Message,
    type Preferences,
    type MailLabel,
} from '@/lib/mail';
import { Brand, IconButton, Sheet } from '@/components/postroom/ui';
import { useCompose } from '@/components/postroom/compose';
import { MessageAttachments } from '@/components/postroom/attachments';
import { SearchOptions } from '@/components/postroom/search-options';
import { useMailNavigation } from '@/lib/mail-navigation';
import { useMailPreferences } from '@/lib/mail-preferences';
import { mailThemes } from '@/lib/mail-themes';
const folders = [
    ['inbox', 'Inbox', Inbox],
    ['starred', 'Starred', Star],
    ['important', 'Important', Flag],
    ['snoozed', 'Snoozed', Clock],
    ['sent', 'Sent', Send],
    ['drafts', 'Drafts', FilePenLine],
    ['archive', 'Archive', Archive],
    ['all', 'All mail', Mails],
    ['spam', 'Spam', TriangleAlert],
    ['trash', 'Trash', Trash2],
] as const;
const categories = [
    ['primary', 'Primary'],
    ['promotions', 'Promotions'],
    ['social', 'Social'],
    ['updates', 'Updates'],
    ['forums', 'Forums'],
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
    const { preferences: prefs, updatePreferences } = useMailPreferences();
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
    const [snooze, setSnooze] = useState(false);
    const [snoozeDate, setSnoozeDate] = useState('');
    const [labelId, setLabelId] = useState('');
    const [categoryTarget, setCategoryTarget] = useState('primary');
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
        [selected, setSelected] = useState<number[]>([]);
    const [toast, setToast] = useState<{
            message: string;
            operation?: string;
            error?: boolean;
        } | null>(null),
        [busy, setBusy] = useState(false),
        [more, setMore] = useState(false),
        [detail, setDetail] = useState<Message | null>(null),
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
            label: filters.label ?? '',
            category: filters.category ?? '',
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
    }, [
        mailbox?.id,
        filters.folder,
        filters.q,
        filters.page,
        filters.unread,
        filters.label,
        filters.category,
    ]);
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
        try {
            await updatePreferences(patch);
            if (patch.inbox_order || patch.page_size)
                visit(listUrl({ page: 1 }));
        } catch (e) {
            setToast({ message: (e as Error).message, error: true });
        }
    };
    const mutate = async (
        action: string,
        ids = selected,
        extra: Record<string, unknown> = {},
    ) => {
        if (!mailbox || !ids.length || mutating.current) return;
        mutating.current = true;
        setBusy(true);
        try {
            const result = await api<{ operation: string }>(
                `${base}/actions`,
                'POST',
                { action, ids, ...extra },
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
            setSnooze(false);
            if (
                thread &&
                ['archive', 'trash', 'spam', 'unread', 'snooze'].includes(
                    action,
                )
            ) {
                const currentIndex = messages.findIndex(
                    (message) => message.thread_id === thread.id,
                );
                const next =
                    currentIndex < 0
                        ? undefined
                        : (prefs.auto_advance === 'previous'
                              ? messages.slice(0, currentIndex).reverse()
                              : messages.slice(currentIndex + 1)
                          ).find((message) => message.thread_id !== thread.id);
                if (
                    prefs.auto_advance !== 'list' &&
                    next &&
                    next.thread_id !== thread.id
                )
                    openThread(next);
                else back();
            } else
                router.reload({
                    only: [
                        'messages',
                        'thread',
                        'counts',
                        'labels',
                        'pagination',
                    ],
                });
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
            router.reload({
                only: ['messages', 'thread', 'counts', 'pagination', 'labels'],
            });
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
                label: '',
                category: '',
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
                        className={`nav-item ${filters.folder === key && !filters.label ? 'active' : ''}`}
                        onClick={() => setDrawer(false)}
                        aria-current={
                            filters.folder === key && !filters.label
                                ? 'page'
                                : undefined
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
            <div className="nav-label-heading">
                <span>Labels</span>
                <Link
                    href={`/settings/organization/${mailbox?.id ?? ''}`}
                    aria-label="Manage labels and filters"
                    onClick={rememberMail}
                >
                    <Plus size={18} />
                </Link>
            </div>
            <nav aria-label="Labels">
                {(props.labels ?? []).map((item) => (
                    <Link
                        key={item.id}
                        href={`${base}?folder=all&label=${item.id}`}
                        preserveState
                        preserveScroll
                        onClick={() => setDrawer(false)}
                        className={`nav-item ${filters.label === item.id ? 'active' : ''}`}
                        aria-current={
                            filters.label === item.id ? 'page' : undefined
                        }
                        title={item.name}
                    >
                        <Tag size={18} style={{ color: item.color }} />
                        <span className="ellipsis">{item.name}</span>
                    </Link>
                ))}
                <Link
                    className="nav-item manage-labels"
                    href={`/settings/organization/${mailbox?.id ?? ''}`}
                    onClick={rememberMail}
                >
                    <SlidersHorizontal size={18} />
                    <span>Labels & filters</span>
                </Link>
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
    const actionMessages = thread
        ? thread.messages
        : messages.filter((message) => selected.includes(message.id));
    const canSnooze =
        actionMessages.length > 0 &&
        actionMessages.every((message) =>
            ['inbox', 'archive', 'snoozed'].includes(message.folder),
        );
    const canUnsnooze =
        actionMessages.length > 0 &&
        actionMessages.every((message) => message.folder === 'snoozed');
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
    useEffect(() => {
        if (!prefs.keyboard_shortcuts) return;
        const shortcut = (event: KeyboardEvent) => {
            const target =
                event.target instanceof HTMLElement ? event.target : null;
            if (
                event.isComposing ||
                event.repeat ||
                event.ctrlKey ||
                event.metaKey ||
                event.altKey ||
                target?.closest(
                    'input, textarea, select, [contenteditable="true"]',
                ) ||
                document.querySelector('[role="dialog"]')
            )
                return;
            const focused = Number(
                document.activeElement?.id.replace('open-', ''),
            );
            const index = messages.findIndex(
                (message) => message.id === focused,
            );
            const currentMessage = messages[index];
            if (event.key === 'c' && mailbox) {
                event.preventDefault();
                void compose.open(mailbox.id);
            } else if (event.key === '/') {
                event.preventDefault();
                document
                    .querySelector<HTMLInputElement>('.search-bar input')
                    ?.focus();
            } else if (event.key === '?') {
                event.preventDefault();
                setHelp(true);
            } else if (!thread && (event.key === 'j' || event.key === 'k')) {
                event.preventDefault();
                const next =
                    messages[
                        Math.max(
                            0,
                            Math.min(
                                messages.length - 1,
                                index + (event.key === 'j' ? 1 : -1),
                            ),
                        )
                    ];
                if (next) document.getElementById(`open-${next.id}`)?.focus();
            } else if (!thread && event.key === 'x' && currentMessage) {
                event.preventDefault();
                setSelected((previous) =>
                    previous.includes(focused)
                        ? previous.filter((id) => id !== focused)
                        : [...previous, focused],
                );
            } else if (
                event.key === 'e' &&
                (actions.length || currentMessage)
            ) {
                event.preventDefault();
                void mutate('archive', actions.length ? actions : [focused]);
            } else if (event.key === 's' && currentMessage) {
                event.preventDefault();
                void mutate(currentMessage.starred ? 'unstar' : 'star', [
                    focused,
                ]);
            }
        };
        window.addEventListener('keydown', shortcut);
        return () => window.removeEventListener('keydown', shortcut);
    });
    const list = (
        <div className="message-list" ref={scroll} {...{ 'scroll-region': '' }}>
            <div className="list-title">
                <h1>
                    {filters.label
                        ? (props.labels?.find(
                              (item) => item.id === filters.label,
                          )?.name ?? 'Label')
                        : filters.q
                          ? 'Search results'
                          : (folders.find(
                                (f) => f[0] === filters.folder,
                            )?.[1] ?? 'All mail')}
                </h1>
                <span>
                    {filters.q
                        ? `Results for “${filters.q}”`
                        : filters.folder === 'inbox'
                          ? 'A little room to focus.'
                          : `${pagination?.total ?? drafts.length} messages`}
                </span>
            </div>
            {(props.search_error || page.props.errors.q) && (
                <p className="mail-search-error" role="alert">
                    {props.search_error || page.props.errors.q}
                </p>
            )}
            {filters.folder === 'snoozed' && (
                <p className="mail-view-note">
                    Snoozed messages return to your inbox when you next open or
                    refresh WebMail after the chosen time.
                </p>
            )}
            {filters.folder === 'inbox' && !filters.q && !filters.label && (
                <nav className="category-tabs" aria-label="Inbox categories">
                    <button
                        className={!filters.category ? 'active' : ''}
                        aria-pressed={!filters.category}
                        onClick={() =>
                            visit(listUrl({ category: '', page: 1 }))
                        }
                    >
                        All categories
                    </button>
                    {categories.map(([key, name]) => (
                        <button
                            key={key}
                            className={filters.category === key ? 'active' : ''}
                            aria-pressed={filters.category === key}
                            onClick={() =>
                                visit(listUrl({ category: key, page: 1 }))
                            }
                        >
                            {name}
                        </button>
                    ))}
                </nav>
            )}
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
                            labels={props.labels ?? []}
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
            {pagination && (pagination.next || pagination.prev) && (
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
                    {message.has_attachments && (
                        <MessageAttachments messageId={message.id} />
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
                            prefs.default_reply,
                        )
                    }
                >
                    {prefs.default_reply === 'reply-all' ? (
                        <ReplyAll size={18} />
                    ) : (
                        <Reply size={18} />
                    )}
                    {prefs.default_reply === 'reply-all'
                        ? 'Reply all'
                        : 'Reply'}
                </button>
                <button
                    className="secondary"
                    onClick={() =>
                        mailbox &&
                        void compose.open(
                            mailbox.id,
                            thread.messages.at(-1)?.id,
                            prefs.default_reply === 'reply-all'
                                ? 'reply'
                                : 'reply-all',
                        )
                    }
                >
                    {prefs.default_reply === 'reply-all' ? (
                        <Reply size={18} />
                    ) : (
                        <ReplyAll size={18} />
                    )}
                    {prefs.default_reply === 'reply-all'
                        ? 'Reply'
                        : 'Reply all'}
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
            <Head
                title={`${prefs.unread_badge && counts.unread ? `(${counts.unread}) ` : ''}${thread?.subject || filters.folder || 'Mail'}`}
            />
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
                        maxLength={200}
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
                    className={`mail-content ${prefs.pane !== 'none' ? 'pane-enabled' : ''} ${prefs.pane === 'bottom' ? 'pane-bottom' : ''} ${thread ? 'has-thread' : ''}`}
                >
                    {(!thread || prefs.pane !== 'none') && list}
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
                branded
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
                <Link
                    href="/settings/mail"
                    className="secondary all-settings-link"
                    onClick={() => {
                        rememberMail();
                        setSettings(false);
                    }}
                >
                    See all settings <ArrowRight size={17} />
                </Link>
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
                    <legend>Theme</legend>
                    <div className="palette-swatches">
                        {mailThemes.map(({ value, name }) => (
                            <button
                                key={value}
                                type="button"
                                className="palette-swatch"
                                aria-label={`${name} theme`}
                                title={name}
                                aria-pressed={prefs.palette === value}
                                onClick={() =>
                                    void preference({ palette: value })
                                }
                            >
                                <span
                                    className="palette-preview"
                                    data-palette={value}
                                    aria-hidden="true"
                                >
                                    {prefs.palette === value && (
                                        <Check size={17} />
                                    )}
                                </span>
                            </button>
                        ))}
                    </div>
                    <Link
                        href="/settings/themes"
                        className="theme-gallery-link"
                        onClick={() => {
                            rememberMail();
                            setSettings(false);
                        }}
                    >
                        View all themes <ArrowRight size={16} />
                    </Link>
                </fieldset>
                <fieldset>
                    <legend>Density</legend>
                    {(['default', 'comfortable', 'compact'] as const).map(
                        (density) => (
                            <label className="radio-row" key={density}>
                                <input
                                    type="radio"
                                    name="density"
                                    checked={prefs.density === density}
                                    onChange={() =>
                                        void preference({ density })
                                    }
                                />
                                <span>
                                    {density === 'default'
                                        ? 'Default'
                                        : density === 'comfortable'
                                          ? 'Comfortable'
                                          : 'Compact'}
                                    <small>
                                        {density === 'default'
                                            ? 'More space for each message'
                                            : density === 'comfortable'
                                              ? 'A little more breathing room'
                                              : 'More messages at a glance'}
                                    </small>
                                </span>
                            </label>
                        ),
                    )}
                </fieldset>
                <fieldset>
                    <legend>Reading pane</legend>
                    {(['none', 'right', 'bottom'] as const).map((pane) => (
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
                                    : pane === 'right'
                                      ? 'Right of inbox'
                                      : 'Below inbox'}
                            </span>
                        </label>
                    ))}
                    <p className="field-help">
                        On smaller screens, conversations always open
                        full-screen.
                    </p>
                </fieldset>
                <fieldset>
                    <legend>Inbox order</legend>
                    <label className="stacked-label">
                        Show first
                        <select
                            value={prefs.inbox_order}
                            onChange={(event) =>
                                void preference({
                                    inbox_order: event.target
                                        .value as Preferences['inbox_order'],
                                })
                            }
                        >
                            <option value="newest">Newest messages</option>
                            <option value="unread">Unread messages</option>
                            <option value="starred">Starred messages</option>
                            <option value="important">
                                Important messages
                            </option>
                        </select>
                    </label>
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
                    <Link href="/settings/mail" onClick={rememberMail}>
                        Mail settings
                    </Link>
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
                onClose={() => {
                    setSearchOptions(false);
                    if (
                        innerWidth < 768 &&
                        new URLSearchParams(location.search).get('view') ===
                            'search'
                    )
                        setMobileSearch(true);
                }}
                title="Search options"
                side="bottom"
            >
                <SearchOptions
                    query={query}
                    scope={query !== filters.q ? 'all' : filters.folder}
                    unread={filters.unread}
                    label={
                        props.labels.find((label) => label.id === filters.label)
                            ?.name ?? ''
                    }
                    category={filters.category ?? ''}
                    labels={props.labels.map((label) => label.name)}
                    onSearch={(text, fields, category) => {
                        setQuery(text);
                        setSearchOptions(false);
                        setMobileSearch(false);
                        visit(
                            listUrl({
                                q: text,
                                folder: fields.scope,
                                unread: fields.unread ? '1' : '',
                                label: '',
                                category,
                                page: 1,
                            }),
                        );
                    }}
                />
                <details className="search-syntax">
                    <summary>Search syntax</summary>
                    <p className="field-help">
                        Combine sender, subject, date and message state.
                        Searches stay within the current mailbox.
                    </p>
                    <dl className="search-examples">
                        <dt>From a person</dt>
                        <dd>
                            <code>from:person@example.com</code>
                        </dd>
                        <dt>Unread attachments</dt>
                        <dd>
                            <code>is:unread has:attachment</code>
                        </dd>
                        <dt>A date range</dt>
                        <dd>
                            <code>after:2026-10-01 before:2026-11-01</code>
                        </dd>
                        <dt>A label or phrase</dt>
                        <dd>
                            <code>
                                label:Projects subject:&quot;weekly notes&quot;
                            </code>
                        </dd>
                    </dl>
                </details>
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
                            maxLength={200}
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
                <button
                    className="secondary"
                    type="button"
                    onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        setMobileSearch(false);
                        setSearchOptions(true);
                    }}
                >
                    <SlidersHorizontal size={18} />
                    Search options
                </button>
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
                    <button onClick={() => void mutate('important', actions)}>
                        <Flag size={19} />
                        Mark important
                    </button>
                    <button onClick={() => void mutate('unimportant', actions)}>
                        <Flag size={19} />
                        Mark not important
                    </button>
                    {canSnooze && (
                        <button
                            onClick={() => {
                                setMore(false);
                                setSnooze(true);
                            }}
                        >
                            <Clock size={19} />
                            Snooze
                        </button>
                    )}
                    {canUnsnooze && (
                        <button
                            onClick={() => void mutate('unsnooze', actions)}
                        >
                            <Inbox size={19} />
                            Return snoozed to Inbox
                        </button>
                    )}
                    {canPurge && (
                        <button className="error-text" onClick={confirmPurge}>
                            <Trash2 size={19} />
                            Delete permanently
                        </button>
                    )}
                    <label>
                        Label
                        <select
                            aria-label="Label"
                            value={labelId}
                            onChange={(event) => setLabelId(event.target.value)}
                        >
                            <option value="">Choose a label</option>
                            {(props.labels ?? []).map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="button-row">
                        <button
                            className="secondary"
                            disabled={!labelId || busy}
                            onClick={() =>
                                void mutate('label', actions, {
                                    label_id: Number(labelId),
                                })
                            }
                        >
                            <Tag size={18} />
                            Apply label
                        </button>
                        <button
                            className="secondary"
                            disabled={!labelId || busy}
                            onClick={() =>
                                void mutate('remove-label', actions, {
                                    label_id: Number(labelId),
                                })
                            }
                        >
                            Remove label
                        </button>
                    </div>
                    <Link
                        className="text-link"
                        href={`/settings/organization/${mailbox?.id ?? ''}`}
                        onClick={rememberMail}
                    >
                        Create or manage labels
                    </Link>
                    <label>
                        Category
                        <select
                            aria-label="Category"
                            value={categoryTarget}
                            onChange={(event) =>
                                setCategoryTarget(event.target.value)
                            }
                        >
                            {categories.map(([value, name]) => (
                                <option key={value} value={value}>
                                    {name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                            void mutate('category', actions, {
                                category: categoryTarget,
                            })
                        }
                    >
                        Move to category
                    </button>
                </div>
            </Sheet>
            <Sheet
                open={snooze}
                onClose={() => setSnooze(false)}
                title="Snooze messages"
                side="bottom"
            >
                <p>
                    Move these messages out of the way until later. They will
                    return to your inbox when you next open or refresh WebMail
                    after the chosen time.
                </p>
                <div className="action-list">
                    <button
                        disabled={busy}
                        onClick={() =>
                            void mutate('snooze', actions, {
                                snoozed_until: new Date(
                                    Date.now() + 3_600_000,
                                ).toISOString(),
                            })
                        }
                    >
                        <Clock size={19} />
                        In one hour
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => {
                            const date = new Date();
                            date.setDate(date.getDate() + 1);
                            date.setHours(9, 0, 0, 0);
                            void mutate('snooze', actions, {
                                snoozed_until: date.toISOString(),
                            });
                        }}
                    >
                        <Clock size={19} />
                        Tomorrow at 9:00 AM
                    </button>
                </div>
                <form
                    className="admin-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const date = new Date(snoozeDate);
                        if (!Number.isNaN(date.valueOf()))
                            void mutate('snooze', actions, {
                                snoozed_until: date.toISOString(),
                            });
                    }}
                >
                    <label>
                        Choose date and time
                        <input
                            type="datetime-local"
                            required
                            value={snoozeDate}
                            onChange={(event) =>
                                setSnoozeDate(event.target.value)
                            }
                        />
                    </label>
                    <p className="field-help">
                        Your local time:{' '}
                        {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                        Organization changes are shared with this mailbox’s
                        members.
                    </p>
                    <button className="primary" disabled={busy || !snoozeDate}>
                        Snooze until this time
                    </button>
                </form>
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
                <a
                    href="/help/setup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="setup-guide-link"
                >
                    Setup guide <ArrowRight size={16} />
                    <span className="sr-only">(opens in a new tab)</span>
                </a>
                <p>
                    Step-by-step help for personal settings, accounts, your
                    domain and provider connections.
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
                    may total up to 128 KiB (PDF, images, and text). Complete
                    messages are limited to 256 KiB.
                </p>
                <h3>Keyboard shortcuts</h3>
                <p>
                    Enable shortcuts in{' '}
                    <Link href="/settings/mail" onClick={rememberMail}>
                        Mail settings
                    </Link>
                    . Shortcuts pause while you type or use a dialog.
                </p>
                <dl className="search-examples">
                    <dt>Compose / search</dt>
                    <dd>
                        <kbd>C</kbd> / <kbd>/</kbd>
                    </dd>
                    <dt>Next / previous message</dt>
                    <dd>
                        <kbd>J</kbd> / <kbd>K</kbd>
                    </dd>
                    <dt>Select / star</dt>
                    <dd>
                        <kbd>X</kbd> / <kbd>S</kbd>
                    </dd>
                    <dt>Archive / help</dt>
                    <dd>
                        <kbd>E</kbd> / <kbd>?</kbd>
                    </dd>
                </dl>
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
    labels,
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
    labels: MailLabel[];
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
                        {message.labels?.slice(0, 2).map((name) => (
                            <span
                                key={name}
                                className="message-label catalog-label"
                                style={{
                                    borderLeftColor:
                                        labels.find(
                                            (label) => label.name === name,
                                        )?.color ?? 'var(--text-muted)',
                                }}
                            >
                                {name}
                            </span>
                        ))}
                        {message.important && (
                            <Flag
                                size={14}
                                className="row-marker"
                                aria-label="Important"
                            />
                        )}
                        {message.has_attachments && (
                            <Paperclip
                                size={14}
                                className="row-marker"
                                aria-label="Has attachments"
                            />
                        )}
                        {message.snoozed_until && (
                            <Clock
                                size={14}
                                className="row-marker"
                                aria-label={`Snoozed until ${new Date(message.snoozed_until).toLocaleString()}`}
                            />
                        )}
                        <span
                            className="row-subject"
                            id={`subject-${message.id}`}
                        >
                            <span className="sr-only">Open conversation: </span>
                            {message.subject || '(No subject)'}
                        </span>
                        {preferences.snippets && (
                            <>
                                <span className="row-dash"> — </span>
                                <span className="row-snippet">
                                    {message.body_text
                                        .replace(/\s+/g, ' ')
                                        .slice(0, 180)}
                                </span>
                            </>
                        )}
                    </span>
                    <time title={new Date(message.created_at).toLocaleString()}>
                        {dates(message.created_at)}
                    </time>
                </button>
                {preferences.hover_actions && (
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
                        <IconButton
                            icon={Trash2}
                            label={`Trash ${message.subject || 'message'}`}
                            onClick={() => onAction('trash')}
                        />
                    </div>
                )}
            </div>
        </li>
    );
}
