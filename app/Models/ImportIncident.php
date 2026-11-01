<?php

namespace App\Models;

use App\Enums\ImportIncidentCategory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property ImportIncidentCategory $category
 * @property Carbon $first_seen_at
 * @property Carbon $last_seen_at
 * @property Carbon|null $resolved_at
 */
class ImportIncident extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected $hidden = ['receipt_id'];

    protected function casts(): array
    {
        return [
            'category' => ImportIncidentCategory::class,
            'attempts' => 'integer',
            'first_seen_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }
}
