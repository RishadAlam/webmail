<?php

namespace App\Policies;

use App\Models\Mailbox;
use App\Models\User;

class MailboxPolicy
{
    public function view(User $user, Mailbox $mailbox): bool
    {
        return $user->active && $mailbox->users()->where('users.id', $user->id)->exists();
    }

    public function send(User $user, Mailbox $mailbox): bool
    {
        return $user->active && $mailbox->users()->where('users.id', $user->id)->wherePivot('can_send', true)->exists();
    }
}
