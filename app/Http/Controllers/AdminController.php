<?php

namespace App\Http\Controllers;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\SendIntent;
use App\Models\User;
use App\Services\UsageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class AdminController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless(in_array($request->user()->role, ['owner', 'admin']) && $request->user()->two_factor_confirmed_at && $request->session()->get('postroom.mfa_user') === $request->user()->id, 403, 'Administrator access requires two-factor verification in this session. Sign out and sign in with your password and authenticator code.');
    }

    public function index(Request $request, UsageService $usage): mixed
    {
        $this->authorizeAdmin($request);

        return Inertia::render('admin', ['people' => User::select(['id', 'name', 'email', 'role', 'active', 'two_factor_confirmed_at'])->get(),
            'mailboxes' => Mailbox::all(), 'addresses' => Address::all(), 'meters' => $usage->meters(),
            'deliveries' => SendIntent::select(['id', 'status', 'recipients', 'last_error', 'created_at'])->latest()->limit(30)->get(),
            'audits' => DB::table('audit_events')->latest('id')->limit(30)->get(), 'simulation' => config('postroom.provider') === 'mock',
            'returnMailbox' => $request->user()->mailboxes()->first()?->id]);
    }

    public function createUser(Request $request): mixed
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['name' => 'required|string|max:80', 'address' => ['required', 'regex:/^[a-z0-9][a-z0-9._-]{0,63}$/'], 'password' => 'required|string|min:12|max:128']);
        $email = $data['address'].'@'.config('postroom.domain');
        DB::transaction(function () use ($request, $data, $email) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            abort_if(User::count() >= 5, 422, 'This pilot supports five users. No provider upgrade will be requested.');
            abort_if(User::where('email', $email)->exists() || Address::where('email', $email)->exists(), 422, 'That address is already in use.');
            $user = User::create(['name' => $data['name'], 'email' => $email, 'password' => $data['password']]);
            $box = Mailbox::create(['name' => $data['name'], 'email' => $email]);
            $box->users()->attach($user, ['can_send' => true]);
            Address::create(['mailbox_id' => $box->id, 'email' => $email, 'active' => true, 'directory_status' => 'pending']);
            DB::table('audit_events')->insert(['user_id' => $request->user()->id, 'action' => 'user.created', 'target' => (string) $user->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['message' => 'User created. Receiving is pending recipient-directory synchronization.'], 201);
    }

    public function toggleUser(Request $request, User $user): mixed
    {
        $this->authorizeAdmin($request);
        $data = $request->validate(['active' => 'required|boolean']);
        abort_if($user->id === $request->user()->id || $user->role === 'owner', 422, 'The active administrator and owner cannot be suspended here.');
        DB::transaction(function () use ($user, $data, $request) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $user->forceFill(['active' => $data['active']])->save();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            foreach ($user->mailboxes as $box) {
                $enabled = $box->users()->where('active', true)->exists();
                Address::where('mailbox_id', $box->id)->update(['active' => $enabled, 'directory_status' => 'pending']);
            }
            DB::table('audit_events')->insert(['user_id' => $request->user()->id, 'action' => $data['active'] ? 'user.reinstated' : 'user.suspended', 'target' => (string) $user->id, 'created_at' => now(), 'updated_at' => now()]);
        });

        return response()->json(['ok' => true]);
    }
}
