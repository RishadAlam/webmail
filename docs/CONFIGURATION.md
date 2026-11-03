# Set up WebMail

WebMail by Hookstack is a private webmail application for a small team. This guide covers personal settings, the local demo, and connecting an owner-managed domain. It is available from **Help → Setup guide**, **Settings → Setup guide**, the sign-in page, and **Administration → Connections**.

**Current release: a local pilot.** The interface and mock-provider workflows are implemented. Live provider delivery, hosted recovery and physical-device acceptance still need verification. This application uses Cloudflare for receiving and Resend for sending; it does not run an SMTP, POP or IMAP server.

## Choose your starting point

- **You already have an account:** sign in with the address and password your administrator supplied. Start with “Personalize your mail” below. You do not need provider accounts or API keys.
- **You want to try this project on your computer:** use the local demo. It contains fictional mail and sends no external email.
- **You own the installation and want real email:** complete the hosted setup, provider connections and controlled delivery checks below before moving anyone’s mail.

There is no public registration. The **Forgot password?** option explains administrator-assisted recovery. An active owner can reset a member’s password in Administration → People after confirming their own password. This revokes the member’s sessions and preserves mail and MFA. It is not an email reset-link service. Owners must keep their authenticator recovery codes and deployment recovery material separately.

## Personalize your mail

Open **Quick settings → View all themes** or **Settings → Themes**. Choose WebMail, Ocean, Forest, Terracotta, Plum or Graphite. Then choose **Light**, **Dark** or **System**; System follows your device. Themes save to your account and do not change email content. These are built-in color palettes; photo backgrounds and custom uploads are not provided.

**Settings → Mail** controls density, reading pane, messages per page, inbox order, reply behavior, snippets, hover actions, spelling, keyboard shortcuts, the unread tab count and what opens after an action. It also contains your contacts, signature and reusable templates. **Settings → Labels & filters** manages mailbox labels, incoming rules and blocked senders. Rules apply to newly imported mail. Your administrator controls mailbox access and authorized From addresses.

Use **Settings → Security** to change your password and configure two-factor authentication. Themes and writing preferences are personal; mailbox labels and rules belong to the selected mailbox and are shared with its authorized members.

## Run the local demo

The direct local profile serves its preview at `http://127.0.0.1:8000`. If it is already open, no installation commands are needed. To restart the existing installation, open a terminal in the project and run:

```sh
php artisan serve --no-reload --host=127.0.0.1 --port=8000
```

Keep the existing `.env`, `APP_KEY` and `database/database.sqlite`. Do not generate another key, reseed, or reset the database during a normal restart. If the port is already in use, use the running preview or stop only the server you started.

For a **new checkout only**, install PHP 8.4+, Composer 2 and Node 22.18+ (or Node 24.11+). Then run from the repository root:

```sh
cp -n .env.example .env
composer install
composer check-platform-reqs
php artisan key:generate
php -r "if (!is_file('database/database.sqlite')) touch('database/database.sqlite');"
php artisan migrate
php artisan db:seed --class=DemoSeeder
npm ci
npm run build
php artisan serve --no-reload --host=127.0.0.1 --port=8000
```

Generate the encryption key only when `.env` has an empty `APP_KEY` and no existing encrypted application data. The demo seeder is for a new local mock installation only. Use the locked dependencies; do not substitute paid editor extensions.

Sign in as `mira@webmail.test` with password `webmail-local-only`. These are public fictional demo credentials, never production credentials. The local environment must keep `WEBMAIL_PROVIDER=mock` and `EXTERNAL_SENDING_ENABLED=false`. A simulated accepted send is not real delivery.

After changing frontend source, run `npm run build`. On this Mac, `source storage/app/local-env.sh` selects the locally installed Node toolchain if your default Node is incompatible. That ignored helper is specific to this computer. For local PostgreSQL, follow the Docker instructions in the repository README; SQLite is a development convenience only.

## Prepare a hosted installation

The supported architecture is **Render Free → Laravel**, **Neon Free → PostgreSQL**, **Cloudflare Email Routing → Worker → D1 spool**, and **Resend Free → outbound mail**. Original mail, attachments, drafts and sessions live in PostgreSQL; D1 holds accepted ingress until import. The Render filesystem is temporary.

You need an owned domain with a Cloudflare-managed zone, owner-controlled provider accounts and a protected place for encryption keys and backups. Domain registration is not provided by this project. Confirm each account’s current Free eligibility and charging controls before creating services. Do not enable R2, paid Workers, automatic overages, extra quota-evasion accounts or artificial keep-alive pings. Render explicitly excludes Free instances from production use; this setup remains a limited pilot with sleep and availability constraints. [Render Free restrictions](https://render.com/docs/free)

1. Create a Neon Free PostgreSQL project. Keep its connection URL in a secret environment setting; never commit it. Configure `sslmode=verify-full`, including inside the URL, and verify the actual hostname and certificate chain. [Neon connections](https://neon.com/docs/connect/connect-from-any-app)
2. Prepare a protected production environment file outside the repository. Use the table below and the complete [deployment runbook](DEPLOYMENT.md). Generate one Laravel `APP_KEY` for this new installation and retain it across redeployments and restores.
3. Build the reviewed `Dockerfile` and run `webmail:check-production`, migrations and `webmail:bootstrap-owner` from an owner-controlled machine using that environment file. The runbook has exact Docker commands. Render Free has no shell/one-off jobs; application startup deliberately performs none of those mutations.
4. Deploy the reviewed image/revision using `render.yaml`: one Free service, automatic deployment off. Use the canonical HTTPS origin as `APP_URL`. `/up` confirms application boot only, not receiving or sending.
5. Sign in as the newly created owner. Open **Settings → Security**, confirm and enroll an authenticator, save recovery codes, then sign out and sign back in with password and TOTP. Administration requires that MFA-verified session.

| Environment setting                          | Value or purpose                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `APP_ENV`, `APP_DEBUG`                       | `production`, `false`                                                              |
| `APP_URL`, `MAIL_DOMAIN`                     | Exact HTTPS application origin; exact owned receiving domain                       |
| `APP_KEY`                                    | Stable private Laravel encryption key; never replace on an existing installation   |
| `DB_CONNECTION`, `DB_URL`, `DB_SSLMODE`      | `pgsql`, protected Neon connection URL, `verify-full`                              |
| `SESSION_DRIVER`, `SESSION_ENCRYPT`          | `database`, `true`                                                                 |
| `SESSION_SECURE_COOKIE`, `SESSION_HTTP_ONLY` | Both `true`                                                                        |
| `SESSION_SAME_SITE`, `SESSION_DOMAIN`        | `lax` or `strict`; leave domain unset for host-only cookies                        |
| `CACHE_STORE`, `QUEUE_CONNECTION`            | Both `database`; the blueprint does not start a queue daemon                       |
| `LOG_CHANNEL`, `LOG_LEVEL`                   | `stderr`, `warning`                                                                |
| `WEBMAIL_PROVIDER`, `MAIL_MAILER`           | `resend`, `array`                                                                  |
| `EXTERNAL_SENDING_ENABLED`                   | `false` until controlled live testing is ready; `true` allows real send requests   |
| `INGRESS_WORKER_URL`                         | Exact HTTPS Worker origin; required at bootstrap to allow a custom Worker hostname |
| `TRUSTED_PROXIES`                            | Only verified ingress IPs/CIDRs if needed; never `*`                               |

Deploy/restart after changing hosted environment values. Do not copy local demo users, passwords or authenticator seeds into production. The setup wizard and automatic DNS provisioning are not complete: provider account setup and initial domain routing are manual owner tasks.

## Connect Cloudflare receiving

The repository supplies `worker/src/index.ts`, `worker/wrangler.jsonc` and `worker/schema.sql`. Commands below are **owner-executed remote changes**, not steps already performed for you. Review the target account/database before executing them; use the repository’s installed Wrangler.

1. Authenticate Wrangler with the intended Cloudflare account. Create a dedicated D1 database:

```sh
./node_modules/.bin/wrangler login
./node_modules/.bin/wrangler d1 create webmail-ingress --config worker/wrangler.jsonc
```

2. Replace `database_id` in `worker/wrangler.jsonc` with the returned UUID. Keep the binding named `DB`. Replace its `APP_URL` with the canonical application HTTPS origin and `MAIL_DOMAIN` with the same domain as Laravel. Initialize **only a new empty database**:

```sh
./node_modules/.bin/wrangler d1 execute webmail-ingress --remote --file worker/schema.sql --config worker/wrangler.jsonc
```

Do not rerun the schema against an existing spool. Fresh schemas already contain retention columns; existing pre-retention databases use the reviewed one-time `worker/migrations/0002_acknowledged_payload_retention.sql` migration after backup, not both. Preserve accepted, unimported messages. [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/)

3. Provide an HTTPS endpoint. This repository defaults to `workers_dev: false`; either configure a dedicated Worker custom domain in its `routes`, or deliberately enable a workers.dev endpoint. A custom origin must also be the exact `INGRESS_WORKER_URL` in Laravel’s environment. The endpoint cannot contain a path, port, query or credentials. Do not reuse an application hostname for the Worker. [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
4. Create a random shared secret of at least 32 characters in your password manager. Store the same value as Worker `INGRESS_SECRET` and WebMail’s **Ingress shared secret**. Paste it into Wrangler’s hidden secret prompt, never into a command argument:

```sh
./node_modules/.bin/wrangler secret put INGRESS_SECRET --config worker/wrangler.jsonc
./node_modules/.bin/wrangler deploy --config worker/wrangler.jsonc
```

The Worker’s `SYNC_TIMEOUT_SECONDS=120` bounds a real backlog wake. The 15-minute trigger acts on pending work; it is not an artificial keep-alive. `ACK_RETENTION_SECONDS=86400` retains acknowledged payloads for one day; unimported accepted payloads are not purged by that retention setting. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

5. Leave existing incoming mail routing in place. Complete Connections and create users/mailboxes below, then run **Synchronize addresses** and confirm success. A new Worker has an empty recipient directory and rejects unknown recipients. Do not activate incoming routing until the intended addresses are synchronized.
6. After that confirmation, complete “Activate incoming routing” below. Keep the existing receiving service available through the cutover and controlled delivery checks.

## Connect Resend sending

1. Add and verify the domain that matches your authorized From addresses in Resend. Review the exact DKIM/SPF/return-path DNS records supplied by its dashboard. Preserve Cloudflare receiving MX records and unrelated DNS; do not replace them with Resend inbound MX. Do not create multiple SPF records for the same hostname. [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
2. Create a domain-restricted **sending key** and a separate **full-access management key** for usage inspection. WebMail needs fresh provider usage before live sends; a sending-only key cannot supply that check. Store them in Connections, not frontend code. [API key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
3. Create a Resend webhook pointing to `https://YOUR_WORKER_HOST/webhooks/resend`. Subscribe to the email delivery, delay, failure, bounce and complaint events supported by the application. Store the dashboard’s signing secret in Worker `RESEND_WEBHOOK_SECRET`:

```sh
./node_modules/.bin/wrangler secret put RESEND_WEBHOOK_SECRET --config worker/wrangler.jsonc
```

Use the original `whsec_` value, not the sending API key. The Worker verifies signatures and durably spools events before acknowledgement. [Resend webhooks](https://resend.com/docs/webhooks/introduction)

4. Keep outbound sending disabled until the controlled test stage. An API key being saved is not proof of sending, domain verification or inbox delivery.

## Save connections in WebMail

Sign in as the **owner with TOTP**, open **Administration → Connections**, and confirm your password when asked. Ordinary members and administrators who are not the owner cannot change provider secrets.

| Field in WebMail            | Supply this value                                                     |
| --------------------------- | --------------------------------------------------------------------- |
| Resend sending key          | Restricted key for sending from the verified domain                   |
| Resend management key       | Full-access key used for usage inspection                             |
| Cloudflare inspection token | Token with Zone Read and DNS Read for the configured domain’s zone    |
| Ingress Worker URL          | The HTTPS Worker origin, without `/webhooks/resend` or any other path |
| Ingress shared secret       | The exact same value as Worker `INGRESS_SECRET`                       |

Select **Save connections**, then run the available Resend management and Cloudflare read-access checks. Those checks are read-only and do not verify the sending key or Worker delivery. Secrets are encrypted in the application database and displayed masked. Empty fields preserve the current values; use the explicit Clear control to remove one. A cleared database value overrides an old environment value.

For an initial environment-based setup, equivalent keys are `RESEND_SENDING_KEY`, `RESEND_MANAGEMENT_KEY`, `CLOUDFLARE_API_TOKEN`, `INGRESS_WORKER_URL` and `INGRESS_SECRET`. In-app saved values take precedence. `RESEND_WEBHOOK_SECRET` belongs only in the Worker. Application URL, mail domain, database settings and the sending-enabled flag remain deployment environment settings.

## Add people and mailboxes

1. In **Administration → People**, create a member using a local address name and a strong initial password. The configured domain is added automatically. Share the password through your organization’s private channel; no invitation email is sent automatically.
2. Check **Mailboxes**. Person creation provisions their personal mailbox. Create additional shared mailboxes when needed; add explicit memberships and decide whether each person may send. Being an administrator does not automatically grant access to private mail.
3. Add aliases in the mailbox controls and ensure their domain matches the configured domain. A login identity, mailbox membership and an authorized sender address are different permissions.
4. Use **Synchronize addresses** in Administration to publish the directory to the Worker. Confirm success after adding or disabling addresses and after membership/suspension changes that affect receiving. Local suspension immediately blocks sign-in; edge routing still requires synchronization.
5. Have the member sign in and change the supplied password. Confirm the right mailbox and From addresses appear before using it for real mail.

## Activate incoming routing

Only continue after **Save connections**, mailbox creation and **Synchronize addresses** have succeeded. Confirm that every address being moved is in the directory; an empty or stale directory can reject mail even when DNS is correct.

Open Cloudflare’s Email Routing for the receiving domain. Review the proposed MX/TXT changes against existing DNS, keep unrelated records, and approve the exact diff before applying it. Changing MX can redirect existing mail. Activate the route to this Email Worker for the intended addresses, or a reviewed catch-all; the Worker accepts only recipients in its synchronized directory. Do not also enable Resend inbound routing for the same root domain. Cloudflare now groups these controls under **Email Service → Route emails** in its documentation. [Cloudflare routing setup](https://developers.cloudflare.com/email-service/get-started/route-emails/)

Keep the previous receiving service available until DNS propagation and controlled delivery checks finish. If routing fails, restore the reviewed previous routing configuration; preserve any mail already accepted into D1 for import and reconciliation.

## Verify delivery and limits

Use a mailbox and external recipient you control. Ask the owner to authorize the live test. First verify a small incoming message reaches D1, imports into PostgreSQL, displays in the intended mailbox and preserves its original MIME. Repeat while the application host is unavailable, then confirm the accepted message imports after recovery. Inspect actual Free Worker CPU usage; a local wall-time test is not a provider CPU measurement.

For an outbound test, the owner enables `EXTERNAL_SENDING_ENABLED=true`, deploys the setting, and sends one small message. Confirm provider acceptance, a signed delivery event, and receipt at the controlled destination separately. Inspect **Administration → Delivery** for send and import incidents. A timeout marked **Uncertain** must be reconciled with provider evidence before sending again. A queued attempt that never contacted the provider may offer **Resume queued send**. [Sending recovery](DELIVERY_RECOVERY.md), [incoming recovery](IMPORT_RECOVERY.md)

Current application guards include 100 recipient deliveries/day and 3,000/month shared across the organization; environment values may lower these caps. Mailboxes default to 25 MiB. The organization has a 350 MiB logical budget and a database stop threshold of at most 750 MiB. These are application limits, not proof of remaining provider allowance. The **Usage** view distinguishes measured, reported, estimated, stale and unavailable values.

Attachments allow up to 10 files totaling 128 KiB of raw data, with PDF, PNG, JPEG, GIF and plain text supported. The complete MIME message must fit 256 KiB, including encoding and headers. No R2 attachment storage is used. Keep external sending disabled whenever verification or quota evidence is incomplete.

## Troubleshoot and maintain

| Problem                                   | What to check                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cannot sign in                            | Correct administrator-created address, active account, current password and required TOTP. There is no public signup or emailed password reset.                                |
| Administration or Connections is denied   | Confirm the required role, enrolled MFA and current TOTP login. Connections is owner-only and requires password confirmation.                                                  |
| Settings do not save                      | Check the network and session, then retry. A failed theme save restores the previous selection.                                                                                |
| Unknown recipient / incoming mail missing | Check receiving DNS, routing to the right Worker, identical mail domains, directory sync, D1 capacity and Delivery import incidents. Do not erase spool records.               |
| Worker URL is rejected                    | Use an HTTPS workers.dev origin, or the exact custom origin configured in `INGRESS_WORKER_URL`. No path, port, redirects or credentials.                                       |
| Sending is disabled or held               | Check the sending flag, authorized From identity, verified domain, recipient quota, storage and fresh Resend usage. Saved credentials alone are insufficient.                  |
| Send result is uncertain                  | Keep the draft and original send intent. Reconcile with provider evidence; do not repeatedly click Send or change idempotency keys.                                            |
| Slow first page                           | A Free host may be waking. Refresh deliberately; do not add synthetic traffic to prevent sleep.                                                                                |
| Blank/error page after deployment         | Check runtime logs for configuration errors, build assets, the canonical host, database TLS, applied migrations and the original `APP_KEY`. Do not enable public debug output. |
| Offline                                   | Keep any unsaved composer open and reconnect. Mail and drafts are not stored for durable offline use.                                                                          |

Back up PostgreSQL and retain the original encryption key separately in owner-controlled encrypted storage. Test restoration into a separate empty database with sending disabled before relying on a backup. Accepted D1 data and uncertain provider outcomes need reconciliation after recovery. The [deployment and backup runbook](DEPLOYMENT.md) contains the commands, startup guards and release gates.

On supported browsers, use **Install app**, or Safari’s **Share → Add to Home Screen**. Installation does not enable offline mail, push notifications or background delivery. For updates, preserve open drafts and deploy reviewed locked dependencies; never wipe or reseed a live installation.
