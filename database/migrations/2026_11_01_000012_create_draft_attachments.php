<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('draft_attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('draft_id')->constrained()->cascadeOnDelete();
            $table->string('name', 120);
            $table->string('type', 100);
            $table->unsignedInteger('size');
            $table->unsignedInteger('logical_bytes');
            $table->text('content');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('draft_attachments');
    }
};
