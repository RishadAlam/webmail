<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * @property array{sender?: string, recipient?: string, subject?: string} $predicates
 * @property array{archive?: bool, read?: bool, star?: bool, important?: bool, category?: string, label_id?: int} $actions
 */
class MailboxRule extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'predicates' => 'array', 'actions' => 'array'];
    }
}
