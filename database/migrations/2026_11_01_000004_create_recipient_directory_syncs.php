<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recipient_directory_syncs', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            $table->unsignedBigInteger('revision')->default(0);
            $table->unsignedBigInteger('acknowledged_revision')->default(0);
            $table->string('checksum', 64)->nullable();
            $table->string('target', 64)->nullable();
            $table->json('payload')->nullable();
            $table->json('address_snapshot')->nullable();
            $table->string('status')->default('pending');
            $table->timestamp('last_synced_at')->nullable();
            $table->string('last_error')->nullable();
            $table->timestamps();
        });
        DB::table('recipient_directory_syncs')->insert(['id' => 1, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function down(): void
    {
        Schema::dropIfExists('recipient_directory_syncs');
    }
};
