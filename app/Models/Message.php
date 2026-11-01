<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property list<string> $to
 * @property list<string> $cc
 * @property list<string>|null $reply_to
 * @property list<string>|null $labels
 */
class Message extends Model
{
    protected $guarded = [];

    protected $hidden = ['raw_mime', 'body_html', 'reply_to'];

    protected function casts(): array
    {
        return ['to' => 'array', 'cc' => 'array', 'reply_to' => 'array', 'labels' => 'array', 'is_read' => 'boolean', 'starred' => 'boolean',
            'important' => 'boolean', 'snoozed_until' => 'datetime',
            'has_attachments' => 'boolean', 'body_text' => 'encrypted', 'body_html' => 'encrypted', 'raw_mime' => 'encrypted'];
    }
}
