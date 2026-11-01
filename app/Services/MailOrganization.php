<?php

namespace App\Services;

use App\Models\BlockedSender;
use App\Models\Mailbox;
use App\Models\MailboxLabel;
use App\Models\MailboxRule;
use App\Models\Message;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MailOrganization
{
    public const CATEGORIES = ['primary', 'promotions', 'social', 'updates', 'forums'];

    /** @return Collection<int, MailboxLabel> */
    public function labels(Mailbox $mailbox): Collection
    {
        return MailboxLabel::where('mailbox_id', $mailbox->id)->orderBy('name')->orderBy('id')->get();
    }

    /** @return array<string, mixed> */
    public function data(Mailbox $mailbox): array
    {
        $this->retainLegacyLabels($mailbox);

        return [
            'labels' => $this->labels($mailbox)->map->only(['id', 'name', 'color'])->values(),
            'rules' => MailboxRule::where('mailbox_id', $mailbox->id)->orderBy('id')->get()->map->only(['id', 'name', 'enabled', 'predicates', 'actions']),
            'blocked_senders' => BlockedSender::where('mailbox_id', $mailbox->id)->orderBy('email')->get()->map->only(['id', 'email']),
        ];
    }

    public function retainLegacyLabels(Mailbox $mailbox): void
    {
        // Fixtures/imported backups can contain the original JSON representation.
        // Only current message labels are consulted; Undo snapshots never recreate a catalog entry.
        DB::transaction(function () use ($mailbox) {
            Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            $known = $this->labels($mailbox)->pluck('name')->all();
            Message::where('mailbox_id', $mailbox->id)->whereNotNull('labels')->select(['id', 'labels'])->orderBy('id')->chunkById(200, function ($messages) use ($mailbox, &$known) {
                foreach ($messages as $message) {
                    foreach ($message->labels ?? [] as $name) {
                        if ($name !== '' && ! in_array($name, $known, true)) {
                            MailboxLabel::create(['mailbox_id' => $mailbox->id, 'name' => $name, 'color' => '#64748b']);
                            $known[] = $name;
                        }
                    }
                }
            });
        });
    }

    public function resolveSnoozes(Mailbox $mailbox): void
    {
        // Resolution happens during real mailbox work; no keep-alive or exact-time job promise.
        Message::where('mailbox_id', $mailbox->id)->where('folder', 'snoozed')->where('snoozed_until', '<=', now())
            ->update(['folder' => 'inbox', 'snoozed_until' => null, 'version' => DB::raw('version + 1')]);
    }

    public function createLabel(Mailbox $mailbox, string $name, string $color = '#64748b'): MailboxLabel
    {
        if (MailboxLabel::where('mailbox_id', $mailbox->id)->count() >= 100) {
            throw ValidationException::withMessages(['name' => 'This mailbox has reached its 100-label limit.']);
        }
        $this->uniqueLabelName($mailbox, $name);

        return MailboxLabel::create(['mailbox_id' => $mailbox->id, 'name' => $name, 'color' => strtolower($color)]);
    }

    public function uniqueLabelName(Mailbox $mailbox, string $name, ?int $except = null): void
    {
        $query = MailboxLabel::where('mailbox_id', $mailbox->id)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)]);
        if ($except !== null) {
            $query->where('id', '!=', $except);
        }
        if ($query->exists()) {
            throw ValidationException::withMessages(['name' => 'A label with this name already exists.']);
        }
    }

    /** @param array<string, mixed> $data */
    public function actionLabel(Mailbox $mailbox, array $data): MailboxLabel
    {
        if (! empty($data['label_id'])) {
            $label = MailboxLabel::where('mailbox_id', $mailbox->id)->whereKey($data['label_id'])->first();
            if (! $label) {
                throw ValidationException::withMessages(['label_id' => 'Choose an existing label in this mailbox.']);
            }

            return $label;
        }
        $name = trim((string) ($data['label'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['label' => 'Choose a label.']);
        }
        $label = MailboxLabel::where('mailbox_id', $mailbox->id)->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])->first();
        if (! $label && $data['action'] === 'remove-label') {
            throw ValidationException::withMessages(['label' => 'This label no longer exists.']);
        }

        return $label ?? $this->createLabel($mailbox, $name);
    }

    public function changeAssignedLabel(MailboxLabel $label, ?string $name): void
    {
        Message::where('mailbox_id', $label->mailbox_id)->whereJsonContains('labels', $label->name)->orderBy('id')->lockForUpdate()
            ->chunkById(200, function ($messages) use ($label, $name) {
                foreach ($messages as $message) {
                    $labels = array_values(array_filter(array_map(fn ($current) => $current === $label->name ? $name : $current, $message->labels ?? []), fn ($current) => $current !== null));
                    $message->update(['labels' => array_values(array_unique($labels)), 'version' => $message->version + 1]);
                }
            });
    }

    public function applyIncoming(Message $message): void
    {
        foreach (MailboxRule::where('mailbox_id', $message->mailbox_id)->where('enabled', true)->orderBy('id')->limit(50)->get() as $rule) {
            $values = ['sender' => $message->from_email, 'recipient' => implode(' ', [...$message->to, ...$message->cc]), 'subject' => $message->subject];
            $matches = $rule->predicates !== [];
            foreach ($rule->predicates as $field => $needle) {
                if (! str_contains(mb_strtolower($values[$field]), mb_strtolower($needle))) {
                    $matches = false;
                    break;
                }
            }
            if (! $matches) {
                continue;
            }
            $actions = $rule->actions;
            if ($actions['archive'] ?? false) {
                $message->folder = 'archive';
            }
            foreach (['read' => 'is_read', 'star' => 'starred', 'important' => 'important'] as $action => $field) {
                if ($actions[$action] ?? false) {
                    $message->{$field} = true;
                }
            }
            if (isset($actions['category']) && in_array($actions['category'], self::CATEGORIES, true)) {
                $message->category = $actions['category'];
            }
            if (isset($actions['label_id'])) {
                $label = MailboxLabel::where('mailbox_id', $message->mailbox_id)->find($actions['label_id']);
                if ($label) {
                    $message->labels = array_values(array_unique([...($message->labels ?? []), $label->name]));
                }
            }
        }
        // Blocking wins over an archive rule, and retains original MIME and accepted data.
        if (BlockedSender::where('mailbox_id', $message->mailbox_id)->where('email', strtolower($message->from_email))->exists()) {
            $message->folder = 'spam';
        }
        if ($message->isDirty()) {
            $message->save();
        }
    }
}
