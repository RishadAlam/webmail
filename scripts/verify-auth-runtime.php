<?php

use App\Models\User;
use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;
use GuzzleHttp\Exception\ConnectException;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;
use Symfony\Component\Process\Process;

// A real HTTP/session check of the exact Docker startup command, on a disposable database.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || config('database.default') !== 'pgsql' || DB::connection()->getDatabaseName() !== 'postroom_auth_e2e') {
    fwrite(STDERR, 'Run only against the isolated postroom_auth_e2e PostgreSQL database with APP_ENV=testing.'.PHP_EOL);
    exit(1);
}
$otp = new Google2FA;
$secret = $otp->generateSecretKey(32);
$user = User::firstOrCreate(['email' => 'auth-runtime@postroom.test'], ['name' => 'Fictional runtime owner', 'password' => 'fictional-runtime-password']);
$user->forceFill(['role' => 'owner', 'two_factor_secret' => encrypt($secret), 'two_factor_confirmed_at' => now()])->save();
$socket = stream_socket_server('tcp://127.0.0.1:0');
$port = (int) substr(strrchr(stream_socket_get_name($socket, false), ':'), 1);
fclose($socket);
$baseUrl = 'http://127.0.0.1:'.$port;
preg_match('/^CMD (\[.+\])$/m', file_get_contents(base_path('Dockerfile.local')), $match);
$command = json_decode($match[1], true, flags: JSON_THROW_ON_ERROR);
$command = array_map(fn ($arg) => str_starts_with($arg, '--port=') ? '--port='.$port : $arg, $command);
$process = new Process($command, base_path(), ['APP_URL' => $baseUrl]);
$process->start();
$jar = new CookieJar;
$http = new Client(['base_uri' => $baseUrl, 'cookies' => $jar, 'http_errors' => false, 'allow_redirects' => false, 'timeout' => 5]);
$request = function ($method, $path, $data = []) use ($http, $jar) {
    $headers = ['Accept' => 'text/html'];
    if ($method === 'POST') {
        $headers['X-XSRF-TOKEN'] = urldecode($jar->getCookieByName('XSRF-TOKEN')->getValue());
    }
    $response = $http->request($method, $path, ['headers' => $headers, 'form_params' => $data]);
    echo $method.' '.$path.' -> '.$response->getStatusCode().' '.parse_url($response->getHeaderLine('Location'), PHP_URL_PATH).PHP_EOL;

    return $response;
};
$expect = function ($response, $status, $path = null) {
    $location = $response->getHeaderLine('Location');
    $redirectPath = $location !== '' ? (parse_url($location, PHP_URL_PATH) ?: '/') : null;
    if ($response->getStatusCode() !== $status || ($path !== null && $redirectPath !== $path)) {
        throw new RuntimeException('Expected HTTP '.$status.' '.($path ?? '').'; got '.$response->getStatusCode().' '.parse_url($response->getHeaderLine('Location'), PHP_URL_PATH).'. Startup must preserve the configured database and MFA session.');
    }
};
$exitCode = 0;
try {
    $ready = false;
    for ($attempt = 0; $attempt < 40; $attempt++) {
        if (! $process->isRunning()) {
            throw new RuntimeException('Test server exited: '.$process->getErrorOutput());
        }
        try {
            $ready = $request('GET', '/login')->getStatusCode() === 200;
        } catch (ConnectException) {
        }
        if ($ready) {
            break;
        }
        usleep(100000);
    }
    if (! $ready) {
        throw new RuntimeException('Isolated HTTP server did not start.');
    }
    $expect($request('GET', '/admin'), 302, '/login');
    $expect($request('POST', '/login', ['email' => $user->email, 'password' => 'fictional-runtime-password']), 302, '/two-factor-challenge');
    $expect($request('GET', '/admin'), 302, '/login');
    $expect($request('POST', '/two-factor-challenge', ['code' => $otp->getCurrentOtp($secret)]), 302, '/admin');
    $expect($request('GET', '/admin'), 200);
    $expect($request('GET', '/admin'), 200);
    $expect($request('POST', '/logout'), 302, '/');
    $expect($request('GET', '/admin'), 302, '/login');
    echo json_encode(['result' => 'passed', 'database' => 'isolated PostgreSQL', 'password_then_mfa' => true, 'admin_after_fresh_request' => true, 'logout_revokes_access' => true], JSON_PRETTY_PRINT).PHP_EOL;
} catch (Throwable $failure) {
    fwrite(STDERR, $failure->getMessage().PHP_EOL);
    $exitCode = 1;
} finally {
    // Artisan needs time to terminate its PHP child before the parent is killed.
    $process->stop(15);
}
exit($exitCode);
