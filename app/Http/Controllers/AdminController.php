<?php

namespace App\Http\Controllers;

use App\Concerns\AuthorizesAdministration;
use App\Models\Address;
use App\Models\Mailbox;
use App\Models\SendIntent;
use App\Models\User;
use App\Services\AdminMailboxes;
use App\Services\RecipientDirectory;
use App\Services\UsageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Inertia\Inertia;

class AdminController extends Controller
{
    use AuthorizesAdministration;

    public function index(Request $request, UsageService $usage, RecipientDirectory $directory, AdminMailboxes $administration): mixed
    {
        $this->authorizeAdmin($request);

        return Inertia::render('admin', ['people' => User::select(['id', 'name', 'email', 'role', 'active', 'two_factor_confirmed_at'])->get(),
            'mailboxes' => Mailbox::with(['users' => fn ($query) => $query->select(['users.id', 'name', 'email', 'role', 'active'])])->get()
                ->map(fn (Mailbox $box) => [
                    ...$box->only(['id', 'name', 'email', 'quota_bytes', 'used_bytes']),
                    'members' => $box->users->map(fn (User $user) => [
                        ...$user->only(['id', 'name', 'email', 'role', 'active']),
                        'can_send' => (bool) $user->getRelation('pivot')->getAttribute('can_send'),
                    ])->values()->all(),
                ]),
            'addresses' => Address::all(), 'meters' => $usage->meters(),
            'directory' => $directory->status(), 'limits' => $administration->limits(),
            'deliveries' => SendIntent::select(['id', 'status', 'recipients', 'last_error', 'created_at'])->latest()->limit(30)->get(),
            'audits' => DB::table('audit_events')->latest('id')->limit(30)->get(), 'simulation' => config('postroom.provider') === 'mock',
            'returnMailbox' => $request->user()->mailboxes()->first()?->id]);
    }

    public function createUser(Request $request, AdminMailboxes $administration): mixed
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['name' => 'required|string|max:80', 'address' => ['required', 'regex:/^[a-z0-9][a-z0-9._-]{0,63}$/'], 'password' => 'required|string|min:12|max:128']);
        $administration->createMember($request->user(), $data);

        return response()->json(['message' => 'User created. Receiving is pending recipient-directory synchronization.'], 201);
    }

    public function toggleUser(Request $request, User $user): mixed
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['active' => 'required|boolean']);
        abort_if($user->id === $request->user()->id || $user->role !== 'member', 422, 'Owner and administrator access cannot be suspended here.');
        DB::transaction(function () use ($user, $data, $request) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->id === $request->user()->id || $user->role !== 'member', 422, 'Owner and administrator access cannot be suspended here.');
            $user->forceFill(['active' => $data['active']]);
            if (! $data['active']) {
                $user->setRememberToken(Str::random(60));
            }
            $user->save();
            DB::connection(config('session.connection'))->table(config('session.table'))->where('user_id', $user->id)->delete();
            foreach ($user->mailboxes as $box) {
                app(AdminMailboxes::class)->refreshRecipients($box);
            }
            DB::table('audit_events')->insert(['user_id' => $request->user()->id, 'action' => $data['active'] ? 'user.reinstated' : 'user.suspended', 'target' => (string) $user->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['ok' => true]);
    }

    public function syncDirectory(Request $request, RecipientDirectory $directory): mixed
    {
        $this->authorizeAdmin($request);
        $status = $directory->sync();

        return response()->json($status, $status['status'] === 'failed' ? 503 : 200);
    }

    public function revokeSessions(Request $request, User $user, AdminMailboxes $administration): mixed
    {
        $this->authorizeAdmin($request);
        $administration->revokeSessions($request->user(), $user);

        return response()->json(['ok' => true, 'message' => 'Member sessions and remembered sign-ins revoked.']);
    }

    public function resetPassword(Request $request, User $user, AdminMailboxes $administration): mixed
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'current_password' => 'required|string|current_password',
            'password' => 'required|string|min:12|max:128|confirmed',
        ]);
        $administration->revokeSessions($request->user(), $user, $data['password']);

        return response()->json(['ok' => true, 'message' => 'Member password reset and sessions revoked. Existing mail and two-factor authentication are retained.']);
    }
}
