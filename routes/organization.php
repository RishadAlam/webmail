<?php

use App\Http\Controllers\MailOrganizationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::get('/settings/organization/{mailbox?}', [MailOrganizationController::class, 'settings'])->name('organization.settings');
    Route::get('/mail/{mailbox}/organization', [MailOrganizationController::class, 'index']);
    Route::middleware('throttle:60,1,mail-organization')->group(function () {
        Route::post('/mail/{mailbox}/labels', [MailOrganizationController::class, 'storeLabel']);
        Route::patch('/mail/{mailbox}/labels/{label}', [MailOrganizationController::class, 'updateLabel']);
        Route::delete('/mail/{mailbox}/labels/{label}', [MailOrganizationController::class, 'deleteLabel']);
        Route::post('/mail/{mailbox}/rules', [MailOrganizationController::class, 'storeRule']);
        Route::patch('/mail/{mailbox}/rules/{rule}', [MailOrganizationController::class, 'updateRule']);
        Route::delete('/mail/{mailbox}/rules/{rule}', [MailOrganizationController::class, 'deleteRule']);
        Route::post('/mail/{mailbox}/blocked-senders', [MailOrganizationController::class, 'blockSender']);
        Route::delete('/mail/{mailbox}/blocked-senders/{blockedSender}', [MailOrganizationController::class, 'unblockSender']);
    });
});
