import { router } from '@inertiajs/react';
import { useState } from 'react';
import { api } from '@/lib/mail';

type Category =
    | 'mailbox_unavailable'
    | 'storage_held'
    | 'mime_invalid'
    | 'receipt_conflict'
    | 'receipt_invalid'
    | 'acknowledgement_pending'
    | 'temporary_import_failure';

export type ImportIncidentSummary = {
    unresolved: number;
    resolved: number;
    recent: {
        id: number;
        kind: 'mail' | 'event';
        category: Category;
        status: 'unresolved' | 'resolved';
        attempts: number;
        first_seen_at: string;
        last_seen_at: string;
        resolved_at: string | null;
    }[];
};

const categories: Record<Category, { title: string; guidance: string }> = {
    mailbox_unavailable: {
        title: 'Mailbox unavailable',
        guidance:
            'Check the receiving address and mailbox configuration, then retry.',
    },
    storage_held: {
        title: 'Storage needs attention',
        guidance:
            'Review storage measurements and configured mailbox limits, then retry.',
    },
    mime_invalid: {
        title: 'Message format needs review',
        guidance:
            'The retained message could not be imported safely. An owner must review the parser or message limits before retrying.',
    },
    receipt_conflict: {
        title: 'Receipt conflict',
        guidance:
            'This receipt differs from an earlier import. An owner must check the ingress service before retrying.',
    },
    receipt_invalid: {
        title: 'Receipt validation failed',
        guidance:
            'The incoming item failed its integrity or size check. An owner must check the ingress service before retrying.',
    },
    acknowledgement_pending: {
        title: 'Import saved; confirmation pending',
        guidance:
            'Retry to confirm the saved import with the ingress service. The existing import will be reused.',
    },
    temporary_import_failure: {
        title: 'Import could not finish',
        guidance:
            'Retry after checking the application and ingress connection. Delivery events may be waiting for sending to be reconciled.',
    },
};

export function ImportIncidents({
    summary,
}: {
    summary: ImportIncidentSummary;
}) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const retry = async () => {
        setBusy(true);
        setMessage('');
        setError('');
        try {
            const result = await api<{
                imported: number;
                held: number;
                checked_at: string;
                simulated: boolean;
            }>('/admin/import-incidents/retry', 'POST');
            setMessage(
                `Imports confirmed: ${result.imported}. Still held in this batch: ${result.held}. Checked ${new Date(result.checked_at).toLocaleString()}.${result.simulated ? ' Local simulator.' : ''}`,
            );
            router.reload({ only: ['importIncidents'] });
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section aria-labelledby="import-incidents-title">
            <div className="readiness-row">
                <div>
                    <h2 id="import-incidents-title">Incoming imports</h2>
                    <p>
                        {summary.unresolved} unresolved · {summary.resolved}{' '}
                        resolved
                    </p>
                </div>
                <button
                    type="button"
                    className="secondary"
                    onClick={retry}
                    disabled={busy}
                >
                    {busy
                        ? 'Checking pending imports…'
                        : 'Retry pending imports'}
                </button>
            </div>
            <p className="field-help">
                Retry checks up to 10 pending incoming messages and delivery
                events across the workspace. These incident records contain no
                message content or addresses.
            </p>
            {message && <p role="status">{message}</p>}
            {error && (
                <p className="error-text" role="alert">
                    {error}
                </p>
            )}
            {summary.recent.length === 0 ? (
                <p className="admin-empty">
                    No import incidents recorded. This is not a live receiving
                    health check.
                </p>
            ) : (
                <>
                    {summary.unresolved + summary.resolved >
                        summary.recent.length && (
                        <p className="field-help">
                            Showing {summary.recent.length} recent incidents,
                            with unresolved items first.
                        </p>
                    )}
                    {summary.recent.map((incident) => (
                        <div className="delivery-row" key={incident.id}>
                            <div>
                                <strong>
                                    {incident.status === 'resolved'
                                        ? 'Import confirmed'
                                        : categories[incident.category].title}
                                </strong>
                                <p>
                                    {incident.kind === 'mail'
                                        ? 'Incoming mail'
                                        : 'Delivery event'}{' '}
                                    · Incident {incident.id} ·{' '}
                                    {incident.status === 'resolved'
                                        ? 'Resolved'
                                        : 'Held'}
                                </p>
                                {incident.status === 'unresolved' && (
                                    <p>
                                        {categories[incident.category].guidance}
                                    </p>
                                )}
                                {incident.status === 'resolved' && (
                                    <p>
                                        Previous hold:{' '}
                                        {categories[incident.category].title}
                                    </p>
                                )}
                                <p>
                                    First held:{' '}
                                    <time dateTime={incident.first_seen_at}>
                                        {new Date(
                                            incident.first_seen_at,
                                        ).toLocaleString()}
                                    </time>{' '}
                                    · Failed attempts: {incident.attempts}
                                </p>
                                <p>
                                    Last held:{' '}
                                    <time dateTime={incident.last_seen_at}>
                                        {new Date(
                                            incident.last_seen_at,
                                        ).toLocaleString()}
                                    </time>
                                    {incident.resolved_at && (
                                        <>
                                            {' '}
                                            · Resolved:{' '}
                                            <time
                                                dateTime={incident.resolved_at}
                                            >
                                                {new Date(
                                                    incident.resolved_at,
                                                ).toLocaleString()}
                                            </time>
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </section>
    );
}
