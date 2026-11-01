<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\AdminMailboxController;
use App\Http\Controllers\DeliveryRecoveryController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\HelpController;
use App\Http\Controllers\InternalSyncController;
use App\Http\Controllers\MailController;
use App\Http\Controllers\ProviderConnectionController;
use App\Http\Controllers\Settings\MailSettingsController;
use App\Http\Controllers\TrashController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect(auth()->check() ? '/mail' : '/login'))->name('home');
Route::get('/help/{guide}', HelpController::class)->name('help');

Route::middleware(['auth'])->group(function () {
    Route::get('/session', fn (Request $request) => response()->json(['id' => $request->user()->id]));
    Route::get('/drafts/{draft}', [DraftController::class, 'show']);
    Route::get('dashboard', fn () => redirect('/mail'))->name('dashboard');
    Route::get('/mail/{mailbox?}', [MailController::class, 'index'])->name('mail');
    Route::get('/mail/{mailbox}/thread/{thread}', [MailController::class, 'index'])->name('mail.thread');
    Route::get('/messages/{message}/html', [MailController::class, 'html']);
    Route::get('/messages/{message}/original', [MailController::class, 'original'])->middleware('throttle:10,1,mail-export');
    Route::post('/mail/{mailbox}/actions', [MailController::class, 'mutate'])->middleware('throttle:60,1,mail-actions');
    Route::delete('/mail/{mailbox}/trash', [TrashController::class, 'destroy'])->middleware('throttle:10,1,mail-purge');
    Route::post('/operations/{operation}/undo', [MailController::class, 'undo']);
    Route::put('/preferences', [MailSettingsController::class, 'preferences']);
    Route::post('/sync', [MailController::class, 'sync'])->middleware('throttle:2,1,mail-sync');
    Route::post('/mail/{mailbox}/drafts', [DraftController::class, 'create'])->middleware('throttle:20,1,draft-create');
    Route::put('/drafts/{draft}', [DraftController::class, 'update'])->middleware('throttle:60,1,draft-save');
    Route::delete('/drafts/{draft}', [DraftController::class, 'delete']);
    Route::post('/drafts/{draft}/send', [DraftController::class, 'send'])->middleware('throttle:10,1,send');
    Route::post('/drafts/{draft}/resume-send', DeliveryRecoveryController::class)->middleware('throttle:10,1,send');
    Route::get('/admin', [AdminController::class, 'index']);
    Route::get('/admin/connection-settings', [AdminController::class, 'index'])->middleware('password.confirm');
    Route::post('/admin/directory/sync', [AdminController::class, 'syncDirectory'])->middleware('throttle:2,1,admin-directory');
    Route::post('/admin/people', [AdminController::class, 'createUser'])->middleware('throttle:10,1,admin-create');
    Route::patch('/admin/people/{user}', [AdminController::class, 'toggleUser'])->middleware('throttle:10,1,admin-toggle');
    Route::post('/admin/people/{user}/revoke-sessions', [AdminController::class, 'revokeSessions'])->middleware('throttle:10,1,admin-revoke');
    Route::put('/admin/people/{user}/password', [AdminController::class, 'resetPassword'])->middleware('throttle:10,1,admin-reset');
    Route::post('/admin/mailboxes', [AdminMailboxController::class, 'store'])->middleware('throttle:10,1,admin-mailbox');
    Route::patch('/admin/mailboxes/{mailbox}/quota', [AdminMailboxController::class, 'quota'])->middleware('throttle:10,1,admin-mailbox');
    Route::post('/admin/mailboxes/{mailbox}/aliases', [AdminMailboxController::class, 'addAlias'])->middleware('throttle:10,1,admin-mailbox');
    Route::patch('/admin/mailboxes/{mailbox}/aliases/{address}', [AdminMailboxController::class, 'updateAlias'])->middleware('throttle:10,1,admin-mailbox');
    Route::put('/admin/mailboxes/{mailbox}/members/{user}', [AdminMailboxController::class, 'membership'])->middleware('throttle:10,1,admin-mailbox');
    Route::get('/admin/connections', [ProviderConnectionController::class, 'index']);
    Route::middleware(['password.confirm', 'throttle:10,1,admin-connections'])->group(function () {
        Route::put('/admin/connections', [ProviderConnectionController::class, 'update']);
        Route::delete('/admin/connections/{field}', [ProviderConnectionController::class, 'destroy']);
        Route::post('/admin/connections/{connection}/test', [ProviderConnectionController::class, 'test']);
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/organization.php';
require __DIR__.'/mail-settings.php';
require __DIR__.'/attachments.php';
require __DIR__.'/import-incidents.php';

Route::post('/internal/sync', InternalSyncController::class)->middleware('throttle:4,1,internal-sync');
