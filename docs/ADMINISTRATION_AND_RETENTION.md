# Bounded administration and Trash retention

The administrator endpoints require an active owner/administrator with confirmed authenticator MFA in the current session. They expose account and routing metadata; they do not bypass mailbox membership when reading, searching, exporting, sending, or deleting mail.

Routine access changes are limited to other members. The owner, acting administrator, and other administrators cannot be suspended, have their password reset, have sessions revoked, or receive mailbox membership through these controls. Membership changes specify the member and `can_send` permission explicitly and are audited. Creating a shared mailbox requires an explicit active member; the acting administrator does not become a member implicitly. There is no impersonation or MFA-reset endpoint.

Password resets verify the administrator's current password on the server, require a confirmed new password of 12–128 characters, rotate remembered sign-ins, and revoke the member's database sessions. Mail, drafts, passkeys, and authenticator/recovery data remain intact. No credentials are returned or written to audit records. Owner recovery remains an operator procedure, not a reusable bootstrap shortcut.

## Mailbox and address limits

The product limits are five users, ten mailboxes, and 100 explicit receiving addresses including disabled ones. Individual mailbox allocations range from 1 MiB to at most 25 MiB or a lower configured limit. Their total cannot exceed the configured organization budget or 350 MiB. Reducing an allocation below existing retained message and draft bytes is rejected; no mailbox or message is deleted to make an allocation fit.

Aliases use a local part on the fixed configured `MAIL_DOMAIN`. The request cannot supply a different receiving domain or a catch-all. These are local configuration records, not proof of provider/DNS verification. Domain verification, Worker deployment, and actual receiving remain live-provider gates.

`addresses.enabled` is the manual policy; `addresses.active` is effective receiving eligibility. A manually disabled alias remains disabled when accounts are suspended/reinstated or memberships change. Removing the last active member disables effective receiving while retaining the mailbox, messages, and routing policy. Directory changes remain pending until explicit synchronization; a pending edge update can still receive according to the previously confirmed directory. Previously accepted mail stays importable.

All metadata mutations use transactions and the shared quota lock. Address changes and directory snapshots use compatible lock ordering. Audit records contain actions and record identifiers, not message bodies or passwords. Account-management authority is not an automatic mailbox-read grant.

## Explicit permanent deletion from Trash

`DELETE /mail/{mailbox}/trash` accepts `ids` containing 1–30 distinct message IDs and `confirmation: "DELETE"`. The caller must currently belong to the mailbox. Every selected message must still belong to it and already be in Trash. Any mismatch rejects the entire selection. Administration alone does not authorize deletion of another mailbox's messages.

The transaction locks the shared quota row, the mailbox, and the selected messages in stable order, then rechecks current membership. It deletes selected message records and reconciles mailbox `used_bytes` from all retained messages and drafts, including immutable accepted/failed/uncertain draft references. It remains available at storage admission limits. The response's `released_bytes` and `remaining_bytes` are logical content measurements, not a claim that PostgreSQL's physical footprint immediately shrank.

Migration `000009` makes the ingress receipt's message reference nullable with `ON DELETE SET NULL`. Receipt IDs and original checksums remain permanently, so replayed accepted messages are acknowledged without recreating deleted content. The migration's rollback refuses to discard these tombstones after deletions occur; restore a consistent backup instead. No automatic purge or expiration is introduced.

Send intents, quota reservations, provider-event evidence, drafts, and backups are retained independently. Removing a Trash message is not a promise of erasing all delivery payload copies or provider/backup retention. Late delivery events update the retained intent and do not recreate the deleted message. Existing Undo metadata cannot restore a deleted message's original content. The deletion audit stores only mailbox identity and selected count.

Database statement failure rolls back the batch and its storage counter. An unconfirmed response instructs the user to refresh Trash before retrying because a network failure around commit is not proof of whether the commit completed. Tests exercise selected deletion, cross-mailbox/admin denial, confirmation bounds, retained MIME removal, receipt replay, later delivery callbacks, counter reconciliation, and an injected foreign-key failure that leaves the entire batch intact. These tests use isolated local databases; no real messages or provider retention APIs were touched.
