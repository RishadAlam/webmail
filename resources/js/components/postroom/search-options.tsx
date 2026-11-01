import { Search } from 'lucide-react';
import { useRef, useState } from 'react';
import {
    readSearchFields,
    writeSearchQuery,
    type SearchFields,
} from '@/lib/mail-search-form';

export function SearchOptions({
    query,
    scope,
    unread,
    label,
    category,
    labels,
    onSearch,
}: {
    query: string;
    scope: string;
    unread: boolean;
    label: string;
    category: string;
    labels: string[];
    onSearch: (query: string, fields: SearchFields, category: string) => void;
}) {
    const [fields, setFields] = useState(() => {
        const parsed = readSearchFields(query, scope, unread);
        if (label && !parsed.label) parsed.label = label;
        else if (label && parsed.label !== label)
            parsed.query =
                `${parsed.query} ${writeSearchQuery({ ...readSearchFields('', 'all', false), label })}`.trim();
        return parsed;
    });
    const [selectedCategory, setCategory] = useState(category);
    const [error, setError] = useState('');
    const errorRef = useRef<HTMLParagraphElement>(null);
    const change = (key: keyof SearchFields, value: string | boolean) => {
        setFields((current) => ({ ...current, [key]: value }));
        setError('');
    };
    return (
        <form
            className="advanced-search"
            onSubmit={(event) => {
                event.preventDefault();
                const text = writeSearchQuery(fields);
                const problem =
                    fields.after &&
                    fields.before &&
                    fields.after >= fields.before
                        ? 'Choose an end date later than the start date.'
                        : Array.from(text).length > 200
                          ? 'Shorten your search to 200 characters, including the field names.'
                          : Array.from(text).some(
                                  (char) =>
                                      char.charCodeAt(0) < 32 ||
                                      char.charCodeAt(0) === 127,
                              )
                            ? 'Remove control characters from your search.'
                            : '';
                if (problem) {
                    setError(problem);
                    requestAnimationFrame(() => errorRef.current?.focus());
                    return;
                }
                onSearch(text, fields, selectedCategory);
            }}
        >
            <p className="field-help">
                Find mail by sender, recipient, or subject. All filled fields
                must match.
            </p>
            <label className="search-field search-field-wide">
                Keywords or operators
                <input
                    value={fields.query}
                    onChange={(event) => change('query', event.target.value)}
                    maxLength={200}
                    placeholder="A name, phrase, or search operator"
                />
            </label>
            <div className="search-field-grid">
                {(
                    [
                        ['from', 'From'],
                        ['to', 'To'],
                        ['subject', 'Subject'],
                        ['label', 'Label'],
                    ] as const
                ).map(([key, title]) => (
                    <label className="search-field" key={key}>
                        {title}
                        <input
                            value={fields[key]}
                            onChange={(event) =>
                                change(key, event.target.value)
                            }
                            maxLength={200}
                            autoComplete="off"
                            list={
                                key === 'label'
                                    ? 'search-label-options'
                                    : undefined
                            }
                        />
                    </label>
                ))}
                <datalist id="search-label-options">
                    {labels.map((name) => (
                        <option key={name} value={name} />
                    ))}
                </datalist>
                <label className="search-field">
                    On or after
                    <input
                        type="date"
                        value={fields.after}
                        onChange={(event) =>
                            change('after', event.target.value)
                        }
                    />
                </label>
                <label className="search-field">
                    Before
                    <input
                        type="date"
                        value={fields.before}
                        onChange={(event) =>
                            change('before', event.target.value)
                        }
                    />
                </label>
                <div className="search-field search-select">
                    <label htmlFor="search-form-scope">Search scope</label>
                    <select
                        id="search-form-scope"
                        value={fields.scope}
                        onChange={(event) =>
                            change('scope', event.target.value)
                        }
                    >
                        <option value="all">
                            All mail except Spam and Trash
                        </option>
                        {[
                            'Inbox',
                            'Starred',
                            'Important',
                            'Snoozed',
                            'Sent',
                            'Archive',
                            'Spam',
                            'Trash',
                        ].map((name) => (
                            <option value={name.toLowerCase()} key={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="search-field search-select">
                    <label htmlFor="search-form-category">Category</label>
                    <select
                        id="search-form-category"
                        value={selectedCategory}
                        onChange={(event) => setCategory(event.target.value)}
                    >
                        <option value="">All categories</option>
                        {[
                            'Primary',
                            'Promotions',
                            'Social',
                            'Updates',
                            'Forums',
                        ].map((name) => (
                            <option value={name.toLowerCase()} key={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="search-checkboxes">
                <label>
                    <input
                        type="checkbox"
                        checked={fields.unread}
                        onChange={(event) =>
                            change('unread', event.target.checked)
                        }
                    />
                    Unread only
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={fields.attachments}
                        onChange={(event) =>
                            change('attachments', event.target.checked)
                        }
                    />
                    Has attachment
                </label>
            </div>
            <p className="field-help">
                Search stays in this mailbox. Message bodies and attachment
                contents are not searched.
            </p>
            {error && (
                <p
                    className="mail-search-error"
                    role="alert"
                    tabIndex={-1}
                    ref={errorRef}
                >
                    {error}
                </p>
            )}
            <div className="button-row search-submit">
                <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                        setFields(readSearchFields('', 'all', false));
                        setCategory('');
                        setError('');
                    }}
                >
                    Clear fields
                </button>
                <button className="primary" type="submit">
                    <Search size={18} />
                    Search
                </button>
            </div>
        </form>
    );
}
