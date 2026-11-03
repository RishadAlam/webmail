<?php

putenv('DB_CONNECTION=mysql');
putenv('DB_DATABASE=webmail_test');
putenv('DB_HOST=127.0.0.1');
putenv('DB_PORT=3306');
putenv('DB_USERNAME=root');
putenv('DB_PASSWORD=');
putenv('DB_URL=');
putenv('APP_ENV=testing');
putenv('WEBMAIL_PROVIDER=mock');
foreach (['migrate:fresh --force', 'db:seed --class=DemoSeeder --force', 'db:seed --class=BrowserAcceptanceSeeder --force'] as $command) {
    passthru(PHP_BINARY.' '.escapeshellarg(dirname(__DIR__).'/artisan').' '.$command, $status);
    if ($status) {
        exit($status);
    }
}

$authState = dirname(__DIR__).'/storage/test-auth.json';
if (is_file($authState)) {
    unlink($authState);
}
$fixtureStep = dirname(__DIR__).'/storage/e2e-totp-step';
if (is_file($fixtureStep)) {
    unlink($fixtureStep);
}
$reviewSession = dirname(__DIR__).'/storage/review-auth.json';
if (is_file($reviewSession)) {
    unlink($reviewSession);
}
