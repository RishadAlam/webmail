<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property list<string> $to
 * @property list<string> $cc
 * @property list<string> $bcc
 */
class Draft extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $attributes = ['status' => 'draft', 'version' => 1, 'logical_bytes' => 0];

    protected function casts(): array
    {
        return ['to' => 'array', 'cc' => 'array', 'bcc' => 'array', 'body' => 'encrypted'];
    }
}
