<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_incidents', function (Blueprint $table) {
            $table->id();
            $table->string('receipt_id', 128)->unique();
            $table->string('kind', 8);
            $table->string('category', 40);
            $table->string('status', 12)->default('unresolved');
            $table->unsignedInteger('attempts')->default(1);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamp('resolved_at')->nullable();
            $table->index(['status', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_incidents');
    }
};
