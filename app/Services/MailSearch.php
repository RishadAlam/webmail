<?php

namespace App\Services;

use App\Models\Message;
use Illuminate\Database\Eloquent\Builder;

class MailSearch
{
    public const FOLDERS = ['inbox', 'starred', 'important', 'snoozed', 'sent', 'drafts', 'archive', 'spam', 'trash', 'all'];

    /** @return list<array{operator: string, value: string}> */
    public function parse(string $input): array
    {
        if (mb_strlen($input) > 200 || preg_match('/[\x00-\x1f\x7f]/', $input)) {
            throw new \InvalidArgumentException('Search is limited to 200 characters without control characters.');
        }
        $tokens = [];
        $length = strlen($input);
        for ($offset = 0; $offset < $length;) {
            // Controls are rejected above. Locale-sensitive byte classification
            // can mistake a UTF-8 continuation byte for whitespace.
            if ($input[$offset] === ' ') {
                $offset++;

                continue;
            }
            $quoted = false;
            $literal = $input[$offset] === '"';
            $token = '';
            for (; $offset < $length; $offset++) {
                $char = $input[$offset];
                if ($char === '"') {
                    $quoted = ! $quoted;
                } elseif ($quoted && $char === '\\' && $offset + 1 < $length && in_array($input[$offset + 1], ['"', '\\'], true)) {
                    $token .= $input[++$offset];
                } elseif (! $quoted && $char === ' ') {
                    break;
                } else {
                    $token .= $char;
                }
            }
            if ($quoted || $token === '') {
                throw new \InvalidArgumentException('Close each quoted phrase and provide a search value.');
            }
            $operator = 'text';
            $value = $token;
            if (! $literal && str_contains($token, ':')) {
                [$operator, $value] = explode(':', $token, 2);
                $operator = strtolower($operator);
                if (! in_array($operator, ['from', 'to', 'subject', 'in', 'is', 'has', 'before', 'after', 'label'], true) || $value === '') {
                    throw new \InvalidArgumentException('Use from:, to:, subject:, in:, is:, has:, before:, after:, or label:. Quote literal text containing a colon.');
                }
            }
            if (! $literal && in_array($token, ['OR', 'AND', 'NOT'], true)) {
                throw new \InvalidArgumentException('Boolean operators are unsupported. Search terms are combined with AND; quote a literal word.');
            }
            if ($operator === 'in') {
                $value = strtolower($value);
                if (! in_array($value, self::FOLDERS, true) || collect($tokens)->contains('operator', 'in')) {
                    throw new \InvalidArgumentException('Choose one supported in: folder.');
                }
            }
            if ($operator === 'is' && ! in_array($value = strtolower($value), ['read', 'unread', 'starred', 'important'], true)) {
                throw new \InvalidArgumentException('Use is:read, is:unread, is:starred, or is:important.');
            }
            if ($operator === 'has' && strtolower($value) !== 'attachment') {
                throw new \InvalidArgumentException('Only has:attachment is supported.');
            }
            if (in_array($operator, ['before', 'after'], true)) {
                $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
                if (! $date || $date->format('Y-m-d') !== $value || $date->format('Y') === '0000') {
                    throw new \InvalidArgumentException('Search dates must be valid dates in YYYY-MM-DD format.');
                }
            }
            $tokens[] = ['operator' => $operator, 'value' => $value];
            if (count($tokens) > 24) {
                throw new \InvalidArgumentException('Use no more than 24 search terms.');
            }
        }

        return $tokens;
    }

    /** @param Builder<Message> $query */
    public function folder(Builder $query, string $folder): void
    {
        if (in_array($folder, ['starred', 'important'], true)) {
            $query->where($folder, true)->whereNotIn('folder', ['trash', 'spam']);
        } elseif ($folder === 'all') {
            $query->whereNotIn('folder', ['trash', 'spam']);
        } else {
            $query->where('folder', $folder);
        }
    }

    /**
     * @param  Builder<Message>  $query
     * @param  list<array{operator: string, value: string}>  $tokens
     */
    public function apply(Builder $query, array $tokens): void
    {
        foreach ($tokens as ['operator' => $operator, 'value' => $value]) {
            match ($operator) {
                'in' => null,
                'from' => $this->metadata($query, ['from_email', 'from_name'], $value),
                'to' => $this->metadata($query, ['to', 'cc'], $value),
                'subject' => $this->metadata($query, ['subject'], $value),
                'is' => $query->where(match ($value) {
                    'read', 'unread' => 'is_read', 'starred' => 'starred', 'important' => 'important',
                    default => throw new \InvalidArgumentException('Unsupported is: value.'),
                }, $value !== 'unread'),
                'has' => $query->where('has_attachments', true),
                'before' => $query->where('created_at', '<', $value.' 00:00:00'),
                'after' => $query->where('created_at', '>=', $value.' 00:00:00'),
                'label' => $query->whereJsonContains('labels', $value),
                default => $this->metadata($query, ['subject', 'from_email', 'from_name', 'to', 'cc'], $value),
            };
        }
    }

    /**
     * @param  Builder<Message>  $query
     * @param  list<literal-string>  $columns
     */
    private function metadata(Builder $query, array $columns, string $value): void
    {
        $pattern = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($value)).'%';
        $query->where(function ($inner) use ($columns, $pattern) {
            foreach ($columns as $column) {
                // Column names are an internal allowlist; all search text remains a bound value.
                $inner->orWhereRaw('LOWER(CAST("'.$column.'" AS TEXT)) LIKE ? ESCAPE \'!\'', [$pattern]);
            }
        });
    }
}
