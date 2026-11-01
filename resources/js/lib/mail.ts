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
};
export type Preferences = {
    theme: 'light' | 'dark' | 'system';
    density: 'comfortable' | 'compact';
    pane: 'none' | 'right';
    collapsed: boolean;
    swipe_left: 'archive' | 'read' | 'none';
    swipe_right: 'archive' | 'read' | 'none';
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
    filters: { folder: string; q: string; unread: boolean; page: number };
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
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-XSRF-TOKEN': decodeURIComponent(token ?? ''),
            },
            ...(method !== 'GET' && method !== 'HEAD' && body !== undefined
                ? { body: JSON.stringify(body) }
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
    density: 'comfortable',
    pane: 'none',
    collapsed: false,
    swipe_left: 'archive',
    swipe_right: 'read',
};
