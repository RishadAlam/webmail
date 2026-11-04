<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property array<string, string|null>|null $settings
 * @property array<string, array{status: string, checked_at: string|null, error: string|null}>|null $checks
 */
class ProviderConnection extends Model
{
    // This singleton uses the explicit ID 1, not a database-generated ID.
    public $incrementing = false;

    protected $guarded = [];

    protected $hidden = ['settings'];

    protected function casts(): array
    {
        return ['settings' => 'encrypted:array', 'checks' => 'array'];
    }
}
