<?php

namespace App\Services;

use App\Models\Draft;
use App\Models\DraftAttachment;
use Symfony\Component\Mime\Email;

class DraftMime
{
    public function __construct(private SafeMail $safe) {}

    /** @return array{raw: string, html: string, text: string, attachments: list<array{filename: string, content: string}>} */
    public function render(Draft $draft, string $intentId = '00000000-0000-0000-0000-000000000000'): array
    {
        $html = $this->safe->html($draft->body);
        $text = html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '<br/>'], "\n", $html)));
        // A draft can be attached before its recipient is entered. The placeholder
        // is used only for the encoded-size check; sending validates real recipients.
        $mime = (new Email)->from($draft->from_email)->to(...($draft->to ?: ['draft@example.invalid']))
            ->subject($draft->subject)->text($text)->html($html);
        $mime->getHeaders()->addIdHeader('Message-ID', $intentId.'@'.config('webmail.domain'));
        if ($draft->cc) {
            $mime->cc(...$draft->cc);
        }
        if ($draft->bcc) {
            $mime->bcc(...$draft->bcc);
        }
        if ($draft->in_reply_to) {
            $mime->getHeaders()->addIdHeader('In-Reply-To', trim($draft->in_reply_to, '<>'));
        }
        $files = DraftAttachment::where('draft_id', $draft->id)->orderBy('id')->limit(MailAttachments::MAX_FILES + 1)->get();
        abort_if($files->count() > MailAttachments::MAX_FILES || $files->sum('size') > MailAttachments::MAX_RAW_BYTES, 422,
            'This draft exceeds the attachment limits. Your saved files are retained.');
        $attachments = [];
        foreach ($files as $file) {
            $content = $file->content;
            abort_unless(strlen($content) === $file->size, 422, 'An attachment could not be verified. Your draft is retained.');
            $mime->attach($content, $file->name, $file->type);
            // The REST API accepts filename + Base64 content. No path or URL is
            // supplied, so neither the application nor provider fetches remote files.
            $attachments[] = ['filename' => $file->name, 'content' => base64_encode($content)];
        }
        $raw = $mime->toString();
        abort_if(strlen($raw) > config('webmail.max_mime_bytes'), 422,
            'The complete encoded message exceeds 256 KiB. Shorten it or remove an attachment; your saved draft is retained.');

        return compact('raw', 'html', 'text', 'attachments');
    }
}
