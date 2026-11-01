# Incoming import incidents

Migration `2026_11_01_000013_create_import_incidents.php` adds the operational incident log. Apply application migrations before serving the updated administration page.

The importer keeps one incident per bounded ingress receipt ID. A repeated failure updates its fixed category, last observation and saturated failure count; the first observation remains unchanged. Records contain only an internal receipt identifier, item kind, category, status, count and timestamps. They contain no subject, body, addresses, raw payload, exception text or credentials. The administrator response omits even the ingress identifier and uses the local incident number instead.

Admin → Delivery shows unresolved and resolved counts and at most 30 recent records, prioritizing unresolved items. An empty log means no incidents have been observed by this version; it is not evidence of live receiving health. The log is operational metadata and does not grant administrators access to mailbox content.

| Category                   | Meaning and recovery                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mailbox_unavailable`      | The receiving address or mailbox is unavailable. Repair its configuration before retrying.                                                                  |
| `storage_held`             | A mailbox, organization or database admission check held the item. Review configured limits and measurements; an unavailable measurement is not zero usage. |
| `mime_invalid`             | A deliberate MIME/header safety check rejected the item. Review the parser or limits without discarding the accepted original.                              |
| `receipt_invalid`          | Receipt shape, payload integrity, size or event JSON validation failed. Check the ingress service.                                                          |
| `receipt_conflict`         | An existing mail receipt has a different checksum. The original committed message remains unchanged.                                                        |
| `acknowledgement_pending`  | The import committed but ingress acknowledgement did not finish. Retrying reuses the committed receipt.                                                     |
| `temporary_import_failure` | An unclassified failure, including an event awaiting outbound acceptance reconciliation. No exception text is retained.                                     |

`POST /admin/import-incidents/retry` takes no parameters and invokes the existing importer for up to ten claimed mail/event items across the workspace. Authentication, an active owner/admin role and session MFA are required; the route permits two attempts per minute. It has no arbitrary URL, query, receipt-selection or provider-action argument. The response is `{ imported, held, checked_at, simulated }`; batch totals are not a count of the full backlog. Claim leases may make some pending items unavailable until a later check.

An incident resolves only after the application import commits and the ingress gateway acknowledges it. Failed imports remain unacknowledged. Retry does not delete accepted payloads or duplicate committed mail; it neither blindly resends outbound messages nor marks provider acceptance as recipient delivery. An ingress-level failure returns a fixed, redacted 503 response. Repair still requires the owner when mailbox configuration, storage, parser behavior or the connection is the underlying cause.

Local verification uses fictional data and a fake ingress gateway, not live providers. `rtk php artisan test --compact tests/Feature/ImportIncidentTest.php` passed 10 tests / 172 assertions. A combined run of ImportIncident, Postroom, MailSemantics, MailOrganization, AdminMailbox, Provider, DeliverySafety and TrashDeletion tests passed 105 tests / 878 assertions. Scoped Pint and PHPStan checks passed; PHPStan used `--debug` because the sandbox disallowed its parallel local socket. Live acknowledgement, cold-start behavior and physical-device review remain separate evidence gates.
