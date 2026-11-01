<?php

use App\Http\Controllers\AttachmentController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::get('/messages/{message}/attachments', [AttachmentController::class, 'index'])->middleware('throttle:30,1,attachment-list');
    Route::get('/messages/{message}/attachments/{attachment}', [AttachmentController::class, 'download'])->whereNumber('attachment')->middleware('throttle:30,1,attachment-download');
    Route::post('/drafts/{draft}/attachments', [AttachmentController::class, 'store'])->middleware('throttle:20,1,attachment-write');
    Route::delete('/drafts/{draft}/attachments/{attachment}', [AttachmentController::class, 'destroy'])->whereUuid('attachment')->middleware('throttle:20,1,attachment-write');
    Route::get('/drafts/{draft}/attachments/{attachment}', [AttachmentController::class, 'draftDownload'])->whereUuid('attachment')->middleware('throttle:30,1,attachment-download');
});
