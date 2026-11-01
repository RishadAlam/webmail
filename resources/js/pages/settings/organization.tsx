import { Head, Link, router } from '@inertiajs/react';
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, Pencil, Plus, ShieldBan, Tag, Trash2 } from 'lucide-react';
import { api, type Mailbox, type MailLabel } from '@/lib/mail';

type Rule = {
    id: number;
    name: string;
    enabled: boolean;
    predicates: { sender?: string; recipient?: string; subject?: string };
    actions: {
        archive?: boolean;
        read?: boolean;
        star?: boolean;
        important?: boolean;
        category?: string;
        label_id?: number;
    };
};
type Organization = {
    labels: MailLabel[];
    rules: Rule[];
    blocked_senders: { id: number; email: string }[];
};
type Props = Organization & { mailbox: Mailbox | null; mailboxes: Mailbox[] };
const colors = [
    '#0b57d0',
    '#146c2e',
    '#8a4b00',
    '#b3261e',
    '#7b4b94',
    '#52606d',
];
const categoryNames = ['primary', 'promotions', 'social', 'updates', 'forums'];

export default function OrganizationSettings(props: Props) {
    const [data, setData] = useState<Organization>(props);
    const [section, setSection] = useState<'labels' | 'filters' | 'blocked'>(
        'labels',
    );
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [error, setError] = useState('');
    const [editingLabel, setEditingLabel] = useState<MailLabel | null>(null);
    const [labelName, setLabelName] = useState('');
    const [labelColor, setLabelColor] = useState(colors[0]);
    const [deletingLabel, setDeletingLabel] = useState<number | null>(null);
    const [blockedEmail, setBlockedEmail] = useState('');
    const [editingRule, setEditingRule] = useState<number | null>(null);
    const [ruleName, setRuleName] = useState('');
    const [sender, setSender] = useState('');
    const [recipient, setRecipient] = useState('');
    const [subject, setSubject] = useState('');
    const [ruleActions, setRuleActions] = useState<Rule['actions']>({});
    const [showRule, setShowRule] = useState(false);
    const ruleBaseline = data.rules.find((rule) => rule.id === editingRule);
    const hasUnsaved =
        labelName !== (editingLabel?.name ?? '') ||
        (!!labelName && labelColor !== (editingLabel?.color ?? colors[0])) ||
        !!blockedEmail ||
        (showRule &&
            (ruleName !== (ruleBaseline?.name ?? '') ||
                sender !== (ruleBaseline?.predicates.sender ?? '') ||
                recipient !== (ruleBaseline?.predicates.recipient ?? '') ||
                subject !== (ruleBaseline?.predicates.subject ?? '') ||
                (['archive', 'read', 'star', 'important'] as const).some(
                    (key) =>
                        !!ruleActions[key] !== !!ruleBaseline?.actions[key],
                ) ||
                (ruleActions.category ?? '') !==
                    (ruleBaseline?.actions.category ?? '') ||
                (ruleActions.label_id ?? 0) !==
                    (ruleBaseline?.actions.label_id ?? 0)));
    useEffect(() => {
        if (!hasUnsaved && !busy) return;
        const unload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', unload);
        const stop = router.on('before', (event) => {
            if (
                busy ||
                !window.confirm(
                    'Leave organization settings? Your unsaved changes will be lost.',
                )
            )
                event.preventDefault();
        });
        return () => {
            stop();
            window.removeEventListener('beforeunload', unload);
        };
    }, [hasUnsaved, busy]);
    const base = `/mail/${props.mailbox?.id}`;
    const change = async (
        path: string,
        method: string,
        body: unknown,
        message: string,
    ) => {
        if (busy) return false;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            setData(await api<Organization>(`${base}/${path}`, method, body));
            setNotice(message);
            return true;
        } catch (cause) {
            setError((cause as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    };
    const resetRule = () => {
        setEditingRule(null);
        setRuleName('');
        setSender('');
        setRecipient('');
        setSubject('');
        setRuleActions({});
        setShowRule(false);
    };
    const editRule = (rule: Rule) => {
        setEditingRule(rule.id);
        setRuleName(rule.name);
        setSender(rule.predicates.sender ?? '');
        setRecipient(rule.predicates.recipient ?? '');
        setSubject(rule.predicates.subject ?? '');
        setRuleActions(rule.actions);
        setShowRule(true);
    };
    return (
        <div className="organization-settings">
            <Head title="Labels & filters" />
            <div className="organization-heading">
                <div>
                    <h1>Labels & filters</h1>
                    <p>Keep your mailbox organized, your way.</p>
                </div>
                <Link
                    className="text-link"
                    href={props.mailbox ? `/mail/${props.mailbox.id}` : '/mail'}
                >
                    <ArrowLeft size={16} />
                    Back to mail
                </Link>
            </div>
            <label className="stacked-label">
                Mailbox
                <select
                    aria-label="Mailbox"
                    disabled={busy}
                    value={props.mailbox?.id ?? ''}
                    onChange={(event) =>
                        router.get(
                            `/settings/organization/${event.target.value}`,
                            {},
                            { preserveState: false },
                        )
                    }
                >
                    {props.mailboxes.map((box) => (
                        <option key={box.id} value={box.id}>
                            {box.name} · {box.email}
                        </option>
                    ))}
                </select>
            </label>
            {!props.mailbox ? (
                <p>
                    No mailbox is assigned to your account. Contact your
                    administrator.
                </p>
            ) : (
                <fieldset
                    className="organization-controls"
                    disabled={busy}
                    aria-busy={busy}
                >
                    <legend className="sr-only">Organization controls</legend>
                    <p className="field-help">
                        Labels, filters and blocked senders are shared with this
                        mailbox’s members.
                    </p>
                    <nav
                        className="organization-tabs"
                        aria-label="Mailbox organization"
                    >
                        <button
                            aria-pressed={section === 'labels'}
                            onClick={() => setSection('labels')}
                        >
                            Labels
                        </button>
                        <button
                            aria-pressed={section === 'filters'}
                            onClick={() => setSection('filters')}
                        >
                            Filters
                        </button>
                        <button
                            aria-pressed={section === 'blocked'}
                            onClick={() => setSection('blocked')}
                        >
                            Blocked senders
                        </button>
                    </nav>
                    {error && (
                        <p
                            className="organization-feedback error-text"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    {notice && (
                        <p className="organization-feedback" role="status">
                            {notice}
                        </p>
                    )}
                    {section === 'labels' && (
                        <section aria-labelledby="labels-heading">
                            <h2 id="labels-heading">Your labels</h2>
                            <p className="field-help">
                                Use more than one label on a message. Removing a
                                label keeps all its messages.
                            </p>
                            <ul className="organization-list">
                                {data.labels.map((item) => (
                                    <li key={item.id}>
                                        <div className="organization-item-name">
                                            <Tag
                                                size={18}
                                                style={{ color: item.color }}
                                            />
                                            <span>{item.name}</span>
                                        </div>
                                        {deletingLabel === item.id ? (
                                            <div className="organization-confirm">
                                                <span>
                                                    Remove this label from all
                                                    messages?
                                                </span>
                                                <button
                                                    disabled={busy}
                                                    className="secondary"
                                                    onClick={() =>
                                                        setDeletingLabel(null)
                                                    }
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    disabled={busy}
                                                    className="danger-button"
                                                    onClick={async () => {
                                                        if (
                                                            await change(
                                                                `labels/${item.id}`,
                                                                'DELETE',
                                                                undefined,
                                                                'Label removed. All messages are retained.',
                                                            )
                                                        )
                                                            setDeletingLabel(
                                                                null,
                                                            );
                                                    }}
                                                >
                                                    Remove label
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="button-row">
                                                <button
                                                    className="icon-button"
                                                    aria-label={`Edit ${item.name}`}
                                                    onClick={() => {
                                                        setEditingLabel(item);
                                                        setLabelName(item.name);
                                                        setLabelColor(
                                                            item.color,
                                                        );
                                                    }}
                                                >
                                                    <Pencil size={17} />
                                                </button>
                                                <button
                                                    className="icon-button"
                                                    aria-label={`Remove ${item.name}`}
                                                    onClick={() =>
                                                        setDeletingLabel(
                                                            item.id,
                                                        )
                                                    }
                                                >
                                                    <Trash2 size={17} />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                            {data.labels.length === 0 && (
                                <p className="organization-empty">
                                    Create a label for a project, client, or
                                    anything you want to find again.
                                </p>
                            )}
                            <form
                                className="organization-form"
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    if (
                                        await change(
                                            editingLabel
                                                ? `labels/${editingLabel.id}`
                                                : 'labels',
                                            editingLabel ? 'PATCH' : 'POST',
                                            {
                                                name: labelName.trim(),
                                                color: labelColor,
                                            },
                                            editingLabel
                                                ? 'Label updated.'
                                                : 'Label created.',
                                        )
                                    ) {
                                        setLabelName('');
                                        setEditingLabel(null);
                                    }
                                }}
                            >
                                <h3>
                                    {editingLabel
                                        ? 'Edit label'
                                        : 'Create a label'}
                                </h3>
                                <label className="stacked-label">
                                    Label name
                                    <input
                                        required
                                        maxLength={32}
                                        value={labelName}
                                        onChange={(event) =>
                                            setLabelName(event.target.value)
                                        }
                                    />
                                </label>
                                <fieldset className="label-color-options">
                                    <legend>Color</legend>
                                    {colors.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            aria-label={`Label color ${color}`}
                                            aria-pressed={labelColor === color}
                                            onClick={() => setLabelColor(color)}
                                            style={
                                                {
                                                    '--label-color': color,
                                                } as CSSProperties
                                            }
                                        >
                                            <span />
                                        </button>
                                    ))}
                                </fieldset>
                                <div className="button-row">
                                    <button
                                        className="primary"
                                        disabled={busy || !labelName.trim()}
                                    >
                                        <Plus size={16} />
                                        {editingLabel
                                            ? 'Save label'
                                            : 'Create label'}
                                    </button>
                                    {editingLabel && (
                                        <button
                                            className="secondary"
                                            type="button"
                                            onClick={() => {
                                                setEditingLabel(null);
                                                setLabelName('');
                                            }}
                                        >
                                            Cancel edit
                                        </button>
                                    )}
                                </div>
                            </form>
                        </section>
                    )}
                    {section === 'filters' && (
                        <section aria-labelledby="filters-heading">
                            <div className="organization-heading">
                                <div>
                                    <h2 id="filters-heading">
                                        Incoming mail filters
                                    </h2>
                                    <p className="field-help">
                                        Apply actions to future incoming
                                        messages. Existing messages stay as they
                                        are.
                                    </p>
                                </div>
                                {!showRule && (
                                    <button
                                        className="secondary"
                                        onClick={() => setShowRule(true)}
                                    >
                                        <Plus size={16} />
                                        Create filter
                                    </button>
                                )}
                            </div>
                            <ul className="organization-list">
                                {data.rules.map((rule) => (
                                    <li key={rule.id}>
                                        <div className="organization-rule-summary">
                                            <strong>{rule.name}</strong>
                                            <p>
                                                {Object.entries(rule.predicates)
                                                    .filter(
                                                        ([, value]) => value,
                                                    )
                                                    .map(
                                                        ([key, value]) =>
                                                            `${key} contains “${value}”`,
                                                    )
                                                    .join(' · ')}
                                            </p>
                                            <small>
                                                {rule.enabled
                                                    ? 'Active'
                                                    : 'Paused'}{' '}
                                                ·{' '}
                                                {Object.entries(rule.actions)
                                                    .filter(
                                                        ([, value]) => value,
                                                    )
                                                    .map(([key, value]) =>
                                                        key === 'label_id'
                                                            ? `Label: ${data.labels.find((label) => label.id === value)?.name ?? 'removed'}`
                                                            : key === 'category'
                                                              ? `Category: ${value}`
                                                              : key === 'read'
                                                                ? 'Mark read'
                                                                : key === 'star'
                                                                  ? 'Star'
                                                                  : key ===
                                                                      'important'
                                                                    ? 'Mark important'
                                                                    : 'Archive',
                                                    )
                                                    .join(' · ')}
                                            </small>
                                        </div>
                                        <div className="button-row">
                                            <button
                                                className="secondary"
                                                disabled={busy}
                                                onClick={() =>
                                                    void change(
                                                        `rules/${rule.id}`,
                                                        'PATCH',
                                                        {
                                                            ...rule,
                                                            enabled:
                                                                !rule.enabled,
                                                        },
                                                        rule.enabled
                                                            ? 'Filter paused.'
                                                            : 'Filter enabled.',
                                                    )
                                                }
                                            >
                                                {rule.enabled
                                                    ? 'Pause'
                                                    : 'Enable'}
                                            </button>
                                            <button
                                                className="icon-button"
                                                aria-label={`Edit filter ${rule.name}`}
                                                onClick={() => editRule(rule)}
                                            >
                                                <Pencil size={17} />
                                            </button>
                                            <button
                                                className="icon-button"
                                                aria-label={`Remove filter ${rule.name}`}
                                                disabled={busy}
                                                onClick={() =>
                                                    void change(
                                                        `rules/${rule.id}`,
                                                        'DELETE',
                                                        undefined,
                                                        'Filter removed. Messages are retained.',
                                                    )
                                                }
                                            >
                                                <Trash2 size={17} />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            {data.rules.length === 0 && !showRule && (
                                <p className="organization-empty">
                                    Create a filter to label, categorize, or
                                    organize incoming mail automatically.
                                </p>
                            )}
                            {showRule && (
                                <form
                                    className="organization-form"
                                    onSubmit={async (event) => {
                                        event.preventDefault();
                                        const predicates = Object.fromEntries(
                                            Object.entries({
                                                sender,
                                                recipient,
                                                subject,
                                            }).filter(([, value]) =>
                                                value.trim(),
                                            ),
                                        );
                                        const actions = Object.fromEntries(
                                            Object.entries(ruleActions).filter(
                                                ([, value]) => value,
                                            ),
                                        );
                                        if (
                                            await change(
                                                editingRule
                                                    ? `rules/${editingRule}`
                                                    : 'rules',
                                                editingRule ? 'PATCH' : 'POST',
                                                {
                                                    name: ruleName.trim(),
                                                    enabled:
                                                        data.rules.find(
                                                            (rule) =>
                                                                rule.id ===
                                                                editingRule,
                                                        )?.enabled ?? true,
                                                    predicates,
                                                    actions,
                                                },
                                                editingRule
                                                    ? 'Filter updated.'
                                                    : 'Filter created.',
                                            )
                                        )
                                            resetRule();
                                    }}
                                >
                                    <h3>
                                        {editingRule
                                            ? 'Edit filter'
                                            : 'Create filter'}
                                    </h3>
                                    <label className="stacked-label">
                                        Filter name
                                        <input
                                            required
                                            maxLength={80}
                                            value={ruleName}
                                            onChange={(event) =>
                                                setRuleName(event.target.value)
                                            }
                                        />
                                    </label>
                                    <fieldset>
                                        <legend>When all these match</legend>
                                        <p className="field-help">
                                            Fill at least one field. Matching
                                            ignores capitalization.
                                        </p>
                                        <label className="stacked-label">
                                            Sender contains
                                            <input
                                                maxLength={200}
                                                value={sender}
                                                onChange={(event) =>
                                                    setSender(
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="person@example.com"
                                            />
                                        </label>
                                        <label className="stacked-label">
                                            Recipient contains
                                            <input
                                                maxLength={200}
                                                value={recipient}
                                                onChange={(event) =>
                                                    setRecipient(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="stacked-label">
                                            Subject contains
                                            <input
                                                maxLength={200}
                                                value={subject}
                                                onChange={(event) =>
                                                    setSubject(
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                    </fieldset>
                                    <fieldset>
                                        <legend>Then do this</legend>
                                        <div className="rule-checkboxes">
                                            {(
                                                [
                                                    [
                                                        'archive',
                                                        'Skip the Inbox (archive)',
                                                    ],
                                                    ['read', 'Mark as read'],
                                                    ['star', 'Star'],
                                                    [
                                                        'important',
                                                        'Mark as important',
                                                    ],
                                                ] as const
                                            ).map(([key, label]) => (
                                                <label key={key}>
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(
                                                            ruleActions[key],
                                                        )}
                                                        onChange={(event) =>
                                                            setRuleActions({
                                                                ...ruleActions,
                                                                [key]: event
                                                                    .target
                                                                    .checked,
                                                            })
                                                        }
                                                    />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                        <label className="stacked-label">
                                            Category
                                            <select
                                                value={
                                                    ruleActions.category ?? ''
                                                }
                                                onChange={(event) =>
                                                    setRuleActions({
                                                        ...ruleActions,
                                                        category:
                                                            event.target.value,
                                                    })
                                                }
                                            >
                                                <option value="">
                                                    Keep current category
                                                </option>
                                                {categoryNames.map(
                                                    (category) => (
                                                        <option
                                                            key={category}
                                                            value={category}
                                                        >
                                                            {category[0].toUpperCase() +
                                                                category.slice(
                                                                    1,
                                                                )}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        </label>
                                        <label className="stacked-label">
                                            Apply label
                                            <select
                                                value={
                                                    ruleActions.label_id ?? ''
                                                }
                                                onChange={(event) =>
                                                    setRuleActions({
                                                        ...ruleActions,
                                                        label_id: event.target
                                                            .value
                                                            ? Number(
                                                                  event.target
                                                                      .value,
                                                              )
                                                            : undefined,
                                                    })
                                                }
                                            >
                                                <option value="">
                                                    No label action
                                                </option>
                                                {data.labels.map((item) => (
                                                    <option
                                                        key={item.id}
                                                        value={item.id}
                                                    >
                                                        {item.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                    </fieldset>
                                    <div className="button-row">
                                        <button
                                            className="primary"
                                            disabled={
                                                busy ||
                                                !ruleName.trim() ||
                                                !(
                                                    sender.trim() ||
                                                    recipient.trim() ||
                                                    subject.trim()
                                                ) ||
                                                !Object.values(
                                                    ruleActions,
                                                ).some(Boolean)
                                            }
                                        >
                                            Save filter
                                        </button>
                                        <button
                                            className="secondary"
                                            type="button"
                                            onClick={resetRule}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            )}
                        </section>
                    )}
                    {section === 'blocked' && (
                        <section aria-labelledby="blocked-heading">
                            <h2 id="blocked-heading">Blocked senders</h2>
                            <p className="field-help">
                                Future messages from these exact addresses go to
                                Spam. Messages are retained and can be moved
                                back to your inbox.
                            </p>
                            <ul className="organization-list">
                                {data.blocked_senders.map((item) => (
                                    <li key={item.id}>
                                        <div className="organization-item-name">
                                            <ShieldBan size={18} />
                                            <span>{item.email}</span>
                                        </div>
                                        <button
                                            disabled={busy}
                                            className="secondary"
                                            onClick={() =>
                                                void change(
                                                    `blocked-senders/${item.id}`,
                                                    'DELETE',
                                                    undefined,
                                                    'Sender unblocked for future messages.',
                                                )
                                            }
                                        >
                                            Unblock
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {data.blocked_senders.length === 0 && (
                                <p className="organization-empty">
                                    No blocked senders.
                                </p>
                            )}
                            <form
                                className="organization-form"
                                onSubmit={async (event) => {
                                    event.preventDefault();
                                    if (
                                        await change(
                                            'blocked-senders',
                                            'POST',
                                            { email: blockedEmail.trim() },
                                            'Sender blocked. Future messages will go to Spam.',
                                        )
                                    )
                                        setBlockedEmail('');
                                }}
                            >
                                <label className="stacked-label">
                                    Email address to block
                                    <input
                                        type="email"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        required
                                        maxLength={254}
                                        value={blockedEmail}
                                        onChange={(event) =>
                                            setBlockedEmail(event.target.value)
                                        }
                                        placeholder="sender@example.com"
                                    />
                                </label>
                                <button
                                    className="primary"
                                    disabled={busy || !blockedEmail.trim()}
                                >
                                    <ShieldBan size={16} />
                                    Block sender
                                </button>
                            </form>
                        </section>
                    )}
                </fieldset>
            )}
        </div>
    );
}
