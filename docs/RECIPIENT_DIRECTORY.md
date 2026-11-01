# Recipient-directory synchronization

`App\Services\RecipientDirectory::sync()` publishes one bounded snapshot. `status()` reads local state without contacting a provider. Both return `status`, `revision`, `count`, `last_synced_at`, `last_error`, and `simulation`. Status is `pending`, `synced`, `simulated`, or `failed`. Count is the current local address count; revision identifies the latest prepared snapshot. A successful Worker acknowledgement does not verify DNS routing, Cloudflare deployment, or end-to-end receiving.

The caller must require administrator authorization and MFA before invoking synchronization. No public route, automatic provider deployment, DNS action, or artificial wake request is included. The existing `IngressGateway` interface remains compatible; the built-in gateways add `RecipientDirectoryGateway` capability.

## Durable local state

Migration `2026_11_01_000004_create_recipient_directory_syncs.php` stores the revision, checksum, immutable request payload, address identities, acknowledged revision, target fingerprint, status, and last confirmed timestamp in the application database. Production uses PostgreSQL. A snapshot is committed before making an HTTP request. Network calls do not hold the quota or directory row lock.

An unconfirmed request retries the same revision and content, with a new authenticated request nonce. If addresses change meanwhile, the old snapshot is acknowledged first; changed/new addresses remain pending and the next call publishes a newer revision. Late acknowledgements or failures cannot roll back a newer local state. Recreated local address identities require another acknowledgement even if their routing content matches.

Only an exact acknowledgement of revision, checksum, and count permits matching local address rows to become `synced`. Provider response bodies, exception details, and credentials are not returned as error messages. A timeout is unconfirmed: the Worker might already have committed it. Never treat an error as proof that the old directory is still active.

Mock mode returns `simulated`, leaves `last_synced_at` null, and marks matching addresses `simulated`. Switching to a real gateway requires a new confirmed synchronization. Internal configuration and `X-Postroom-*` protocol names remain unchanged.

## Worker configuration and protocol

The Worker requires `MAIL_DOMAIN` in addition to its existing secrets/bindings. It must match the application's `MAIL_DOMAIN` (`postroom.domain`). The receiving domain comes only from the Worker environment; request fields cannot change it. Laravel needs no new configuration keys.

For a new D1 database, `worker/schema.sql` includes the directory metadata table. For an existing database, review and apply `worker/migrations/0001_recipient_directory_state.sql` before deploying the endpoint. This migration only adds metadata; it does not modify recipients or accepted spool items. No migration or deployment against an external account has been executed by these tests.

`POST /v1/directory` uses the existing HMAC over timestamp, nonce, method, path, and exact body, with `X-Postroom-Time`, `X-Postroom-Nonce`, and `X-Postroom-Signature`. The JSON body contains:

```json
{
    "revision": 1,
    "checksum": "sha256-of-canonical-recipients-json",
    "recipients": [{ "address": "person@example.test", "active": true }]
}
```

The checksum is lowercase SHA-256 hex of the compact JSON array of `{address,active}` objects, sorted by ASCII address. Each key appears in that order. Revisions are positive safe integers. The endpoint allows at most 100 unique lowercase explicit addresses and a 32 KiB request body. It preserves disabled entries as `active:false`; an empty snapshot removes routing entries while retaining accepted spool data.

The acknowledgement contains exactly the committed `revision`, `checksum`, and `count`. Equal revisions with equal content are idempotent. Older revisions or equal revisions with different content return 409. Reused request nonces return 401. Invalid domains/content return 422, oversized requests return 413, and storage failures return 503.

The Worker uses one conditional D1 batch for version update, recipient replacement, and acknowledgement read. Each mutation is gated by the committed revision/checksum, preventing concurrent stale requests from replacing newer data. `json_each` inserts the bounded snapshot in one statement, avoiding one query per address. Accepted spool rows are not part of this transaction.

## Verification boundary

Cloudflare's [D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) states that batched statements form a transaction and roll back on statement failure. Its [SQL documentation](https://developers.cloudflare.com/d1/sql-api/sql-statements/) documents JSON-extension support. These official references were rechecked on November 1, 2026.

PHP tests use isolated databases and fake HTTP responses. Worker tests use Miniflare's D1 implementation, including injected SQLite failure, concurrent revisions, signed replay checks, unknown/disabled recipients, the 100-address boundary, and accepted-spool retention. These are local checks, not evidence of a live Cloudflare deployment or Free CPU feasibility. Restore the directory revision metadata alongside the application database; a stale restored revision must fail closed against a newer Worker directory instead of resetting the Worker version.
