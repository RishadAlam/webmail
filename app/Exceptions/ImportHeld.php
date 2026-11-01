<?php

namespace App\Exceptions;

use App\Enums\ImportIncidentCategory;
use RuntimeException;

class ImportHeld extends RuntimeException
{
    public function __construct(public readonly ImportIncidentCategory $category)
    {
        parent::__construct('Incoming item is held.');
    }
}
