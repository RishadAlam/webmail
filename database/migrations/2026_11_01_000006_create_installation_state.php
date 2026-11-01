<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('installation_state', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            // Deliberately not a cascading FK: deleting an owner must never reopen bootstrap.
            $table->unsignedBigInteger('owner_user_id')->nullable();
            $table->timestamp('owner_bootstrapped_at')->nullable();
        });
        DB::table('installation_state')->insert(['id' => 1]);
    }

    public function down(): void
    {
        Schema::dropIfExists('installation_state');
    }
};
