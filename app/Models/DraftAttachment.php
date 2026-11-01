<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class DraftAttachment extends Model
{
    use HasUuids;

    protected $guarded = [];

    protected $hidden = ['content'];

    protected function casts(): array
    {
        return ['content' => 'encrypted'];
    }
}
