<?php

use App\Http\Controllers\Settings\ContactsController;
use App\Http\Controllers\Settings\MailSettingsController;
use App\Http\Controllers\Settings\WritingController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::get('/settings/mail', [MailSettingsController::class, 'edit'])->name('mail-settings.edit');
    Route::get('/mail-writing', [WritingController::class, 'index']);
    Route::get('/settings/contacts', [ContactsController::class, 'index'])->middleware('throttle:120,1,contact-lookup');
    Route::get('/settings/templates', [WritingController::class, 'templates']);
    Route::get('/settings/signature', [WritingController::class, 'signature']);
    Route::middleware('throttle:60,1,writing-save')->group(function () {
        Route::post('/settings/contacts', [ContactsController::class, 'store']);
        Route::put('/settings/contacts/{contact}', [ContactsController::class, 'update'])->whereNumber('contact');
        Route::delete('/settings/contacts/{contact}', [ContactsController::class, 'destroy'])->whereNumber('contact');
        Route::post('/settings/templates', [WritingController::class, 'storeTemplate']);
        Route::put('/settings/templates/{template}', [WritingController::class, 'updateTemplate'])->whereNumber('template');
        Route::delete('/settings/templates/{template}', [WritingController::class, 'destroyTemplate'])->whereNumber('template');
        Route::put('/settings/signature', [WritingController::class, 'updateSignature']);
    });
});
