<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, mixed> $payload
 * @property array<string, string>|null $recipient_states
 */
class SendIntent extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $hidden = ['payload', 'recipient_states'];

    protected function casts(): array
    {
        return ['payload' => 'encrypted:array', 'recipient_states' => 'encrypted:array', 'attempted_at' => 'datetime'];
    }
}
