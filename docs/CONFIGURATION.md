# Set up WebMail

Use this guide to connect your team’s email, one step at a time. You do not need to know what an “ingress”, “Worker” or “API key” is before you start — those terms are explained below.

**This release is a pilot.** The demo works with fictional mail. Real email delivery, recovery of hosted data and use on physical phones still need testing. Completing the connection form alone does not make an installation ready for real mail.

## Choose your starting point

- **You already have an account:** sign in with the address and password your administrator supplied. Start with [Personalize your mail](#personalize-your-mail). You do not need provider accounts or API keys.
- **You want to try this project on your computer:** use the [local demo](#run-the-local-demo). It contains fictional mail and sends no external email.
- **You own the installation and want real email:** start with [Connect your own domain](#connect-your-own-domain-start-here). Do not move existing mail until setup and delivery tests are complete.

## Connect your own domain — start here

**Only reading and writing mail? You can skip connection setup.** Your team’s owner handles it once for everyone.

To use an address such as `you@example.com`, the owner needs that domain and accounts with Cloudflare and Resend. Cloudflare receives incoming mail. Resend sends outgoing mail. WebMail is where your team reads and writes it. A domain is the part after `@` in your email address; buying one is separate from this project’s free hosting.

[![Incoming mail goes from the sender through Cloudflare and its receiving service to WebMail. Outgoing mail goes from WebMail through Resend to the recipient.](/help/images/mail-path.svg)](/help/images/mail-path.svg)

### Choose the route that matches your installation

- **Someone already installed WebMail for you:** ask them for the **Incoming mail service address** and **Incoming mail password**. Then follow the five illustrated field instructions below. You can save one field at a time.
- **You are starting from scratch:** first complete [Prepare a hosted installation](#prepare-a-hosted-installation) and [Connect Cloudflare receiving](#connect-cloudflare-receiving). These are technical installation tasks, not just copying keys into a form. If you do not use a terminal, ask the person hosting WebMail to follow those sections with you.
- **You only want to try the demo:** leave the connection fields empty. Demo checks are simulated; they cannot confirm that real email works.

**Before you begin:** keep your Cloudflare and Resend sign-ins and a password manager ready. “API key”, “token” and “secret” all mean private access codes in this guide. Never share them in screenshots or support messages. A saved value is not proof that the service works.

**Follow along with real screens:** the Cloudflare, Resend and WebMail screenshots below were captured in Safari on November 4, 2026. Select an image to enlarge it. Provider forms show unsaved examples; no keys or services were created for the screenshots. Captures exclude private account details and credentials. Diagrams are labeled separately.

### Your setup checklist

1. Install WebMail and its incoming mail service, or get the two incoming-mail values from your installer.
2. Add your sending domain in Resend and verify it using the records Resend supplies. [Sending domain instructions](#connect-resend-sending)
3. Collect the five values below. Open **Administration → Connections**, paste them into their matching fields and select **Save connections**.
4. Run **Check Resend usage** and **Check Cloudflare access**. In demo mode these are simulated only.
5. [Set up delivery updates](#set-up-delivery-updates) so WebMail can learn whether outgoing messages were delivered or failed. This has a separate signing secret that belongs in Cloudflare.
6. [Add people and mailboxes](#add-people-and-mailboxes), then **Synchronize addresses**.
7. Review and approve the exact domain changes before [activating incoming routing](#activate-incoming-routing). Finally, [test receiving and sending](#verify-delivery-and-limits) using addresses you control.

## Find your incoming mail service address

**What is it?** The web address of a small program hosted on Cloudflare that receives mail for WebMail. Cloudflare calls that program a **Worker**. The old field name was **Ingress Worker URL**; “ingress” simply means incoming.

**Where to go:** [Cloudflare dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **webmail-ingress** → **Settings** → **Domains & Routes**. Select your actual Worker name if your installer chose a different one.

1. Find the enabled address for that Worker. It may end in `workers.dev`, or use a dedicated domain your installer configured.
2. Copy the address with `https://` at the beginning. Do not copy the Cloudflare dashboard’s browser address or a preview address.
3. In WebMail, paste it into **Incoming mail service address**. Keep only the host: no `/webhooks/resend`, other path, port, `?` or `#`.

[![Illustrative address example: copy the Worker HTTPS address into Incoming mail service address; do not copy the Cloudflare dashboard URL or a webhook path.](/help/images/worker-address.svg)](/help/images/worker-address.svg)

**No Worker or no enabled address?** Finish [Connect Cloudflare receiving](#connect-cloudflare-receiving) first. This repository starts with `workers_dev: false`, so an address is not automatically available. Your installer must enable a workers.dev address in the deployment configuration or set up a dedicated custom domain. Custom domains must also be allowed in WebMail’s installation settings. [Official Worker address instructions](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)

[![Cloudflare Workers & Pages showing No projects found and the Create application button.](/help/images/cloudflare-workers-page.png)](/help/images/cloudflare-workers-page.png)

**What this screen means:** “No projects found” means there is no Worker address to copy yet. Ask your installer to deploy this repository’s WebMail Worker using the instructions linked above. Creating a blank application alone will not receive WebMail messages. No Worker was deployed in the account used for these screenshots, so its **Domains & Routes** and **Variables and Secrets** screens could not be captured.

## Create your incoming mail password

**What is it?** A private password that WebMail and the Cloudflare Worker both know. They use it to confirm they can trust each other. It is not your Cloudflare login password or a Resend key. The old name was **Ingress shared secret**.

**Already installed?** Use the value your installer saved in their password manager. Cloudflare hides saved secrets; you cannot reveal the old value in its dashboard. If it is lost, arrange a replacement in both places together — changing just one can interrupt receiving and synchronization.

For a **new installation**:

1. Generate a random password of at least **32 characters, without spaces**, in your password manager. Save it as “WebMail incoming mail password”. You create this value yourself; Cloudflare does not issue it.
2. Open [Cloudflare](https://dash.cloudflare.com/) → **Workers & Pages** → your Worker → **Settings** → **Variables and Secrets** → **Add**.
3. Choose **Secret** as the type. Enter `INGRESS_SECRET` as the name, then paste your generated password as the value. Deploy the change.
4. Paste **the same password** into WebMail’s **Incoming mail password** field and select **Save connections**.

[![Illustrative secret mapping: one password from your password manager goes to Cloudflare Secret named INGRESS_SECRET and WebMail Incoming mail password. The values must match.](/help/images/shared-password.svg)](/help/images/shared-password.svg)

[Official Cloudflare secret instructions](https://developers.cloudflare.com/workers/configuration/secrets/). The example above is a diagram, not a screenshot of a live account. It contains no usable password.

## Get your Resend sending key

**What is it?** A private access code that lets WebMail send messages using your Resend account. It is separate from your Resend sign-in password.

1. Open [Resend API Keys](https://resend.com/api-keys) and choose **Create API key**. If you have not verified a sending domain, [do that first](#connect-resend-sending).
2. Name the key **WebMail sending**. Choose **Sending access** and select your verified domain, rather than all domains.
3. Create the key, then copy its full value into your password manager. Resend will not show that value again.
4. Paste it into **Resend sending API key** in WebMail. Select **Save connections**.

[![Resend Add API Key form named WebMail sending, with Sending access selected and the Domain dropdown visible.](/help/images/resend-sending-key.png)](/help/images/resend-sending-key.png)

**Match these choices:** Name → **WebMail sending**; Permission → **Sending access**. The screenshot shows the form’s default **All domains**. Before selecting **Add**, change Domain to your verified sending domain. If it is missing, finish [domain verification](#connect-resend-sending) first. This example was canceled without creating a key.

[![Illustrative key mapping: a Sending access key goes into Resend sending API key; a separate Full access key goes into Resend usage API key.](/help/images/resend-keys.svg)](/help/images/resend-keys.svg)

**Expected result:** WebMail shows **Saved**. Sending stays disabled until your installer enables it for a controlled test. This page does not test the sending key. [Resend’s guide with dashboard screenshots](https://resend.com/docs/dashboard/api-keys/introduction)

## Get your Resend usage key

**Why a second key?** WebMail checks your remaining allowance before sending. Resend requires **Full access** for its usage endpoint; the sending-only key cannot do this.

1. Return to [Resend API Keys](https://resend.com/api-keys) and create another key named **WebMail usage**.
2. Choose **Full access**. This permission is broad: the key can do more than read usage, even though WebMail uses it for that check. Keep it private.
3. Save the new key in your password manager and paste it into **Resend usage API key** in WebMail. This was previously called **Resend management key**.
4. Select **Save connections**, then **Check Resend usage** below the form.

[![Resend Add API Key form named WebMail usage, with Full access selected and the Domain control disabled.](/help/images/resend-usage-key.png)](/help/images/resend-usage-key.png)

**Match these choices:** Name → **WebMail usage**; Permission → **Full access**. Resend disables the Domain choice for this permission. Select **Add** when you are ready, then save the newly shown private value. The screenshot contains only the unsaved form, not a usable key.

**Expected result in a live installation:** “Access check passed”. This confirms usage access, not message delivery. In demo mode the screen will instead say no live account was checked. [Resend’s usage explanation and video](https://resend.com/changelog/account-usage-api)

## Get your Cloudflare domain-check token

**What is it?** A private access code that lets WebMail read your domain’s settings. Cloudflare calls a domain in your account a **zone**. This token does not need permission to edit anything.

1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens), or use **My Profile → API Tokens**.
2. Select **Create Token**, then **Get started** beside **Create Custom Token**. Name it **WebMail domain checks**.
3. Add these two permissions: **Zone → Zone → Read** and **Zone → DNS → Read**. DNS means the records that tell other services where to send traffic and email for your domain.
4. Under **Zone Resources**, select **Include → Specific zone → your mail domain**. Use the same domain configured for WebMail.
5. Continue to the summary, check the two read permissions and domain, then create the token. Copy it into your password manager; it is shown only once.
6. Paste it into **Cloudflare domain-check token**, select **Save connections**, then **Check Cloudflare access**.

[![Cloudflare Create API Token page, with Get started in the Custom token section above the templates.](/help/images/cloudflare-custom-token.png)](/help/images/cloudflare-custom-token.png)

**First screen:** select the blue **Get started** button in **Custom token**. The “Edit zone DNS” template underneath grants a different permission from the one WebMail needs.

[![Cloudflare custom token form with Zone Zone Read and Zone DNS Read, and Include Specific zone selected.](/help/images/cloudflare-token-permissions.png)](/help/images/cloudflare-token-permissions.png)

**Second screen:** match the two **Read** rows. Then choose your domain in the final **Select…** dropdown beside **Specific zone**. It is intentionally unselected in this screenshot. Continue only after choosing your domain; this example was not submitted.

[Watch Cloudflare’s token video and see dashboard screenshots](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/). The official tutorial uses an Edit DNS example; for WebMail, use the **two Read permissions above**. Do not copy the tutorial’s Edit permission or use a Global API Key.

**Expected result:** a live access check can read the configured domain and its DNS records. It does not change those records, test the Worker or confirm delivery.

## Set up delivery updates

Resend needs a way to tell WebMail whether a sent message was delivered, bounced or failed. This notification connection is called a **webhook**. It is separate from the five fields on the Connections page.

1. Open [Resend Webhooks](https://resend.com/webhooks) and add an endpoint. Use your incoming mail service address followed by `/webhooks/resend`, for example `https://webmail-ingress.your-account.workers.dev/webhooks/resend`. Here the path is required; leave it out of the WebMail service-address field.
2. Select the supported email events: `email.sent`, `email.delivered`, `email.bounced`, `email.complained` and `email.failed`.
3. Copy Resend’s **signing secret**, which starts with `whsec_`, into your password manager. This is a different value from either Resend API key and from your incoming mail password.
4. In Cloudflare, open your Worker → **Settings → Variables and Secrets → Add**. Choose **Secret**, name it `RESEND_WEBHOOK_SECRET`, paste the signing secret and deploy the change. **Do not paste it into WebMail’s five connection fields.**
5. During the [controlled delivery test](#verify-delivery-and-limits), check the notification reaches WebMail as well as checking the recipient’s inbox. A notification setup alone is not a delivery test.

[![Resend Add webhook form with a fictional endpoint and email event search showing bounced, complained and delivered events.](/help/images/resend-webhook-events.png)](/help/images/resend-webhook-events.png)

**Where to click:** choose **Add webhook**, enter your own Worker endpoint, then open **Select events to listen for**. Type `email.` to narrow the list and select the five events in step 2; scroll to see more choices. The screenshot’s `mail.example.com` is fictional. Keep the incoming service’s `/webhooks/resend` path. After selecting your events, select **Add** to create the webhook and obtain its signing secret. No webhook was created for this screenshot.

[Resend’s webhook setup instructions](https://resend.com/docs/webhooks/introduction). If someone installed WebMail for you, ask them to confirm this step is complete before enabling real sending.

## See the WebMail connection screen

Open each **Where do I find this?** row for instructions while you fill in the form. The illustrated guide opens in a separate tab, keeping what you have typed in place. You can leave any unchanged fields blank. Saved private codes are hidden and cannot be copied back out of WebMail.

[![WebMail Administration in Safari with Connections selected in the sidebar, the demo notice and the receiving setup section.](/help/images/webmail-connections-safari.png)](/help/images/webmail-connections-safari.png)

**Find the page:** open **Administration → Connections** in WebMail. The screenshot uses the local demo, so its notice says checks are simulated. Scroll down for the Resend keys and Cloudflare token. Open a field’s help as shown in the close-up below.

[![WebMail Connections in the fictional local demo, with the incoming mail fields and their help. No real credentials are shown.](/help/images/webmail-connections.png)](/help/images/webmail-connections.png)

These WebMail screenshots show the local demo, not proof of a connected account. The provider screenshots show real dashboard forms; the colored diagrams explain how values match between services. Provider screens may change; linked official guides provide additional screenshots and videos. No third-party video loads until you open its link.

**If a check fails:** confirm that you saved first, copied the entire code without spaces, selected the correct domain and gave it the permissions listed above. “Saved” only means WebMail stored a value; “Access check passed” only confirms the specific read operation. Neither means mail is ready to move.

## Personalize your mail

There is no public registration. The **Forgot password?** option explains administrator-assisted recovery. An active owner can reset a member’s password in Administration → People after confirming their own password. This revokes the member’s sessions and preserves mail and MFA. It is not an email reset-link service. Owners must keep their authenticator recovery codes and deployment recovery material separately.

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

Sign in as `mira@webmail.test` with password `password`. These are public fictional demo credentials, never production credentials. The local environment must keep `WEBMAIL_PROVIDER=mock` and `EXTERNAL_SENDING_ENABLED=false`. A simulated accepted send is not real delivery.

After changing frontend source, run `npm run build`. On this Mac, `source storage/app/local-env.sh` selects the locally installed Node toolchain if your default Node is incompatible. That ignored helper is specific to this computer. For local PostgreSQL, follow the Docker instructions in the repository README; SQLite is a development convenience only.

## Prepare a hosted installation

The supported architecture is **Render Free → Laravel**, **Neon Free → PostgreSQL**, **Cloudflare Email Routing → Worker → D1 spool**, and **Resend Free → outbound mail**. Original mail, attachments, drafts and sessions live in PostgreSQL; D1 holds accepted ingress until import. The Render filesystem is temporary.

You need an owned domain with a Cloudflare-managed zone, owner-controlled provider accounts and a protected place for encryption keys and backups. Domain registration is not provided by this project. Confirm each account’s current Free eligibility and charging controls before creating services. Do not enable R2, paid Workers, automatic overages, extra quota-evasion accounts or artificial keep-alive pings. Render explicitly excludes Free instances from production use; this setup remains a limited pilot with sleep and availability constraints. [Render Free restrictions](https://render.com/docs/free)

**Hosting screenshots:** Render and Neon required sign-in during this walkthrough, so authenticated setup screens are not included. Use the official illustrated guides linked below with your installer. Database connection strings contain passwords; keep them out of screenshots.

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
| `WEBMAIL_PROVIDER`, `MAIL_MAILER`            | `resend`, `array`                                                                  |
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
4. Create a random shared secret of at least 32 characters in your password manager. Store the same value as Worker `INGRESS_SECRET` and WebMail’s **Incoming mail password**. Paste it into Wrangler’s hidden secret prompt, never into a command argument:

```sh
./node_modules/.bin/wrangler secret put INGRESS_SECRET --config worker/wrangler.jsonc
./node_modules/.bin/wrangler deploy --config worker/wrangler.jsonc
```

The Worker’s `SYNC_TIMEOUT_SECONDS=120` bounds a real backlog wake. The 15-minute trigger acts on pending work; it is not an artificial keep-alive. `ACK_RETENTION_SECONDS=86400` retains acknowledged payloads for one day; unimported accepted payloads are not purged by that retention setting. [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)

5. Leave existing incoming mail routing in place. Complete Connections and create users/mailboxes below, then run **Synchronize addresses** and confirm success. A new Worker has an empty recipient directory and rejects unknown recipients. Do not activate incoming routing until the intended addresses are synchronized.
6. After that confirmation, complete “Activate incoming routing” below. Keep the existing receiving service available through the cutover and controlled delivery checks.

## Connect Resend sending

Open [Resend Domains](https://resend.com/domains) → **Add domain**. Enter the domain used in your team’s From addresses in the **Name** field, then select **Add domain** when ready. Resend will provide the DNS records needed to verify it.

[![Resend Add domain page with the Name field, Advanced options and Add domain button.](/help/images/resend-add-domain.png)](/help/images/resend-add-domain.png)

**Start here:** the pale `updates.example.com` text is Resend’s example, not a value to copy. Use your own domain. This capture stops before submission; no domain or DNS record was added. Review the exact records Resend generates before changing DNS, as described below.

1. Add and verify the domain that matches your authorized From addresses in Resend. Review the exact DKIM/SPF/return-path DNS records supplied by its dashboard. Preserve Cloudflare receiving MX records and unrelated DNS; do not replace them with Resend inbound MX. Do not create multiple SPF records for the same hostname. [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction)
2. Create a domain-restricted **sending key** and a separate **full-access management key** for usage inspection. WebMail needs fresh provider usage before live sends; a sending-only key cannot supply that check. Store them in Connections, not frontend code. [API key permissions](https://resend.com/docs/dashboard/api-keys/introduction)
3. Create a Resend webhook pointing to `https://YOUR_WORKER_HOST/webhooks/resend`. Subscribe to `email.sent`, `email.delivered`, `email.bounced`, `email.complained` and `email.failed`. Store the dashboard’s signing secret in Worker `RESEND_WEBHOOK_SECRET`:

```sh
./node_modules/.bin/wrangler secret put RESEND_WEBHOOK_SECRET --config worker/wrangler.jsonc
```

Use the original `whsec_` value, not the sending API key. The Worker verifies signatures and durably spools events before acknowledgement. [Resend webhooks](https://resend.com/docs/webhooks/introduction)

4. Keep outbound sending disabled until the controlled test stage. An API key being saved is not proof of sending, domain verification or inbox delivery.

## Save connections in WebMail

Sign in as the **owner with TOTP**, open **Administration → Connections**, and confirm your password when asked. Ordinary members and administrators who are not the owner cannot change provider secrets.

| Field in WebMail              | Supply this value                                                     |
| ----------------------------- | --------------------------------------------------------------------- |
| Resend sending API key        | Restricted key for sending from the verified domain                   |
| Resend usage API key          | Full-access key used for usage inspection                             |
| Cloudflare domain-check token | Token with Zone Read and DNS Read for the configured domain’s zone    |
| Incoming mail service address | The HTTPS Worker origin, without `/webhooks/resend` or any other path |
| Incoming mail password        | The exact same value as Worker `INGRESS_SECRET`                       |

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
