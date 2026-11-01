<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MailSignature extends Model
{
    protected $guarded = [];

    protected $visible = ['body'];

    protected function casts(): array
    {
        return ['body' => 'encrypted'];
    }
}
