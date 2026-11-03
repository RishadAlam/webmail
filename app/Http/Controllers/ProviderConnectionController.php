<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\ConnectionConfiguration;
use Illuminate\Http\Request;

class ProviderConnectionController extends Controller
{
    public function index(Request $request, ConnectionConfiguration $connections): mixed
    {
        $this->authorizeOwner($request);

        return response()->json($connections->status());
    }

    public function update(Request $request, ConnectionConfiguration $connections): mixed
    {
        $owner = $this->authorizeOwner($request);
        // JSON validation does not flash credential input into redirect sessions.
        abort_unless($request->expectsJson(), 406, 'Connection settings require a JSON request.');
        abort_if(array_diff(array_keys($request->all()), ConnectionConfiguration::FIELDS) !== [], 422, 'Only the listed connection settings can be changed.');
        $data = $request->validate([
            'resend_key' => ['sometimes', 'nullable', 'string', 'min:16', 'max:4096', 'not_regex:/[\x00-\x20\x7f]/'],
            'resend_management_key' => ['sometimes', 'nullable', 'string', 'min:16', 'max:4096', 'not_regex:/[\x00-\x20\x7f]/'],
            'cloudflare_token' => ['sometimes', 'nullable', 'string', 'min:16', 'max:4096', 'not_regex:/[\x00-\x20\x7f]/'],
            'worker_secret' => ['sometimes', 'nullable', 'string', 'min:32', 'max:512', 'not_regex:/[\x00-\x20\x7f]/'],
            'worker_url' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $connections->save($data, $owner->id);

        return response()->json($connections->status());
    }

    public function destroy(Request $request, string $field, ConnectionConfiguration $connections): mixed
    {
        $owner = $this->authorizeOwner($request);
        $connections->clear($field, $owner->id);

        return response()->json($connections->status());
    }

    public function test(Request $request, string $connection, ConnectionConfiguration $connections): mixed
    {
        $owner = $this->authorizeOwner($request);
        $result = $connections->check($connection, $owner->id);

        return response()->json([...$connections->status(), 'message' => $result['error']], in_array($result['status'], ['failed', 'not_configured'], true) ? 422 : 200);
    }

    private function authorizeOwner(Request $request): User
    {
        $user = User::findOrFail($request->user()->id);
        abort_unless($user->active && $user->role === 'owner' && $user->two_factor_confirmed_at
            && $request->session()->get('webmail.mfa_user') === $user->id, 403, 'Provider connections require the active owner and two-factor verification in this session.');

        return $user;
    }
}
