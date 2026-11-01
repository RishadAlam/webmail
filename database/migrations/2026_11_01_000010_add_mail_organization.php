<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->boolean('important')->default(false);
            $table->timestamp('snoozed_until')->nullable();
            $table->string('category', 16)->default('primary');
            $table->index(['mailbox_id', 'snoozed_until']);
        });
        Schema::create('mailbox_labels', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('color', 7)->default('#64748b');
            $table->timestamps();
            $table->unique(['mailbox_id', 'name']);
        });
        Schema::create('mailbox_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('name', 80);
            $table->boolean('enabled')->default(true);
            $table->json('predicates');
            $table->json('actions');
            $table->timestamps();
        });
        Schema::create('blocked_senders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('email', 254);
            $table->timestamps();
            $table->unique(['mailbox_id', 'email']);
        });
        // Preserve the original JSON label names; the catalog adds identity/color.
        DB::table('messages')->select(['id', 'mailbox_id', 'labels'])->whereNotNull('labels')->orderBy('id')->chunkById(200, function ($messages) {
            foreach ($messages as $message) {
                foreach (json_decode($message->labels, true, 512, JSON_THROW_ON_ERROR) as $name) {
                    if (is_string($name) && $name !== '') {
                        DB::table('mailbox_labels')->insertOrIgnore(['mailbox_id' => $message->mailbox_id, 'name' => $name,
                            'color' => '#64748b', 'created_at' => now(), 'updated_at' => now()]);
                    }
                }
            }
        });
        // Existing operations predate catalog IDs. Bind their snapshots once so
        // deleting/recreating a same-name label cannot make a stale Undo valid.
        DB::table('mail_operations')->where('undone', false)->orderBy('id')->chunkById(200, function ($operations) {
            foreach ($operations as $operation) {
                $states = json_decode($operation->before, true, 512, JSON_THROW_ON_ERROR);
                foreach ($states as &$state) {
                    $state['_labels'] = [];
                    foreach ($state['labels'] ?? [] as $name) {
                        $state['_labels'][] = ['name' => $name, 'id' => DB::table('mailbox_labels')->where('mailbox_id', $state['mailbox_id'])->where('name', $name)->value('id')];
                    }
                }
                unset($state);
                DB::table('mail_operations')->where('id', $operation->id)->update(['before' => json_encode($states, JSON_THROW_ON_ERROR)]);
            }
        });
    }

    public function down(): void
    {
        // Keep message labels intact when removing the catalog.
        Schema::dropIfExists('blocked_senders');
        Schema::dropIfExists('mailbox_rules');
        Schema::dropIfExists('mailbox_labels');
        Schema::table('messages', function (Blueprint $table) {
            $table->dropIndex(['mailbox_id', 'snoozed_until']);
            $table->dropColumn(['important', 'snoozed_until', 'category']);
        });
    }
};
