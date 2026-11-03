# Delivery and ingress recovery

Implemented locally on November 1, 2026. These paths use the existing PostgreSQL and D1 stores; no paid worker process, artificial keep-alive, or additional storage service is required. This document supplements [the deployment and backup runbook](DEPLOYMENT.md).

## Recovering a queued send

A send first commits an immutable encrypted payload, one quota reservation, and one Sent copy to PostgreSQL. A separate transaction commits `dispatching` and `attempted_at` before calling the provider. A process can stop between those transactions and leave an unattempted `queued` intent.

The draft owner can explicitly resume that one intent through authenticated `POST /drafts/{draft}/resume-send`. The normal send endpoint uses the same dispatch eligibility checks. Both paths lock and recheck the active account, draft/intent ownership, current `can_send` membership, the sender in the **saved intent**, recipient suppression, and the existing quota reservation. Administrator status does not grant access to another user's draft. Neither path replaces the intent with current draft content.

Only `queued` intents with no `attempted_at` and no provider ID can begin an attempt. A queued record containing attempt evidence becomes `uncertain`. `dispatching`, `uncertain`, and final outcomes are returned without another provider call. Stale dispatches continue to become uncertain through the existing reconciliation path. Resend documents a [24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys); this recovery action does not retry an ambiguous send, including within that window.

An old reservation is moved into the current local quota windows under the organization quota lock. The allowance check adds zero new recipients because the existing reservation is already counted. Provider usage must still be current and available, and unresolved reservations remain conservatively included. A quota block returns HTTP 422 with `status: queued`, a reason, and `resumable: true`; the reservation remains held. A missing or inconsistent reservation returns `resumable: false` and requires investigation. Recovery never creates a second reservation, Sent copy, or mailbox-byte charge.

There is no automatic outbox worker or promised delivery time. The owner chooses Resume send after inspecting the saved draft. After restoring an older application database, keep external sending disabled and reconcile provider evidence before resuming any old intent: the restore may have rolled back an attempt marker. The normal process-crash guarantee does not establish that a restored record was never attempted.

## Waking the application for durable work

The scheduled Worker checks D1 every 15 minutes and calls `/internal/sync` only when an unleased pending receipt exists and backoff permits it. A successful HTTP response is only a wake/import hint; it does not acknowledge or clear a spool record. Import acknowledgement remains a separate request after the application transaction commits.

`SYNC_TIMEOUT_SECONDS` defaults to 120 and is clamped to 60–180 seconds. Render documents a [roughly one-minute Free cold start](https://render.com/docs/free). Cloudflare documents a [15-minute Cron wall-time limit](https://developers.cloudflare.com/workers/platform/limits/#duration); waiting on network I/O is separate from its Free CPU allowance. The bounded deadline permits a cold start without establishing an uptime or CPU guarantee. Failure increments persisted backoff from 30 minutes up to 16 hours; a later success resets it to 15 minutes. Idle scheduled invocations do not contact Render or Neon.

## Acknowledged payload recovery window

Acknowledgement retains original MIME or signed event bytes in D1. `ACK_RETENTION_SECONDS` defaults to 86400 seconds (24 hours), with a supported range of 3600–86400 seconds. The first acknowledgement fixes `acknowledged_at` and `retained_until`; duplicate acknowledgements and replay do not extend that deadline.

All retained payload bytes remain charged against the same 50 MiB application spool budget, including base64 expansion and record headroom. Capacity pressure never shortens retention or deletes accepted unimported data. It can reject **new** incoming mail. The next scheduled maintenance passes retire at most 100 expired acknowledged payloads per invocation, leaving the original receipt ID/checksum and a counted 512-byte tombstone. Pending receipts are never retired, even if old or replayed. Tombstones are not automatically deleted and continue consuming budget; operators must monitor this finite capacity. This is accounting headroom, not an exact physical D1 size measurement.

The default window requires detection, PostgreSQL restore, receipt comparison, and replay to complete within 24 hours of each affected item's first acknowledgement. A shorter configured window tightens that requirement. Choose and test backup frequency and recovery response accordingly. This retained spool is not a complete backup or a promise that an arbitrary older PostgreSQL restore can recover every message. Once the window expires, the replay endpoint refuses the payload even if scheduled cleanup has not yet run.

### Bounded recovery protocol

These are service-to-service endpoints, not browser administration or arbitrary SQL endpoints. They use the same `INGRESS_SECRET`, five-minute signed timestamp, one-use nonce, and HMAC authentication as claim and acknowledge. Keep the signing secret server-side and out of commands, logs, browser tools, and screenshots. The signature covers `timestamp`, `nonce`, `POST`, the exact path, and the exact JSON body, separated by newline characters. Responses are `no-store`.

1. With the restored application isolated and sending disabled, issue signed `POST /v1/recovery` with `{"limit":10}`. It returns receipt metadata only: `id`, `kind`, `checksum`, `created_at`, `acknowledged_at`, and `retained_until`. It never returns MIME, recipients, subjects, or provider event bodies. Continue with the returned `next_after` as `after`; stop on an empty page. Limits outside 1–10 or cursors longer than 100 characters return 422.
2. Compare each receipt with the restored application's ingress/event receipts. Preserve existing IDs and checksums. For an affected retained receipt, explicitly issue signed `POST /v1/replay` with exactly its `id` and `checksum`. This requeues **one** record, retaining its original ID, checksum, and byte reservation. The ordinary claim/import/acknowledge path then handles it idempotently.
3. A repeated replay returns the pending state without resetting a live lease. Missing or mismatched receipts return 409; expired/discarded acknowledged payloads return 410. Failed imports remain pending for investigation; replay cannot purge them.
4. Confirm restored receipt counts and mailbox content in the isolated recovery procedure before approving cutover. Reconcile outbound intents separately. A recovery endpoint's success is not proof of a successful database restore or delivery.

If required evidence has expired, Cloudflare's [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) document a seven-day Free Time Travel window. [Restoring with Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/#restore-a-database) overwrites the whole database in place and cancels in-flight queries. It requires a separately reviewed recovery plan and explicit approval that preserves newer accepted data; never run it as an automatic retry. No hosted Time Travel restore has been executed here.

### Upgrade order

For an existing D1 database, review and apply `worker/migrations/0002_acknowledged_payload_retention.sql` once **before** deploying the new Worker. Fresh databases use `worker/schema.sql`, which already contains those fields and index; do not apply this additive migration to that fresh schema. Existing acknowledged rows with discarded raw bytes stay tombstones; the migration cannot reconstruct them. Any acknowledged payload still present at upgrade receives a full 24-hour window. Accepted pending rows and accounting are preserved.

## Local evidence and remaining hosted checks

The PHP regressions use disposable MySQL and PostgreSQL databases, fictional drafts, the simulator, and provider doubles. They exercise explicit recovery, privacy and current authorization, immutable payloads, suppression, quota aging, unavailable usage, one Sent copy/reservation, and refusal to retry attempted outcomes. They are not live Resend tests or a PostgreSQL concurrency certification.

Worker tests use Miniflare D1 and fictional MIME/events. They cover retained acknowledgement/accounting, pressure and expiry behavior, bounded cleanup, signed replay, exact bytes and recovery state across local runtime restart, and bounded backoff. Virtual timers simulate a 65-second successful response and a stalled request cancelled at the configured upper bound; these tests do not wait minutes or contact Render. Node 22 emits its experimental MockTimers warning during those two tests.

Results before the subsequent attachment integration: 25 focused PHP tests passed with 109 assertions, scoped Pint passed, and scoped PHPStan reported zero errors. The final Worker run passed all 28 tests; Worker TypeScript, scoped lint, formatting, and `git diff --check` passed. The Worker upgrade test covers pending content, pre-existing purged tombstones, retained content, and unchanged counters. The maximum-MIME local wall-time sample was 34.8 ms; it is not Worker CPU or hosted performance evidence.

Executed commands for this change:

```sh
rtk php artisan test --compact tests/Feature/DeliveryRecoveryTest.php tests/Feature/DeliverySafetyTest.php
rtk proxy vendor/bin/pint --test app/Services/DeliveryService.php app/Http/Controllers/DeliveryRecoveryController.php tests/Feature/DeliveryRecoveryTest.php
rtk proxy vendor/bin/phpstan analyse --debug --no-progress --memory-limit=512M app/Services/DeliveryService.php app/Http/Controllers/DeliveryRecoveryController.php
rtk proxy zsh -lc 'source storage/app/local-env.sh && npm run test:worker'
rtk proxy zsh -lc 'source storage/app/local-env.sh && npm run types:worker'
```

The Worker suite needs local loopback sockets for Miniflare; the restricted sandbox initially rejected them and the isolated local run was repeated with that permission. No credentials, provider deployment, DNS records, live messages, or paid service settings were used. Hosted cold-start/import behavior, Worker Free CPU, account limits, live D1 retention/replay, live provider reconciliation, and an owner-approved off-machine restore drill remain release gates.
