<?php

use App\Services\ImportService;
use Illuminate\Support\Facades\Artisan;

Artisan::command('webmail:sync', function () {
    $result = app(ImportService::class)->sync();
    $this->info(json_encode($result, JSON_THROW_ON_ERROR));
})->purpose('Import a bounded batch of durable ingress and reconcile stale dispatch status');
