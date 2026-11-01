<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    public const LIMIT = 500;

    protected $guarded = [];

    protected $visible = ['id', 'name', 'email'];
}
