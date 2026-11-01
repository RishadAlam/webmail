<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailTemplate extends Model
{
    public const LIMIT = 50;

    protected $guarded = [];

    protected $visible = ['id', 'name', 'subject', 'body'];

    protected function casts(): array
    {
        return ['name' => 'encrypted', 'subject' => 'encrypted', 'body' => 'encrypted'];
    }
}
