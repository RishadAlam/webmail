<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\DraftController;
use App\Http\Controllers\InternalSyncController;
use App\Http\Controllers\MailController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => redirect(auth()->check() ? '/mail' : '/login'))->name('home');

Route::middleware(['auth'])->group(function () {
    Route::get('/session', fn (Request $request) => response()->json(['id' => $request->user()->id]));
    Route::get('/drafts/{draft}', [DraftController::class, 'show']);
    Route::get('dashboard', fn () => redirect('/mail'))->name('dashboard');
    Route::get('/mail/{mailbox?}', [MailController::class, 'index'])->name('mail');
    Route::get('/mail/{mailbox}/thread/{thread}', [MailController::class, 'index'])->name('mail.thread');
    Route::get('/messages/{message}/html', [MailController::class, 'html']);
    Route::post('/mail/{mailbox}/actions', [MailController::class, 'mutate'])->middleware('throttle:60,1,mail-actions');
    Route::post('/operations/{operation}/undo', [MailController::class, 'undo']);
    Route::put('/preferences', [MailController::class, 'preferences']);
    Route::post('/sync', [MailController::class, 'sync'])->middleware('throttle:2,1,mail-sync');
    Route::post('/mail/{mailbox}/drafts', [DraftController::class, 'create'])->middleware('throttle:20,1,draft-create');
    Route::put('/drafts/{draft}', [DraftController::class, 'update'])->middleware('throttle:60,1,draft-save');
    Route::delete('/drafts/{draft}', [DraftController::class, 'delete']);
    Route::post('/drafts/{draft}/send', [DraftController::class, 'send'])->middleware('throttle:10,1,send');
    Route::get('/admin', [AdminController::class, 'index']);
    Route::post('/admin/people', [AdminController::class, 'createUser'])->middleware('throttle:10,1,admin-create');
    Route::patch('/admin/people/{user}', [AdminController::class, 'toggleUser'])->middleware('throttle:10,1,admin-toggle');
});

require __DIR__.'/settings.php';

Route::post('/internal/sync', InternalSyncController::class)->middleware('throttle:4,1,internal-sync');
