<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('role')->default('member');
            $t->boolean('active')->default(true);
            $t->json('preferences')->nullable();
        });
        Schema::create('mailboxes', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('email')->unique();
            $t->unsignedBigInteger('quota_bytes')->default(26214400);
            $t->unsignedBigInteger('used_bytes')->default(0);
            $t->timestamps();
        });
        Schema::create('mailbox_user', function (Blueprint $t) {
            $t->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->boolean('can_send')->default(false);
            $t->primary(['mailbox_id', 'user_id']);
        });
        Schema::create('addresses', function (Blueprint $t) {
            $t->id();
            $t->foreignId('mailbox_id')->constrained();
            $t->string('email')->unique();
            $t->boolean('active')->default(true);
            $t->string('directory_status')->default('pending');
            $t->timestamps();
        });
        Schema::create('messages', function (Blueprint $t) {
            $t->id();
            $t->foreignId('mailbox_id')->constrained();
            $t->string('thread_id');
            $t->string('message_id')->nullable();
            $t->string('from_name')->default('');
            $t->string('from_email');
            $t->json('to');
            $t->json('cc');
            $t->text('subject')->default('');
            $t->text('body_text');
            $t->text('body_html')->nullable();
            $t->text('raw_mime');
            $t->string('folder')->default('inbox');
            $t->boolean('is_read')->default(false);
            $t->boolean('starred')->default(false);
            $t->json('labels')->nullable();
            $t->unsignedInteger('version')->default(1);
            $t->boolean('has_attachments')->default(false);
            $t->string('delivery_status')->nullable();
            $t->unsignedInteger('logical_bytes')->default(0);
            $t->timestamps();
            $t->index(['mailbox_id', 'folder', 'created_at']);
            $t->index(['mailbox_id', 'thread_id']);
            $t->index(['mailbox_id', 'message_id']);
        });
        Schema::create('drafts', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained();
            $t->foreignId('mailbox_id')->constrained();
            $t->string('from_email');
            $t->json('to');
            $t->json('cc');
            $t->json('bcc');
            $t->text('subject')->default('');
            $t->text('body');
            $t->unsignedInteger('version')->default(1);
            $t->string('thread_id')->nullable();
            $t->string('in_reply_to')->nullable();
            $t->string('status')->default('draft');
            $t->unsignedInteger('logical_bytes')->default(0);
            $t->timestamps();
        });
        Schema::create('send_intents', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->uuid('draft_id')->unique();
            $t->foreignId('user_id')->constrained();
            $t->foreignId('mailbox_id')->constrained();
            $t->text('payload');
            $t->unsignedInteger('recipients');
            $t->string('status')->default('queued');
            $t->string('provider_id')->nullable()->unique();
            $t->string('last_error')->nullable();
            $t->timestamp('attempted_at')->nullable();
            $t->timestamps();
        });
        Schema::create('quota_lock', function (Blueprint $t) {
            $t->unsignedInteger('id')->primary();
        });
        DB::table('quota_lock')->insert(['id' => 1]);
        Schema::create('quota_ledger', function (Blueprint $t) {
            $t->uuid('intent_id')->primary();
            $t->unsignedInteger('recipients');
            $t->timestamp('created_at')->index();
        });
        Schema::create('usage_snapshots', function (Blueprint $t) {
            $t->id();
            $t->string('provider')->unique();
            $t->json('data')->nullable();
            $t->timestamp('observed_at')->nullable();
            $t->string('last_error')->nullable();
            $t->timestamps();
        });
        Schema::create('ingress_receipts', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->foreignId('message_id')->constrained();
            $t->string('checksum');
            $t->timestamps();
        });
        Schema::create('provider_events', function (Blueprint $t) {
            $t->string('id')->primary();
            $t->string('provider_id')->index();
            $t->string('type');
            $t->json('data');
            $t->timestamps();
        });
        Schema::create('suppressions', function (Blueprint $t) {
            $t->string('email')->primary();
            $t->string('reason');
            $t->timestamps();
        });
        Schema::create('mail_operations', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained();
            $t->json('before');
            $t->boolean('undone')->default(false);
            $t->timestamps();
        });
        Schema::create('audit_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->nullable()->constrained();
            $t->string('action');
            $t->string('target');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['audit_events', 'mail_operations', 'suppressions', 'provider_events', 'ingress_receipts', 'usage_snapshots', 'quota_ledger', 'quota_lock', 'send_intents', 'drafts', 'messages', 'addresses', 'mailbox_user', 'mailboxes'] as $table) {
            Schema::dropIfExists($table);
        }
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['role', 'active', 'preferences']));
    }
};
