<?php

namespace App\Console\Commands;

use App\Services\ProductionConfiguration;
use Illuminate\Console\Command;

class CheckProduction extends Command
{
    protected $signature = 'webmail:check-production';

    protected $description = 'Check production security configuration without contacting providers or the database';

    public function handle(ProductionConfiguration $configuration): int
    {
        $errors = $configuration->errors();
        foreach ($errors as $error) {
            $this->error($error);
        }
        if ($errors !== []) {
            return self::FAILURE;
        }
        $this->info('Production configuration checks passed. Database, provider, backup and deployment readiness are separate release gates.');

        return self::SUCCESS;
    }
}
