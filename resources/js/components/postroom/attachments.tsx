import { useEffect, useState } from 'react';
import { Download, Paperclip } from 'lucide-react';
import { api, byteText, type MailAttachment } from '@/lib/mail';

export function MessageAttachments({ messageId }: { messageId: number }) {
    const [files, setFiles] = useState<MailAttachment[] | null>(null);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        setFiles(null);
        setError('');
        void api<{ attachments: MailAttachment[] }>(
            `/messages/${messageId}/attachments`,
        )
            .then((result) => {
                if (active) setFiles(result.attachments);
            })
            .catch((cause) => {
                if (active) setError((cause as Error).message);
            });
        return () => {
            active = false;
        };
    }, [messageId, attempt]);
    return (
        <section
            className="message-attachments"
            aria-label="Message attachments"
        >
            <strong>
                <Paperclip size={16} /> Attachments
            </strong>
            {error ? (
                <p role="alert">
                    {error}{' '}
                    <button
                        className="text-link"
                        onClick={() => setAttempt(attempt + 1)}
                    >
                        Retry
                    </button>
                </p>
            ) : files === null ? (
                <p role="status">Loading attachments…</p>
            ) : files.length ? (
                <ul className="attachment-list">
                    {files.map((file) => (
                        <li key={file.id}>
                            <Download size={16} />
                            <a href={file.url} download>
                                {file.name}
                            </a>
                            <small>{byteText(file.size)}</small>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>
                    No separate downloadable files were found in this message.
                </p>
            )}
            <p className="field-help">
                Files download to your device. Only open files you trust.{' '}
                <a
                    className="text-link"
                    href={`/messages/${messageId}/original`}
                    download
                >
                    Download original (.eml)
                </a>
            </p>
        </section>
    );
}
