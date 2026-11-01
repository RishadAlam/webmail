export type Mailbox = {
    id: number;
    name: string;
    email: string;
    used_bytes: number;
    quota_bytes: number;
};
export type Message = {
    id: number;
    thread_id: string;
    message_id: string | null;
    from_name: string;
    from_email: string;
    to: string[];
    cc: string[];
    subject: string;
    body_text: string;
    is_read: boolean;
    starred: boolean;
    important: boolean;
    snoozed_until: string | null;
    category: string;
    folder: string;
    labels: string[] | null;
    created_at: string;
    has_html?: boolean;
    has_attachments: boolean;
    delivery_status: string | null;
};
export type Draft = {
    id: string;
    mailbox_id: number;
    version: number;
    from_email: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
    status: string;
    updated_at: string;
    attachments: MailAttachment[];
};
export type MailAttachment = {
    id: string;
    name: string;
    type: string;
    size: number;
    url: string;
};
export type Preferences = {
    theme: 'light' | 'dark' | 'system';
    palette:
        | 'default'
        | 'ocean'
        | 'forest'
        | 'terracotta'
        | 'plum'
        | 'graphite';
    density: 'default' | 'comfortable' | 'compact';
    pane: 'none' | 'right' | 'bottom';
    collapsed: boolean;
    swipe_left: 'archive' | 'read' | 'none';
    swipe_right: 'archive' | 'read' | 'none';
    page_size: 10 | 30 | 50 | 100;
    inbox_order: 'newest' | 'unread' | 'starred' | 'important';
    default_reply: 'reply' | 'reply-all';
    snippets: boolean;
    hover_actions: boolean;
    spellcheck: boolean;
    keyboard_shortcuts: boolean;
    unread_badge: boolean;
    auto_advance: 'list' | 'next' | 'previous';
};
export type MailLabel = { id: number; name: string; color: string };
export type Contact = { id: number; name: string; email: string };
export type MailTemplate = {
    id: number;
    name: string;
    subject: string;
    body: string;
};
export type WritingTools = {
    contacts: Contact[];
    templates: MailTemplate[];
    signature: { body: string };
};
export type MailProps = {
    mailbox: Mailbox | null;
    mailboxes: Mailbox[];
    messages: Message[];
    thread: {
        id: string;
        subject: string;
        messages: Message[];
        pagination: {
            total: number;
            older: string | null;
            newer: string | null;
        };
    } | null;
    drafts: Draft[];
    identities: string[];
    counts: Record<string, number>;
    labels: MailLabel[];
    search_error?: string | null;
    filters: {
        folder: string;
        q: string;
        unread: boolean;
        page: number;
        label?: number | null;
        category?: string | null;
    };
    pagination: {
        from: number | null;
        to: number | null;
        total: number;
        next: string | null;
        prev: string | null;
    } | null;
    simulation: boolean;
};
export const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join('')
        .toUpperCase();
export const byteText = (n: number) =>
    n < 1024 * 1024
        ? `${(n / 1024).toFixed(1)} KiB`
        : `${(n / 1024 / 1024).toFixed(1)} MiB`;
export async function api<T>(
    url: string,
    method = 'GET',
    body?: unknown,
): Promise<T> {
    const token = document.cookie
        .split('; ')
        .find((row) => row.startsWith('XSRF-TOKEN='))
        ?.split('=')
        .slice(1)
        .join('=');
    let response: Response;
    try {
        response = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                ...(body instanceof FormData
                    ? {}
                    : { 'Content-Type': 'application/json' }),
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': decodeURIComponent(token ?? ''),
            },
            ...(method !== 'GET' && method !== 'HEAD' && body !== undefined
                ? {
                      body:
                          body instanceof FormData
                              ? body
                              : JSON.stringify(body),
                  }
                : {}),
        });
    } catch {
        throw new Error(
            'Connection lost. Your changes are still here. Reconnect and try again.',
        );
    }
    const data = await response.json().catch(() => ({
        message: 'The host is unavailable. Please try again.',
    }));
    if (!response.ok)
        throw new Error(
            data.error ?? data.message ?? 'The request could not be completed.',
        );
    return data as T;
}
export const defaultPreferences: Preferences = {
    theme: 'light',
    palette: 'default',
    density: 'comfortable',
    pane: 'none',
    collapsed: false,
    swipe_left: 'archive',
    swipe_right: 'read',
    page_size: 30,
    inbox_order: 'newest',
    default_reply: 'reply',
    snippets: true,
    hover_actions: true,
    spellcheck: true,
    keyboard_shortcuts: false,
    unread_badge: false,
    auto_advance: 'list',
};
