<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->dropForeign(['message_id']));
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->foreignId('message_id')->nullable()->change());
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->foreign('message_id')->references('id')->on('messages')->nullOnDelete());
    }

    public function down(): void
    {
        if (DB::table('ingress_receipts')->whereNull('message_id')->exists()) {
            throw new RuntimeException('Receipt tombstones exist. Restore a consistent backup instead of discarding replay protection.');
        }
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->dropForeign(['message_id']));
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->foreignId('message_id')->nullable(false)->change());
        Schema::table('ingress_receipts', fn (Blueprint $table) => $table->foreign('message_id')->references('id')->on('messages'));
    }
};
