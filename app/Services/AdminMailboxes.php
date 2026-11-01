<?php

namespace App\Services;

use App\Models\Address;
use App\Models\Mailbox;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AdminMailboxes
{
    /** @return array{domain:string, max_users:int, max_mailboxes:int, max_addresses:int, min_mailbox_bytes:int, max_mailbox_bytes:int} */
    public function limits(): array
    {
        return [
            'domain' => (string) config('postroom.domain'), 'max_users' => 5, 'max_mailboxes' => 10,
            'max_addresses' => 100, 'min_mailbox_bytes' => 1048576,
            'max_mailbox_bytes' => min(26214400, (int) config('postroom.mailbox_bytes')),
        ];
    }

    /** @param array{name:string, address:string, password:string} $data */
    public function createMember(User $actor, array $data): void
    {
        DB::transaction(function () use ($actor, $data) {
            $this->lock();
            abort_if(User::count() >= $this->limits()['max_users'], 422, 'This pilot supports five users. No provider upgrade will be requested.');
            $email = $this->availableAddress($data['address']);
            $this->mailboxCapacity();
            $quota = $this->limits()['max_mailbox_bytes'];
            $this->validateQuota($quota);
            $user = User::create(['name' => $data['name'], 'email' => $email, 'password' => $data['password']]);
            $box = Mailbox::create(['name' => $data['name'], 'email' => $email, 'quota_bytes' => $quota]);
            $box->users()->attach($user, ['can_send' => true]);
            Address::create(['mailbox_id' => $box->id, 'email' => $email, 'enabled' => true, 'active' => true, 'directory_status' => 'pending']);
            $this->audit($actor, 'user.created', (string) $user->id);
        }, 3);
    }

    /** @param array{name:string, address:string, user_id:int, can_send:bool, quota_bytes:int} $data */
    public function createMailbox(User $actor, array $data): Mailbox
    {
        return DB::transaction(function () use ($actor, $data) {
            $this->lock();
            $member = User::whereKey($data['user_id'])->lockForUpdate()->firstOrFail();
            $this->manageableMember($actor, $member);
            abort_unless($member->active, 422, 'Choose an active member for the new mailbox.');
            $email = $this->availableAddress($data['address']);
            $this->mailboxCapacity();
            $this->validateQuota($data['quota_bytes']);
            $box = Mailbox::create(['name' => $data['name'], 'email' => $email, 'quota_bytes' => $data['quota_bytes']]);
            $box->users()->attach($member, ['can_send' => $data['can_send']]);
            Address::create(['mailbox_id' => $box->id, 'email' => $email, 'enabled' => true, 'active' => true, 'directory_status' => 'pending']);
            $this->audit($actor, 'mailbox.created', (string) $box->id);

            return $box;
        }, 3);
    }

    public function quota(User $actor, Mailbox $mailbox, int $bytes): void
    {
        DB::transaction(function () use ($actor, $mailbox, $bytes) {
            $this->lock();
            $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            $this->validateQuota($bytes, $box);
            $box->update(['quota_bytes' => $bytes]);
            $this->audit($actor, 'mailbox.quota_changed', (string) $box->id);
        }, 3);
    }

    public function addAlias(User $actor, Mailbox $mailbox, string $localPart): Address
    {
        return DB::transaction(function () use ($actor, $mailbox, $localPart) {
            $this->lock();
            $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            $email = $this->availableAddress($localPart);
            $alias = Address::create(['mailbox_id' => $box->id, 'email' => $email, 'enabled' => true,
                'active' => $box->users()->where('active', true)->exists(), 'directory_status' => 'pending']);
            $this->audit($actor, 'address.created', (string) $alias->id);

            return $alias;
        }, 3);
    }

    public function alias(User $actor, Mailbox $mailbox, Address $address, bool $enabled): void
    {
        DB::transaction(function () use ($actor, $mailbox, $address, $enabled) {
            $this->lock();
            $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            $alias = Address::whereKey($address->id)->where('mailbox_id', $box->id)->lockForUpdate()->firstOrFail();
            abort_if(! $enabled && User::where('email', $alias->email)->where(fn ($query) => $query->where('role', 'owner')->orWhere('id', $actor->id))->exists(),
                422, 'The owner or current administrator address cannot be disabled here.');
            $alias->update(['enabled' => $enabled, 'active' => $enabled && $box->users()->where('active', true)->exists(), 'directory_status' => 'pending']);
            $this->audit($actor, $enabled ? 'address.enabled' : 'address.disabled', (string) $alias->id);
        }, 3);
    }

    public function membership(User $actor, Mailbox $mailbox, User $user, bool $present, bool $canSend): void
    {
        DB::transaction(function () use ($actor, $mailbox, $user, $present, $canSend) {
            $this->lock();
            $member = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->manageableMember($actor, $member);
            $box = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
            if ($present) {
                $box->users()->syncWithoutDetaching([$member->id => ['can_send' => $canSend]]);
            } else {
                $box->users()->detach($member->id);
            }
            $this->refreshRecipients($box);
            $this->audit($actor, 'mailbox.membership_changed', $box->id.':'.$member->id);
        }, 3);
    }

    public function revokeSessions(User $actor, User $user, ?string $password = null): void
    {
        DB::transaction(function () use ($actor, $user, $password) {
            $this->lock();
            $member = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            $this->manageableMember($actor, $member);
            $member->setRememberToken(Str::random(60));
            if ($password !== null) {
                $member->password = $password;
            }
            $member->save();
            DB::connection(config('session.connection'))->table(config('session.table'))->where('user_id', $member->id)->delete();
            $this->audit($actor, $password === null ? 'user.sessions_revoked' : 'user.password_reset', (string) $member->id);
        }, 3);
    }

    /** Caller holds quota_lock while changing account/membership state. */
    public function refreshRecipients(Mailbox $box): void
    {
        $receiving = $box->users()->where('active', true)->exists();
        Address::where('mailbox_id', $box->id)->update(['active' => $receiving ? DB::raw('enabled') : false, 'directory_status' => 'pending']);
    }

    private function manageableMember(User $actor, User $member): void
    {
        abort_if($member->id === $actor->id || $member->role !== 'member', 422,
            'Only another member can be changed here. Owner and administrator access is protected.');
    }

    private function mailboxCapacity(): void
    {
        abort_if(Mailbox::count() >= $this->limits()['max_mailboxes'], 422, 'This pilot supports at most ten mailboxes.');
    }

    private function availableAddress(string $localPart): string
    {
        $domain = strtolower((string) config('postroom.domain'));
        abort_unless(strlen($domain) <= 253 && preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/D', $domain),
            503, 'Configure the WebMail receiving domain before adding addresses.');
        abort_unless(preg_match('/^[a-z0-9][a-z0-9._-]{0,63}$/D', $localPart) === 1, 422, 'Use an explicit local address.');
        $email = $localPart.'@'.$domain;
        abort_if(strlen($email) > 254, 422, 'That address is too long.');
        abort_if(Address::count() >= $this->limits()['max_addresses'], 422, 'This pilot supports at most 100 receiving addresses, including disabled addresses.');
        abort_if(Address::where('email', $email)->exists() || Mailbox::where('email', $email)->exists() || User::where('email', $email)->exists(), 422, 'That address is already in use.');

        return $email;
    }

    private function validateQuota(int $bytes, ?Mailbox $box = null): void
    {
        $limits = $this->limits();
        abort_if($bytes < $limits['min_mailbox_bytes'] || $bytes > $limits['max_mailbox_bytes'], 422, 'Mailbox allocation must be between 1 MiB and the configured free-pilot maximum.');
        abort_if($box && $bytes < $box->used_bytes, 422, 'The allocation cannot be lower than the mailbox data already retained.');
        $allocated = (int) Mailbox::sum('quota_bytes') - (int) ($box->quota_bytes ?? 0) + $bytes;
        abort_if($allocated > min(367001600, (int) config('postroom.organization_bytes')), 422, 'Mailbox allocations would exceed the organization storage budget.');
    }

    private function lock(): void
    {
        DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
    }

    private function audit(User $actor, string $action, string $target): void
    {
        DB::table('audit_events')->insert(['user_id' => $actor->id, 'action' => $action, 'target' => $target, 'created_at' => now(), 'updated_at' => now()]);
    }
}
