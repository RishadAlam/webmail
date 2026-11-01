<?php

namespace App\Services;

use App\Models\Draft;
use App\Models\DraftAttachment;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use ZBateson\MailMimeParser\MailMimeParser;
use ZBateson\MailMimeParser\Message\IMultiPart;

class MailAttachments
{
    public const MAX_FILES = 10;

    public const MAX_RAW_BYTES = 131072;

    private const TYPES = ['application/pdf' => ['pdf'], 'image/png' => ['png'], 'image/jpeg' => ['jpg', 'jpeg'], 'image/gif' => ['gif'], 'text/plain' => ['txt']];

    public function authorizeDraft(User $user, Draft $draft): void
    {
        abort_unless($draft->user_id === $user->id, 403);
        Gate::forUser($user)->authorize('send', Mailbox::findOrFail($draft->mailbox_id));
    }

    /** @return array<string, mixed> */
    public function draftResponse(Draft $draft): array
    {
        return [...$draft->toArray(), 'attachments' => DraftAttachment::where('draft_id', $draft->id)->orderBy('id')
            ->get(['id', 'name', 'type', 'size'])->map(fn (DraftAttachment $file): array => [
                'id' => $file->id, 'name' => $file->name, 'type' => $file->type, 'size' => $file->size,
                'url' => '/drafts/'.$draft->id.'/attachments/'.$file->id,
            ])->all()];
    }

    public function store(User $user, Draft $draft, UploadedFile $file, int $version): Draft
    {
        $this->authorizeDraft($user, $draft);
        abort_if(! $file->isValid() || $file->getSize() > self::MAX_RAW_BYTES || $file->getSize() < 1, 422,
            'Choose a nonempty file within the 128 KiB total attachment limit.');
        $content = $file->getContent();
        $name = $this->filename($file->getClientOriginalName());
        $type = (new \finfo(FILEINFO_MIME_TYPE))->buffer($content);
        abort_unless(is_string($type) && isset(self::TYPES[$type]) && in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), self::TYPES[$type], true), 422,
            'Only PDF, PNG, JPEG, GIF and plain .txt files are supported. The file contents must match its type.');
        $size = strlen($content);
        $bytes = 512 + $size + strlen($name) + strlen($type);

        return DB::transaction(function () use ($user, $draft, $version, $name, $type, $size, $bytes, $content) {
            $current = $this->lockEditable($user, $draft, $version);
            $files = DraftAttachment::where('draft_id', $current->id)->get(['size']);
            abort_if($files->count() >= self::MAX_FILES || $files->sum('size') + $size > self::MAX_RAW_BYTES, 422,
                'A draft supports at most 10 attachments and 128 KiB of file contents in total.');
            $box = Mailbox::whereKey($current->mailbox_id)->lockForUpdate()->firstOrFail();
            abort_if(! app(StorageBudget::class)->permits($bytes) || $box->used_bytes + $bytes > $box->quota_bytes
                || Mailbox::sum('used_bytes') + $bytes > config('postroom.organization_bytes'), 422,
                'Mailbox storage is full. Your saved draft and attachments are unchanged.');
            DraftAttachment::create(['draft_id' => $current->id, 'name' => $name, 'type' => $type, 'size' => $size, 'logical_bytes' => $bytes, 'content' => $content]);
            app(DraftMime::class)->render($current);
            $current->update(['version' => $current->version + 1, 'logical_bytes' => $current->logical_bytes + $bytes, 'status' => 'draft']);
            $box->increment('used_bytes', $bytes);

            return $current;
        }, 3);
    }

    public function remove(User $user, Draft $draft, string $attachment, int $version): Draft
    {
        $this->authorizeDraft($user, $draft);

        return DB::transaction(function () use ($user, $draft, $attachment, $version) {
            $current = $this->lockEditable($user, $draft, $version);
            $file = DraftAttachment::where('draft_id', $current->id)->whereKey($attachment)->lockForUpdate()->firstOrFail();
            $box = Mailbox::whereKey($current->mailbox_id)->lockForUpdate()->firstOrFail();
            $bytes = $file->logical_bytes;
            $file->delete();
            $current->update(['version' => $current->version + 1, 'logical_bytes' => max(0, $current->logical_bytes - $bytes), 'status' => 'draft']);
            $box->update(['used_bytes' => max(0, $box->used_bytes - $bytes)]);

            return $current;
        }, 3);
    }

    /** @return list<array{id: string, name: string, type: string, size: int, url: string, content: string}> */
    public function incoming(Message $message): array
    {
        $raw = $message->raw_mime;
        abort_if(strlen($raw) > config('postroom.max_mime_bytes') || substr_count(strtolower($raw), 'content-type:') > 40, 422,
            'Attachment extraction exceeds this pilot’s safety limits. The original message is retained.');
        try {
            $mime = (new MailMimeParser)->parse($raw, false);
            $pending = [[$mime, 0]];
            $count = 0;
            while ($pending !== []) {
                [$part, $depth] = array_pop($pending);
                if (++$count > 40 || $depth > 8) {
                    throw new \RuntimeException('MIME complexity limit.');
                }
                if ($part instanceof IMultiPart) {
                    foreach ($part->getChildParts() as $child) {
                        $pending[] = [$child, $depth + 1];
                    }
                }
            }
            $parts = $mime->getAllAttachmentParts();
            if (count($parts) > self::MAX_FILES) {
                throw new \RuntimeException('Attachment count limit.');
            }
            $attachments = [];
            $total = 0;
            foreach ($parts as $index => $part) {
                $stream = $part->getBinaryContentStream();
                $content = $stream?->read((int) config('postroom.max_mime_bytes') + 1) ?? '';
                $total += strlen($content);
                if ($total > config('postroom.max_mime_bytes')) {
                    throw new \RuntimeException('Decoded attachment size limit.');
                }
                $type = strtolower($part->getContentType() ?? 'application/octet-stream');
                if (! preg_match('~^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$~', $type) || strlen($type) > 100) {
                    $type = 'application/octet-stream';
                }
                $attachments[] = ['id' => (string) $index, 'name' => $this->filename($part->getFilename() ?? 'attachment-'.($index + 1)),
                    'type' => $type, 'size' => strlen($content), 'url' => '/messages/'.$message->id.'/attachments/'.$index, 'content' => $content];
            }

            return $attachments;
        } catch (\Throwable) {
            abort(422, 'Attachments could not be extracted within this pilot’s safety limits. The original message is retained.');
        }
    }

    public function filename(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^a-zA-Z0-9 ._()-]/', '_', Str::ascii($name)) ?? '';
        $name = trim(substr($name, 0, 120), " .\t\r\n");

        return $name !== '' ? $name : 'attachment';
    }

    private function lockEditable(User $user, Draft $draft, int $version): Draft
    {
        DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
        $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
        $current = Draft::whereKey($draft->id)->lockForUpdate()->firstOrFail();
        $membership = DB::table('mailbox_user')->where('mailbox_id', $current->mailbox_id)->where('user_id', $user->id)->lockForUpdate()->first();
        abort_unless($user->active && $current->user_id === $user->id && $membership?->can_send, 403);
        abort_unless(in_array($current->status, ['draft', 'held'], true), 409, 'Delivery records cannot be changed.');
        abort_unless($current->version === $version, 409, 'Another tab saved this draft. Your saved attachments are unchanged; reload the latest draft before trying again.');

        return $current;
    }
}
