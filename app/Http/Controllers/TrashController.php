<?php

namespace App\Http\Controllers;

use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class TrashController extends Controller
{
    public function destroy(Request $request, Mailbox $mailbox): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        $data = $request->validate([
            'ids' => 'required|array|min:1|max:100',
            'ids.*' => 'required|integer|distinct',
            'confirmation' => 'required|in:DELETE',
        ]);

        try {
            $result = DB::transaction(function () use ($request, $mailbox, $data) {
                DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
                $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
                Gate::forUser(User::findOrFail($request->user()->id))->authorize('view', $box);
                $messages = Message::where('mailbox_id', $box->id)->whereIn('id', $data['ids'])
                    ->orderBy('id')->lockForUpdate()->get(['id', 'folder', 'logical_bytes']);
                abort_unless($messages->count() === count($data['ids']), 403, 'Every selected message must belong to this mailbox.');
                abort_if($messages->contains(fn (Message $message) => $message->folder !== 'trash'), 409,
                    'A selected message is no longer in Trash. No messages were deleted.');

                $released = (int) $messages->sum('logical_bytes');
                // Receipt FKs become null; their IDs/checksums continue to reject import replay.
                // Delivery intents, quota reservations, drafts, and provider events remain intact.
                Message::where('mailbox_id', $box->id)->whereIn('id', $messages->pluck('id'))->delete();
                // Cleanup is allowed at a storage admission stop. Reconcile the logical counter;
                // PostgreSQL's physical footprint may not shrink until its own space reclamation.
                // Every retained draft remains charged, including immutable delivery references.
                $remaining = max(0, (int) Message::where('mailbox_id', $box->id)->sum('logical_bytes')
                    + (int) Draft::where('mailbox_id', $box->id)->sum('logical_bytes'));
                $box->update(['used_bytes' => $remaining]);
                DB::table('audit_events')->insert([
                    'user_id' => $request->user()->id, 'action' => 'messages.permanently_deleted',
                    'target' => 'mailbox:'.$box->id.';count:'.$messages->count(), 'created_at' => now(), 'updated_at' => now(),
                ]);

                return ['deleted' => $messages->count(), 'released_bytes' => $released, 'remaining_bytes' => $remaining];
            }, 3);
        } catch (QueryException) {
            return response()->json(['message' => 'Trash deletion was not confirmed. Refresh Trash before retrying.'], 503);
        }

        return response()->json($result);
    }
}
