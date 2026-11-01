<?php

// Local recovery evidence only. This file is deliberately absent from the production image.
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\Message;
use App\Models\SendIntent;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;

require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$database = DB::selectOne('select current_database() as name')->name;
if (! $app->environment(['local', 'testing']) || ! in_array($database, ['webmail_recovery_source', 'webmail_recovery_restored'], true)) {
    throw new RuntimeException('Recovery fixtures are restricted to the two named local disposable databases.');
}
$raw = "From: fixture@example.test\r\nTo: owner@example.test\r\nMessage-ID: <recovery-fixture@example.test>\r\nSubject: Recovery fixture\r\n\r\nFictional encrypted message.\r\n";
$draftBody = '<p>Fictional unsent recovery draft.</p>';
$draftId = '9df91880-3c30-497d-a4f0-a9c0edb1ce01';
$intentId = '9df91880-3c30-497d-a4f0-a9c0edb1ce02';
if (($argv[1] ?? '') === 'seed') {
    if ($database !== 'webmail_recovery_source' || User::exists() || Message::exists()) {
        throw new RuntimeException('Fixture seeding requires the empty disposable source.');
    }
    DB::transaction(function () use ($raw, $draftBody, $draftId, $intentId) {
        $owner = User::create(['name' => 'Recovery Fixture', 'email' => 'owner@example.test', 'password' => 'Fictional-Recovery-Password-42!']);
        $box = Mailbox::create(['name' => 'Recovery Fixture', 'email' => 'owner@example.test']);
        $box->users()->attach($owner, ['can_send' => true]);
        $message = Message::create([
            'mailbox_id' => $box->id, 'thread_id' => 'recovery-thread', 'message_id' => '<recovery-fixture@example.test>',
            'from_email' => 'fixture@example.test', 'to' => ['owner@example.test'], 'cc' => [],
            'subject' => 'Recovery fixture', 'body_text' => 'Fictional encrypted message.', 'raw_mime' => $raw,
            'logical_bytes' => strlen($raw),
        ]);
        Draft::create([
            'id' => $draftId, 'user_id' => $owner->id, 'mailbox_id' => $box->id, 'from_email' => 'owner@example.test',
            'to' => ['fixture@example.test'], 'cc' => [], 'bcc' => [], 'subject' => 'Recovery draft',
            'body' => $draftBody, 'version' => 7,
        ]);
        SendIntent::create([
            'id' => $intentId, 'draft_id' => $draftId, 'user_id' => $owner->id, 'mailbox_id' => $box->id,
            'payload' => ['body' => $draftBody, 'to' => ['fixture@example.test']], 'recipients' => 1,
            'status' => 'uncertain', 'provider_id' => 'recovery-provider-1',
        ]);
        DB::table('quota_ledger')->insert(['intent_id' => $intentId, 'recipients' => 1, 'created_at' => now()]);
        DB::table('ingress_receipts')->insert(['id' => 'recovery-ingress-1', 'message_id' => $message->id, 'checksum' => hash('sha256', $raw), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('provider_events')->insert(['id' => 'recovery-event-1', 'provider_id' => 'recovery-provider-1', 'type' => 'email.sent', 'data' => '{}', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('installation_state')->where('id', 1)->update(['owner_user_id' => $owner->id, 'owner_bootstrapped_at' => now()]);
    });
} elseif (($argv[1] ?? '') !== 'verify') {
    throw new RuntimeException('Expected seed or verify.');
}
$message = Message::sole();
$draft = Draft::findOrFail($draftId);
$intent = SendIntent::findOrFail($intentId);
$ciphertext = (string) DB::table('messages')->value('raw_mime');
if ($message->raw_mime !== $raw || $draft->body !== $draftBody || $draft->version !== 7 || $intent->status !== 'uncertain' || $intent->payload['body'] !== $draftBody || $ciphertext === $raw) {
    throw new RuntimeException('Recovered content or state differs from the fixture.');
}
try {
    (new Encrypter(random_bytes(32), 'AES-256-CBC'))->decrypt($ciphertext, false);
    throw new RuntimeException('Wrong-key decryption unexpectedly succeeded.');
} catch (DecryptException) {
    // Expected: the database backup alone cannot recover encrypted mail.
}
$counts = [];
foreach (['users', 'mailboxes', 'mailbox_user', 'messages', 'drafts', 'send_intents', 'quota_ledger', 'ingress_receipts', 'provider_events', 'installation_state'] as $table) {
    $counts[$table] = DB::table($table)->count();
    if ($counts[$table] !== 1) {
        throw new RuntimeException("Unexpected fixture count: $table");
    }
}
echo json_encode([
    'counts' => $counts, 'raw_mime_sha256' => hash('sha256', $message->raw_mime),
    'raw_ciphertext_sha256' => hash('sha256', $ciphertext), 'draft_sha256' => hash('sha256', $draft->body),
    'draft_ciphertext_sha256' => hash('sha256', (string) DB::table('drafts')->value('body')),
    'draft_id' => $draft->id, 'draft_version' => $draft->version,
    'intent_id' => $intent->id, 'intent_state' => $intent->status,
    'receipt_id' => DB::table('ingress_receipts')->value('id'),
    'receipt_checksum' => DB::table('ingress_receipts')->value('checksum'),
    'event_id' => DB::table('provider_events')->value('id'),
    'bootstrap_consumed' => DB::table('installation_state')->value('owner_bootstrapped_at') !== null,
    'wrong_key_rejected' => true,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)."\n";
