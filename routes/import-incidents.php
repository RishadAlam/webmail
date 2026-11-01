<?php

use App\Http\Controllers\ImportIncidentController;
use Illuminate\Support\Facades\Route;

Route::post('/admin/import-incidents/retry', ImportIncidentController::class)
    ->middleware(['auth', 'throttle:2,1,admin-import-retry']);
