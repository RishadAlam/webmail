<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('addresses', function (Blueprint $table) {
            $table->boolean('enabled')->default(true);
        });
        // Retain previously disabled addresses instead of guessing why they were disabled.
        DB::table('addresses')->update(['enabled' => DB::raw('active')]);
    }

    public function down(): void
    {
        Schema::table('addresses', fn (Blueprint $table) => $table->dropColumn('enabled'));
    }
};
