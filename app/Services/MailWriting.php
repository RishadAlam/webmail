<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\MailSignature;
use App\Models\MailTemplate;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class MailWriting
{
    /** @return array<string, mixed> */
    public function payload(int $userId): array
    {
        return [
            'contacts' => $this->contacts($userId),
            'templates' => $this->templates($userId),
            'signature' => $this->signature($userId),
        ];
    }

    /** @return list<array<string, mixed>> */
    public function contacts(int $userId, ?string $query = null): array
    {
        $contacts = Contact::where('user_id', $userId)->orderBy('name')->orderBy('id')->limit(Contact::LIMIT)->get();
        if ($query !== null) {
            $needle = mb_strtolower(trim($query));
            $contacts = $contacts->filter(fn (Contact $contact) => str_contains(mb_strtolower($contact->name.' '.$contact->email), $needle))->take(30);
        }

        return array_values($contacts->map(fn (Contact $contact) => $contact->toArray())->all());
    }

    /** @return list<array<string, mixed>> */
    public function templates(int $userId): array
    {
        return array_values(MailTemplate::where('user_id', $userId)->orderBy('id')->limit(MailTemplate::LIMIT)->get()
            ->sortBy(fn (MailTemplate $template) => mb_strtolower($template->name))
            ->map(fn (MailTemplate $template) => $template->toArray())->all());
    }

    /** @return array{body: string} */
    public function signature(int $userId): array
    {
        $signature = MailSignature::where('user_id', $userId)->first();

        return ['body' => $signature ? $signature->body : ''];
    }

    public function lockOwner(int $userId): void
    {
        // Match the global admission-lock order used by mail writes, then
        // serialize this user's count checks and edits across browser tabs.
        DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
        User::whereKey($userId)->lockForUpdate()->firstOrFail();
    }

    public function admitGrowth(int $growth): void
    {
        abort_if($growth > 0 && ! app(StorageBudget::class)->permits($growth), 422,
            'Application storage is full. Your saved content is unchanged. Remove unused content or contact your administrator.');
    }
}
