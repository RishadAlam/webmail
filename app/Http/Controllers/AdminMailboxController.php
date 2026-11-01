<?php

namespace App\Http\Controllers;

use App\Concerns\AuthorizesAdministration;
use App\Models\Address;
use App\Models\Mailbox;
use App\Models\User;
use App\Services\AdminMailboxes;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminMailboxController extends Controller
{
    use AuthorizesAdministration;

    public function store(Request $request, AdminMailboxes $mailboxes): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'name' => 'required|string|max:80', 'address' => ['required', 'string', 'regex:/^[a-z0-9][a-z0-9._-]{0,63}$/D'],
            'user_id' => 'required|integer|exists:users,id', 'can_send' => 'required|boolean', 'quota_bytes' => 'required|integer',
        ]);
        $box = $mailboxes->createMailbox($request->user(), $data);

        return response()->json(['id' => $box->id, 'message' => 'Mailbox created. Receiving is pending recipient-directory synchronization.'], 201);
    }

    public function quota(Request $request, Mailbox $mailbox, AdminMailboxes $mailboxes): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['quota_bytes' => 'required|integer']);
        $mailboxes->quota($request->user(), $mailbox, $data['quota_bytes']);

        return response()->json(['ok' => true]);
    }

    public function addAlias(Request $request, Mailbox $mailbox, AdminMailboxes $mailboxes): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['address' => ['required', 'string', 'regex:/^[a-z0-9][a-z0-9._-]{0,63}$/D']]);
        $alias = $mailboxes->addAlias($request->user(), $mailbox, $data['address']);

        return response()->json(['id' => $alias->id, 'message' => 'Alias added. Receiving is pending recipient-directory synchronization.'], 201);
    }

    public function updateAlias(Request $request, Mailbox $mailbox, Address $address, AdminMailboxes $mailboxes): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['active' => 'required|boolean']);
        $mailboxes->alias($request->user(), $mailbox, $address, $data['active']);

        return response()->json(['ok' => true, 'message' => 'Address policy updated. Receiving changes require recipient-directory synchronization.']);
    }

    public function membership(Request $request, Mailbox $mailbox, User $user, AdminMailboxes $mailboxes): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['present' => 'required|boolean', 'can_send' => 'required|boolean']);
        $mailboxes->membership($request->user(), $mailbox, $user, $data['present'], $data['can_send']);

        return response()->json(['ok' => true]);
    }
}
