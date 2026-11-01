export type SearchFields = {
    query: string;
    from: string;
    to: string;
    subject: string;
    label: string;
    after: string;
    before: string;
    scope: string;
    unread: boolean;
    attachments: boolean;
};

const scopes = [
    'all',
    'inbox',
    'archive',
    'starred',
    'important',
    'snoozed',
    'sent',
    'spam',
    'trash',
];
const textFields = ['from', 'to', 'subject', 'label'] as const;

/** Extract only supported form values. Keep all other syntax verbatim so the
 * server remains the validator and complex queries never silently lose terms. */
export function readSearchFields(
    query: string,
    scope: string,
    unread: boolean,
): SearchFields {
    const empty: SearchFields = {
        query,
        from: '',
        to: '',
        subject: '',
        label: '',
        after: '',
        before: '',
        scope: scopes.includes(scope) ? scope : 'all',
        unread,
        attachments: false,
    };
    // Do not normalize away server validation errors while opening the form.
    if (
        Array.from(query).length > 200 ||
        Array.from(query).some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
    )
        return empty;
    const fields = { ...empty };
    const remainder: string[] = [];
    let scopeSeen = false;
    let tokenCount = 0;
    for (let offset = 0; offset < query.length;) {
        // Controls are rejected above; PHP's remaining separator is ASCII space.
        if (query[offset] === ' ') {
            offset++;
            continue;
        }
        const start = offset;
        const literal = query[start] === '"';
        let quoted = false;
        let token = '';
        for (; offset < query.length; offset++) {
            const char = query[offset];
            if (char === '"') quoted = !quoted;
            else if (
                quoted &&
                char === '\\' &&
                ['"', '\\'].includes(query[offset + 1])
            )
                token += query[++offset];
            else if (!quoted && char === ' ') break;
            else token += char;
        }
        if (quoted || !token) return empty;
        if (++tokenCount > 24) return empty;
        const match = literal ? null : /^([a-z]+):(.*)$/i.exec(token);
        const operator = match?.[1].toLowerCase();
        const value = match?.[2] ?? '';
        if (match && !value) return empty;
        if (operator === 'in') {
            if (scopeSeen) return empty;
            scopeSeen = true;
        }
        if (
            operator &&
            textFields.includes(operator as (typeof textFields)[number]) &&
            !fields[operator as (typeof textFields)[number]]
        ) {
            fields[operator as (typeof textFields)[number]] = value;
        } else if (operator === 'in' && scopes.includes(value.toLowerCase())) {
            fields.scope = value.toLowerCase();
        } else if (operator === 'is' && value.toLowerCase() === 'unread')
            fields.unread = true;
        else if (operator === 'has' && value.toLowerCase() === 'attachment')
            fields.attachments = true;
        else if (
            (operator === 'after' || operator === 'before') &&
            !fields[operator] &&
            validDate(value)
        )
            fields[operator] = value;
        else remainder.push(query.slice(start, offset));
    }
    fields.query = remainder.join(' ');
    return fields;
}

function validDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000'))
        return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
        !Number.isNaN(date.valueOf()) &&
        date.toISOString().slice(0, 10) === value
    );
}

export function writeSearchQuery(fields: SearchFields): string {
    const parts = [fields.query.replace(/^ +| +$/g, '')];
    for (const field of textFields) {
        const value = fields[field];
        if (value)
            parts.push(
                `${field}:"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
            );
    }
    if (fields.after) parts.push(`after:${fields.after}`);
    if (fields.before) parts.push(`before:${fields.before}`);
    if (fields.attachments) parts.push('has:attachment');
    return parts.filter(Boolean).join(' ');
}
