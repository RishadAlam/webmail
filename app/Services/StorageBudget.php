<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class StorageBudget
{
    public function measuredBytes(): ?int
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return null;
        }

        return (int) DB::scalar('select pg_database_size(current_database())');
    }

    public function permits(int $logicalGrowth): bool
    {
        $measured = $this->measuredBytes();
        if ($measured === null) {
            return app()->environment(['local', 'testing']);
        }

        // Logical content is not physical storage. Allow room for encryption,
        // retained payload copies, indexes and transaction/page overhead.
        return $measured + max(65536, $logicalGrowth * 6) < config('webmail.database_stop_bytes');
    }
}
