<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('send_intents', fn (Blueprint $table) => $table->longText('recipient_states')->nullable());
    }

    public function down(): void
    {
        Schema::table('send_intents', fn (Blueprint $table) => $table->dropColumn('recipient_states'));
    }
};
