<?php

namespace App\Http\Controllers\Settings;

use App\Enums\MailPalette;
use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\Contact;
use App\Models\MailTemplate;
use App\Models\User;
use App\Services\MailWriting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class MailSettingsController extends Controller
{
    public function edit(Request $request, MailWriting $writing): mixed
    {
        $mailboxes = $request->user()->mailboxes()->get();
        $sendable = $request->user()->mailboxes()->wherePivot('can_send', true)->pluck('mailboxes.id');
        $identities = Address::whereIn('mailbox_id', $sendable)->where('active', true)->where('enabled', true)
            ->orderBy('email')->get(['mailbox_id', 'email']);

        return Inertia::render('settings/mail', [
            ...$writing->payload($request->user()->id),
            'writingLimits' => ['contacts' => Contact::LIMIT, 'templates' => MailTemplate::LIMIT],
            'mailAccounts' => $mailboxes->map(fn ($mailbox) => $mailbox->only(['id', 'name', 'email'])),
            'sendAsIdentities' => $identities,
        ]);
    }

    public function preferences(Request $request): mixed
    {
        $data = $request->validate([
            'theme' => 'sometimes|required|in:light,dark,system',
            'palette' => ['sometimes', 'required', Rule::enum(MailPalette::class)],
            'density' => 'sometimes|required|in:default,comfortable,compact',
            'pane' => 'sometimes|required|in:none,right,bottom',
            'collapsed' => 'sometimes|required|boolean',
            'swipe_left' => 'sometimes|required|in:archive,read,none',
            'swipe_right' => 'sometimes|required|in:archive,read,none',
            'page_size' => 'sometimes|required|integer|in:10,30,50,100',
            'inbox_order' => 'sometimes|required|in:newest,unread,starred,important',
            'default_reply' => 'sometimes|required|in:reply,reply-all',
            'snippets' => 'sometimes|required|boolean',
            'hover_actions' => 'sometimes|required|boolean',
            'spellcheck' => 'sometimes|required|boolean',
            'keyboard_shortcuts' => 'sometimes|required|boolean',
            'unread_badge' => 'sometimes|required|boolean',
            'auto_advance' => 'sometimes|required|in:list,next,previous',
        ]);
        foreach (['collapsed', 'snippets', 'hover_actions', 'spellcheck', 'keyboard_shortcuts', 'unread_badge'] as $key) {
            if (array_key_exists($key, $data)) {
                $data[$key] = (bool) $data[$key];
            }
        }
        if (array_key_exists('page_size', $data)) {
            $data['page_size'] = (int) $data['page_size'];
        }
        $preferences = DB::transaction(function () use ($request, $data) {
            $user = User::whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $revision = (int) ($user->preferences['_revision'] ?? 0) + 1;
            $user->forceFill(['preferences' => [...($user->preferences ?? []), ...$data, '_revision' => $revision]])->save();

            return $user->preferences;
        }, 3);

        return response()->json($preferences);
    }
}
