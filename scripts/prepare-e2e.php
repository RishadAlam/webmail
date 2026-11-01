<?php

// This script owns ONLY storage/e2e.sqlite, never the configured application database.
$path = dirname(__DIR__).'/storage/e2e.sqlite';
if (! is_file($path)) {
    touch($path);
}
putenv('DB_CONNECTION=sqlite');
putenv('DB_DATABASE='.$path);
putenv('DB_URL=');
putenv('APP_ENV=testing');
putenv('POSTROOM_PROVIDER=mock');
foreach (['migrate:fresh --force', 'db:seed --class=DemoSeeder --force'] as $command) {
    passthru(PHP_BINARY.' '.escapeshellarg(dirname(__DIR__).'/artisan').' '.$command, $status);
    if ($status) {
        exit($status);
    }
}

$authState = dirname(__DIR__).'/storage/test-auth.json';
if (is_file($authState)) {
    unlink($authState);
}
