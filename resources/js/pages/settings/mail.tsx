import { Head, Link, router } from '@inertiajs/react';
import { Check, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import {
    cloneElement,
    useEffect,
    useId,
    useState,
    type ReactElement,
} from 'react';
import { toast } from 'sonner';
import { IconButton, Sheet } from '@/components/webmail/ui';
import {
    api,
    type Contact,
    type MailTemplate,
    type Preferences,
    type WritingTools,
} from '@/lib/mail';
import { useMailPreferences } from '@/lib/mail-preferences';
import '../../../css/mail-settings.css';

type MailSettingsProps = WritingTools & {
    writingLimits: { contacts: number; templates: number };
    mailAccounts: { id: number; name: string; email: string }[];
    sendAsIdentities: { mailbox_id: number; email: string }[];
};
type ContactDraft = { id?: number; name: string; email: string };
type TemplateDraft = {
    id?: number;
    name: string;
    subject: string;
    body: string;
};
const emptyContact: ContactDraft = { name: '', email: '' };
const emptyTemplate: TemplateDraft = { name: '', subject: '', body: '' };
const sameContact = (left: ContactDraft, right: ContactDraft) =>
    left.id === right.id &&
    left.name === right.name &&
    left.email === right.email;
const sameTemplate = (left: TemplateDraft, right: TemplateDraft) =>
    left.id === right.id &&
    left.name === right.name &&
    left.subject === right.subject &&
    left.body === right.body;

function ChoicePreview({
    kind,
    value,
}: {
    kind: 'density' | 'pane';
    value: string;
}) {
    return (
        <span
            className={`preference-preview preview-${kind} preview-${value}`}
            aria-hidden="true"
        >
            <span className="preview-list">
                {[0, 1, 2].map((row) => (
                    <span className="preview-mail-row" key={row}>
                        <span />
                        <span />
                        {kind === 'density' && value === 'default' && <i />}
                    </span>
                ))}
            </span>
            {kind === 'pane' && value !== 'none' && (
                <span className="preview-reader">
                    <span />
                    <span />
                    <span />
                </span>
            )}
        </span>
    );
}

function SettingField({
    label,
    description,
    children,
}: {
    label: string;
    description?: string;
    children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
}) {
    const generatedId = useId();
    const id = children.props.id ?? generatedId;
    return (
        <div className="mail-setting-field">
            <label className="mail-setting-title" htmlFor={id}>
                {label}
            </label>
            {description && (
                <span className="mail-setting-hint" id={`${id}-hint`}>
                    {description}
                </span>
            )}
            {cloneElement(children, {
                id,
                'aria-describedby': description ? `${id}-hint` : undefined,
            })}
        </div>
    );
}

function Toggle({
    label,
    description,
    value,
    onChange,
}: {
    label: string;
    description: string;
    value: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <label className="mail-setting-toggle">
            <input
                type="checkbox"
                checked={value}
                onChange={(event) => onChange(event.target.checked)}
            />
            <span>
                <span className="mail-setting-title">{label}</span>
                <span className="mail-setting-hint">{description}</span>
            </span>
        </label>
    );
}

function message(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'The change could not be saved. Please try again.';
}

export default function MailSettings({
    contacts: initialContacts,
    templates: initialTemplates,
    signature,
    writingLimits,
    mailAccounts,
    sendAsIdentities,
}: MailSettingsProps) {
    const { preferences, updatePreferences } = useMailPreferences();
    const [contacts, setContacts] = useState(initialContacts);
    const [templates, setTemplates] = useState(initialTemplates);
    const [signatureBody, setSignatureBody] = useState(signature.body);
    const [savedSignature, setSavedSignature] = useState(signature.body);
    const [contactDraft, setContactDraft] =
        useState<ContactDraft>(emptyContact);
    const [contactBaseline, setContactBaseline] =
        useState<ContactDraft>(emptyContact);
    const [templateDraft, setTemplateDraft] =
        useState<TemplateDraft>(emptyTemplate);
    const [templateBaseline, setTemplateBaseline] =
        useState<TemplateDraft>(emptyTemplate);
    const [contactQuery, setContactQuery] = useState('');
    const [contactPage, setContactPage] = useState(1);
    const [savingPreferences, setSavingPreferences] = useState(0);
    const [preferenceSaved, setPreferenceSaved] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [deletion, setDeletion] = useState<{
        kind: 'contact' | 'template';
        id: number;
        name: string;
    } | null>(null);
    const contactDirty = !sameContact(contactDraft, contactBaseline);
    const templateDirty = !sameTemplate(templateDraft, templateBaseline);
    const hasUnsaved =
        signatureBody !== savedSignature || contactDirty || templateDirty;

    useEffect(() => {
        if (error) toast.error(error);
    }, [error]);
    useEffect(() => {
        if (notice) toast.success(notice);
    }, [notice]);

    useEffect(() => {
        if (!hasUnsaved) return;
        const unload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener('beforeunload', unload);
        const stop = router.on('before', (event) => {
            if (
                !window.confirm(
                    'Leave mail settings? Your unsaved writing changes will be lost.',
                )
            )
                event.preventDefault();
        });
        return () => {
            window.removeEventListener('beforeunload', unload);
            stop();
        };
    }, [hasUnsaved]);

    const changedWriting = () =>
        window.dispatchEvent(new Event('mail-writing-updated'));
    const savePreference = async (patch: Partial<Preferences>) => {
        setSavingPreferences((count) => count + 1);
        setError('');
        try {
            await updatePreferences(patch);
            setPreferenceSaved(true);
        } catch (failure) {
            setError(`Preferences were not saved. ${message(failure)}`);
        } finally {
            setSavingPreferences((count) => count - 1);
        }
    };
    const saveSignature = async () => {
        const submittedBody = signatureBody;
        setBusy('signature');
        setError('');
        setNotice('');
        try {
            const result = await api<{ signature: { body: string } }>(
                '/settings/signature',
                'PUT',
                { body: submittedBody },
            );
            setSavedSignature(result.signature.body);
            setSignatureBody((current) =>
                current === submittedBody ? result.signature.body : current,
            );
            setNotice('Signature saved. New messages will use this signature.');
            changedWriting();
        } catch (failure) {
            setError(`Signature was not saved. ${message(failure)}`);
        } finally {
            setBusy(null);
        }
    };
    const saveContact = async () => {
        const submittedContact = contactDraft;
        setBusy('contact');
        setError('');
        setNotice('');
        try {
            const result = await api<{ contact: Contact }>(
                contactDraft.id
                    ? `/settings/contacts/${contactDraft.id}`
                    : '/settings/contacts',
                contactDraft.id ? 'PUT' : 'POST',
                { name: contactDraft.name, email: contactDraft.email },
            );
            setContacts((current) =>
                [
                    ...current.filter(
                        (contact) => contact.id !== result.contact.id,
                    ),
                    result.contact,
                ].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setContactDraft((current) =>
                sameContact(current, submittedContact)
                    ? result.contact
                    : { ...current, id: result.contact.id },
            );
            setContactBaseline(result.contact);
            setNotice(
                'Contact saved. You can find this address when composing a message.',
            );
            changedWriting();
        } catch (failure) {
            setError(`Contact was not saved. ${message(failure)}`);
        } finally {
            setBusy(null);
        }
    };
    const saveTemplate = async () => {
        const submittedTemplate = templateDraft;
        setBusy('template');
        setError('');
        setNotice('');
        try {
            const result = await api<{ template: MailTemplate }>(
                templateDraft.id
                    ? `/settings/templates/${templateDraft.id}`
                    : '/settings/templates',
                templateDraft.id ? 'PUT' : 'POST',
                {
                    name: templateDraft.name,
                    subject: templateDraft.subject,
                    body: templateDraft.body,
                },
            );
            setTemplates((current) =>
                [
                    ...current.filter(
                        (template) => template.id !== result.template.id,
                    ),
                    result.template,
                ].sort((a, b) => a.name.localeCompare(b.name)),
            );
            setTemplateDraft((current) =>
                sameTemplate(current, submittedTemplate)
                    ? result.template
                    : { ...current, id: result.template.id },
            );
            setTemplateBaseline(result.template);
            setNotice(
                'Template saved. Insert it from the composer when you need it.',
            );
            changedWriting();
        } catch (failure) {
            setError(`Template was not saved. ${message(failure)}`);
        } finally {
            setBusy(null);
        }
    };
    const editContact = (contact: ContactDraft) => {
        if (
            contactDirty &&
            !window.confirm('Discard the unsaved contact changes?')
        )
            return;
        setContactDraft(contact);
        setContactBaseline(contact);
        document.getElementById('contact-name')?.focus();
    };
    const editTemplate = (template: TemplateDraft) => {
        if (
            templateDirty &&
            !window.confirm('Discard the unsaved template changes?')
        )
            return;
        setTemplateDraft(template);
        setTemplateBaseline(template);
    };
    const deleteItem = async () => {
        if (!deletion) return;
        setBusy('delete');
        setError('');
        setNotice('');
        try {
            await api(
                `/settings/${deletion.kind === 'contact' ? 'contacts' : 'templates'}/${deletion.id}`,
                'DELETE',
            );
            if (deletion.kind === 'contact') {
                setContacts((current) =>
                    current.filter((contact) => contact.id !== deletion.id),
                );
                if (contactDraft.id === deletion.id) {
                    setContactDraft(emptyContact);
                    setContactBaseline(emptyContact);
                }
            } else {
                setTemplates((current) =>
                    current.filter((template) => template.id !== deletion.id),
                );
                if (templateDraft.id === deletion.id) {
                    setTemplateDraft(emptyTemplate);
                    setTemplateBaseline(emptyTemplate);
                }
            }
            setNotice(
                `${deletion.kind === 'contact' ? 'Contact' : 'Template'} deleted.`,
            );
            setDeletion(null);
            changedWriting();
        } catch (failure) {
            setError(
                `The ${deletion.kind} was not deleted. ${message(failure)}`,
            );
            setDeletion(null);
        } finally {
            setBusy(null);
        }
    };
    const filteredContacts = contacts.filter((contact) =>
        `${contact.name} ${contact.email}`
            .toLowerCase()
            .includes(contactQuery.toLowerCase().trim()),
    );
    const pageCount = Math.max(1, Math.ceil(filteredContacts.length / 20));
    const visiblePage = Math.min(contactPage, pageCount);
    const visibleContacts = filteredContacts.slice(
        (visiblePage - 1) * 20,
        visiblePage * 20,
    );

    return (
        <div className="mail-settings-page">
            <Head title="Mail settings" />
            <header className="mail-settings-heading">
                <h1>Mail settings</h1>
                <p>Make your inbox and writing tools work for you.</p>
                <span
                    className="preference-save-status"
                    role="status"
                    aria-live="polite"
                >
                    {savingPreferences > 0 ? (
                        'Saving preferences…'
                    ) : preferenceSaved ? (
                        <>
                            <Check size={15} /> Preferences saved
                        </>
                    ) : (
                        'Preferences save automatically.'
                    )}
                </span>
            </header>
            <nav
                className="mail-settings-sections"
                aria-label="Mail settings sections"
            >
                <a href="#mail-general">General</a>
                <a href="#mail-inbox">Inbox</a>
                <a href="#mail-writing">Writing</a>
                <a href="#mail-contacts">Contacts</a>
            </nav>
            {error && (
                <p className="mail-settings-error" role="alert">
                    {error}
                </p>
            )}
            {notice && (
                <p className="mail-settings-notice" role="status">
                    {notice}
                </p>
            )}

            <section
                className="mail-settings-section"
                id="mail-general"
                aria-labelledby="general-heading"
            >
                <h2 id="general-heading">General</h2>
                <fieldset className="mail-preference-group">
                    <legend>Display mode</legend>
                    <div className="mail-theme-choices">
                        {(['light', 'dark', 'system'] as const).map((theme) => (
                            <label
                                key={theme}
                                className={
                                    preferences.theme === theme ? 'chosen' : ''
                                }
                            >
                                <input
                                    type="radio"
                                    name="mail-theme"
                                    value={theme}
                                    checked={preferences.theme === theme}
                                    onChange={() =>
                                        void savePreference({ theme })
                                    }
                                />
                                {theme === 'system'
                                    ? 'Use device theme'
                                    : theme === 'light'
                                      ? 'Light'
                                      : 'Dark'}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="mail-setting-grid">
                    <Link
                        href="/settings/themes"
                        className="theme-gallery-link"
                    >
                        Browse color themes
                    </Link>
                    <SettingField label="Default reply action">
                        <select
                            value={preferences.default_reply}
                            onChange={(event) =>
                                void savePreference({
                                    default_reply: event.target
                                        .value as Preferences['default_reply'],
                                })
                            }
                        >
                            <option value="reply">Reply to sender</option>
                            <option value="reply-all">Reply to all</option>
                        </select>
                    </SettingField>
                    <SettingField
                        label="After archiving or deleting"
                        description="Choose where to go after a conversation action."
                    >
                        <select
                            value={preferences.auto_advance}
                            onChange={(event) =>
                                void savePreference({
                                    auto_advance: event.target
                                        .value as Preferences['auto_advance'],
                                })
                            }
                        >
                            <option value="list">
                                Return to the message list
                            </option>
                            <option value="next">
                                Open the next conversation
                            </option>
                            <option value="previous">
                                Open the previous conversation
                            </option>
                        </select>
                    </SettingField>
                </div>
                <Toggle
                    label="Keyboard shortcuts"
                    description="Use mail shortcuts when you are not typing in a field. Press ? in mail to see the keys."
                    value={preferences.keyboard_shortcuts}
                    onChange={(keyboard_shortcuts) =>
                        void savePreference({ keyboard_shortcuts })
                    }
                />
                <Toggle
                    label="Unread count in the browser tab"
                    description="Show the current mailbox's unread inbox count in the tab title."
                    value={preferences.unread_badge}
                    onChange={(unread_badge) =>
                        void savePreference({ unread_badge })
                    }
                />
                <details className="mail-account-details">
                    <summary>Accounts and sender addresses</summary>
                    {mailAccounts.length ? (
                        <ul>
                            {mailAccounts.map((account) => (
                                <li key={account.id}>
                                    <strong>{account.name}</strong>
                                    <span>{account.email}</span>
                                    <small>
                                        {sendAsIdentities.filter(
                                            (identity) =>
                                                identity.mailbox_id ===
                                                account.id,
                                        ).length
                                            ? `Send as: ${sendAsIdentities
                                                  .filter(
                                                      (identity) =>
                                                          identity.mailbox_id ===
                                                          account.id,
                                                  )
                                                  .map(
                                                      (identity) =>
                                                          identity.email,
                                                  )
                                                  .join(', ')}`
                                            : 'No sending access or enabled sender address.'}
                                    </small>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>
                            No mailbox access is assigned. Contact your
                            administrator.
                        </p>
                    )}
                    <p>
                        Your administrator manages mailbox access and sender
                        addresses.
                    </p>
                </details>
            </section>

            <section
                className="mail-settings-section"
                id="mail-inbox"
                aria-labelledby="inbox-heading"
            >
                <h2 id="inbox-heading">Inbox</h2>
                <fieldset className="mail-preference-group">
                    <legend>Display density</legend>
                    <div className="mail-preview-choices">
                        {(['default', 'comfortable', 'compact'] as const).map(
                            (density) => (
                                <label
                                    key={density}
                                    className={
                                        preferences.density === density
                                            ? 'chosen'
                                            : ''
                                    }
                                >
                                    <ChoicePreview
                                        kind="density"
                                        value={density}
                                    />
                                    <span>
                                        <input
                                            type="radio"
                                            name="mail-density"
                                            checked={
                                                preferences.density === density
                                            }
                                            onChange={() =>
                                                void savePreference({ density })
                                            }
                                        />
                                        {density === 'default'
                                            ? 'Default'
                                            : density === 'comfortable'
                                              ? 'Comfortable'
                                              : 'Compact'}
                                    </span>
                                </label>
                            ),
                        )}
                    </div>
                </fieldset>
                <fieldset className="mail-preference-group">
                    <legend>Reading pane</legend>
                    <p className="mail-setting-hint">
                        Small screens always open conversations in a full-screen
                        view.
                    </p>
                    <div className="mail-preview-choices">
                        {(['none', 'right', 'bottom'] as const).map((pane) => (
                            <label
                                key={pane}
                                className={
                                    preferences.pane === pane ? 'chosen' : ''
                                }
                            >
                                <ChoicePreview kind="pane" value={pane} />
                                <span>
                                    <input
                                        type="radio"
                                        name="mail-pane"
                                        checked={preferences.pane === pane}
                                        onChange={() =>
                                            void savePreference({ pane })
                                        }
                                    />
                                    {pane === 'none'
                                        ? 'No split'
                                        : pane === 'right'
                                          ? 'Right of inbox'
                                          : 'Below inbox'}
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
                <div className="mail-setting-grid">
                    <SettingField label="Messages per page">
                        <select
                            value={preferences.page_size}
                            onChange={(event) =>
                                void savePreference({
                                    page_size: Number(
                                        event.target.value,
                                    ) as Preferences['page_size'],
                                })
                            }
                        >
                            {[10, 30, 50, 100].map((count) => (
                                <option key={count} value={count}>
                                    {count} messages
                                </option>
                            ))}
                        </select>
                    </SettingField>
                    <SettingField label="Inbox order">
                        <select
                            value={preferences.inbox_order}
                            onChange={(event) =>
                                void savePreference({
                                    inbox_order: event.target
                                        .value as Preferences['inbox_order'],
                                })
                            }
                        >
                            <option value="newest">Newest first</option>
                            <option value="unread">Unread first</option>
                            <option value="starred">Starred first</option>
                            <option value="important">Important first</option>
                        </select>
                    </SettingField>
                </div>
                <Toggle
                    label="Message snippets"
                    description="Show a short preview next to the subject in the message list."
                    value={preferences.snippets}
                    onChange={(snippets) => void savePreference({ snippets })}
                />
                <Toggle
                    label="Hover actions"
                    description="Show quick message actions when a pointer is over a row. Keyboard and touch actions stay available."
                    value={preferences.hover_actions}
                    onChange={(hover_actions) =>
                        void savePreference({ hover_actions })
                    }
                />
                <div className="mail-setting-grid">
                    {(['left', 'right'] as const).map((direction) => (
                        <SettingField
                            key={direction}
                            label={`Swipe ${direction} on mobile`}
                        >
                            <select
                                value={preferences[`swipe_${direction}`]}
                                onChange={(event) =>
                                    void savePreference({
                                        [`swipe_${direction}`]:
                                            event.target.value,
                                    })
                                }
                            >
                                <option value="archive">Archive</option>
                                <option value="read">
                                    Mark read or unread
                                </option>
                                <option value="none">Do nothing</option>
                            </select>
                        </SettingField>
                    ))}
                </div>
                <Link
                    href="/settings/organization"
                    className="mail-settings-link"
                >
                    Manage labels, filters, and blocked senders
                </Link>
            </section>

            <section
                className="mail-settings-section"
                id="mail-writing"
                aria-labelledby="writing-heading"
            >
                <h2 id="writing-heading">Writing</h2>
                <p className="mail-section-description">
                    Your signature and templates are private to your account.
                </p>
                <Toggle
                    label="Browser spellcheck"
                    description="Ask your browser to check spelling while you write. Language support depends on your browser."
                    value={preferences.spellcheck}
                    onChange={(spellcheck) =>
                        void savePreference({ spellcheck })
                    }
                />
                <form
                    className="mail-writing-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveSignature();
                    }}
                >
                    <SettingField
                        label="Signature"
                        description="Plain text added once to new messages. Existing drafts keep their content. Leave blank to remove it."
                    >
                        <textarea
                            value={signatureBody}
                            onChange={(event) =>
                                setSignatureBody(event.target.value)
                            }
                            rows={5}
                            maxLength={4000}
                            spellCheck={preferences.spellcheck}
                        />
                    </SettingField>
                    <div className="mail-form-actions">
                        <button
                            className="primary"
                            disabled={
                                busy !== null ||
                                signatureBody === savedSignature
                            }
                        >
                            {busy === 'signature'
                                ? 'Saving signature…'
                                : 'Save signature'}
                        </button>
                        <span>Up to 4,000 characters</span>
                    </div>
                </form>
                <div className="mail-subsection-heading">
                    <div>
                        <h3>Templates</h3>
                        <p>
                            Insert saved text into a draft, then review it
                            before sending.
                        </p>
                    </div>
                    <span>
                        {templates.length} / {writingLimits.templates}
                    </span>
                </div>
                <div className="mail-template-picker">
                    <SettingField label="Edit a saved template">
                        <select
                            disabled={busy !== null}
                            value={templateDraft.id ?? ''}
                            onChange={(event) =>
                                editTemplate(
                                    templates.find(
                                        (template) =>
                                            template.id ===
                                            Number(event.target.value),
                                    ) ?? emptyTemplate,
                                )
                            }
                        >
                            <option value="">New template</option>
                            {templates.map((template) => (
                                <option key={template.id} value={template.id}>
                                    {template.name}
                                </option>
                            ))}
                        </select>
                    </SettingField>
                    <button
                        type="button"
                        className="secondary"
                        disabled={
                            busy !== null ||
                            templates.length >= writingLimits.templates
                        }
                        onClick={() => editTemplate(emptyTemplate)}
                    >
                        <Plus size={16} /> New template
                    </button>
                </div>
                <form
                    className="mail-writing-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveTemplate();
                    }}
                >
                    <SettingField label="Template name">
                        <input
                            value={templateDraft.name}
                            onChange={(event) =>
                                setTemplateDraft((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                            maxLength={100}
                            required
                        />
                    </SettingField>
                    <SettingField
                        label="Subject"
                        description="Optional. Review the subject when inserting a template."
                    >
                        <input
                            value={templateDraft.subject}
                            onChange={(event) =>
                                setTemplateDraft((current) => ({
                                    ...current,
                                    subject: event.target.value,
                                }))
                            }
                            maxLength={255}
                        />
                    </SettingField>
                    <SettingField label="Template text">
                        <textarea
                            value={templateDraft.body}
                            onChange={(event) =>
                                setTemplateDraft((current) => ({
                                    ...current,
                                    body: event.target.value,
                                }))
                            }
                            rows={7}
                            maxLength={20000}
                            spellCheck={preferences.spellcheck}
                            required
                        />
                    </SettingField>
                    <div className="mail-form-actions">
                        <button
                            className="primary"
                            disabled={
                                busy !== null ||
                                !templateDirty ||
                                (!templateDraft.id &&
                                    templates.length >= writingLimits.templates)
                            }
                        >
                            {busy === 'template'
                                ? 'Saving template…'
                                : 'Save template'}
                        </button>
                        {templateDraft.id && (
                            <button
                                className="mail-delete-link"
                                type="button"
                                disabled={busy !== null}
                                onClick={() =>
                                    setDeletion({
                                        kind: 'template',
                                        id: templateDraft.id!,
                                        name: templateDraft.name,
                                    })
                                }
                            >
                                Delete template
                            </button>
                        )}
                        <span>Plain text · up to 20,000 characters</span>
                    </div>
                </form>
            </section>

            <section
                className="mail-settings-section"
                id="mail-contacts"
                aria-labelledby="contacts-heading"
            >
                <div className="mail-subsection-heading">
                    <div>
                        <h2 id="contacts-heading">Contacts</h2>
                        <p>
                            Save the people you choose. WebMail does not collect
                            addresses from your messages.
                        </p>
                    </div>
                    <span>
                        {contacts.length} / {writingLimits.contacts}
                    </span>
                </div>
                <form
                    className="mail-contact-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveContact();
                    }}
                >
                    <SettingField label="Contact name">
                        <input
                            id="contact-name"
                            autoComplete="off"
                            value={contactDraft.name}
                            onChange={(event) =>
                                setContactDraft((current) => ({
                                    ...current,
                                    name: event.target.value,
                                }))
                            }
                            maxLength={120}
                            required
                        />
                    </SettingField>
                    <SettingField label="Email address">
                        <input
                            type="email"
                            autoComplete="off"
                            value={contactDraft.email}
                            onChange={(event) =>
                                setContactDraft((current) => ({
                                    ...current,
                                    email: event.target.value,
                                }))
                            }
                            maxLength={254}
                            required
                        />
                    </SettingField>
                    <div className="mail-form-actions">
                        <button
                            className="primary"
                            disabled={
                                busy !== null ||
                                !contactDirty ||
                                (!contactDraft.id &&
                                    contacts.length >= writingLimits.contacts)
                            }
                        >
                            {busy === 'contact'
                                ? 'Saving contact…'
                                : contactDraft.id
                                  ? 'Save contact'
                                  : 'Add contact'}
                        </button>
                        {contactDraft.id && (
                            <button
                                type="button"
                                className="secondary"
                                disabled={busy !== null}
                                onClick={() => editContact(emptyContact)}
                            >
                                {contactDirty ? 'Cancel edit' : 'New contact'}
                            </button>
                        )}
                    </div>
                </form>
                {contacts.length > 0 && (
                    <label className="mail-contact-search">
                        <Search size={18} aria-hidden="true" />
                        <span className="sr-only">Search your contacts</span>
                        <input
                            type="search"
                            value={contactQuery}
                            onChange={(event) => {
                                setContactQuery(event.target.value);
                                setContactPage(1);
                            }}
                            placeholder="Search your contacts"
                        />
                    </label>
                )}
                {visibleContacts.length ? (
                    <ul className="mail-contact-list">
                        {visibleContacts.map((contact) => (
                            <li key={contact.id}>
                                <div>
                                    <strong>{contact.name}</strong>
                                    <span>{contact.email}</span>
                                </div>
                                <div className="mail-contact-actions">
                                    <IconButton
                                        icon={Pencil}
                                        label={`Edit ${contact.name}`}
                                        disabled={busy !== null}
                                        onClick={() => editContact(contact)}
                                    />
                                    <IconButton
                                        icon={Trash2}
                                        label={`Delete ${contact.name}`}
                                        disabled={busy !== null}
                                        onClick={() =>
                                            setDeletion({
                                                kind: 'contact',
                                                id: contact.id,
                                                name: contact.name,
                                            })
                                        }
                                    />
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mail-settings-empty">
                        {contacts.length
                            ? 'No contacts match this search.'
                            : 'Add your first contact above to get recipient suggestions in the composer.'}
                    </p>
                )}
                {pageCount > 1 && (
                    <div className="mail-contact-pagination">
                        <span>
                            Page {visiblePage} of {pageCount}
                        </span>
                        <button
                            className="secondary"
                            type="button"
                            disabled={visiblePage === 1}
                            onClick={() => setContactPage(visiblePage - 1)}
                        >
                            Previous
                        </button>
                        <button
                            className="secondary"
                            type="button"
                            disabled={visiblePage === pageCount}
                            onClick={() => setContactPage(visiblePage + 1)}
                        >
                            Next
                        </button>
                    </div>
                )}
            </section>

            <Sheet
                open={deletion !== null}
                title={`Delete ${deletion?.kind ?? 'item'}`}
                onClose={() => {
                    if (busy !== 'delete') setDeletion(null);
                }}
                side="bottom"
            >
                <p className="mail-delete-description">
                    Remove <strong>{deletion?.name}</strong> from your private{' '}
                    {deletion?.kind === 'contact' ? 'contacts' : 'templates'}?
                </p>
                <p className="mail-setting-hint">
                    Existing messages and drafts will keep their content.
                </p>
                <div className="button-row">
                    <button
                        className="secondary"
                        type="button"
                        disabled={busy === 'delete'}
                        onClick={() => setDeletion(null)}
                    >
                        Cancel
                    </button>
                    <button
                        className="danger-button"
                        type="button"
                        disabled={busy === 'delete'}
                        onClick={() => void deleteItem()}
                    >
                        {busy === 'delete'
                            ? 'Deleting…'
                            : `Delete ${deletion?.kind ?? 'item'}`}
                    </button>
                </div>
            </Sheet>
        </div>
    );
}

MailSettings.layout = {
    breadcrumbs: [{ title: 'Mail settings', href: '/settings/mail' }],
};
