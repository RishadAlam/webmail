<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property array{revision:int, checksum:string, recipients:list<array{address:string, active:bool}>}|null $payload
 * @property list<array{id:int, email:string, active:bool}>|null $address_snapshot
 * @property Carbon|null $last_synced_at
 */
class RecipientDirectorySync extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'acknowledged_revision' => 'integer',
            'payload' => 'array',
            'address_snapshot' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }
}
