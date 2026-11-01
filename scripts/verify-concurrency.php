<?php

use App\Models\Address;
use App\Models\Draft;
use App\Models\Mailbox;
use App\Models\SendIntent;
use App\Models\User;
use App\Providers\Mail\OutboundMailProvider;
use App\Services\DeliveryService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;

// Destructive only to a deliberately named, disposable local test database.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! app()->environment('testing') || config('database.default') !== 'pgsql' || config('database.connections.pgsql.database') !== 'postroom_concurrency') {
    throw new RuntimeException('Use only APP_ENV=testing and PostgreSQL database postroom_concurrency.');
}
config(['postroom.provider' => 'mock', 'postroom.daily_limit' => 2]);
if (($argv[1] ?? '') === '--child') {
    while (microtime(true) < (float) $argv[4]) {
        usleep(1000);
    }
    app()->instance(OutboundMailProvider::class, new class implements OutboundMailProvider
    {
        public function send(array $payload, string $key): array
        {
            DB::table('test_provider_calls')->insert(['key' => $key]);
            usleep(80000);

            return ['status' => 'accepted', 'id' => 'mock-'.hash('sha256', $key), 'error' => null];
        }
    });
    $result = app(DeliveryService::class)->send(User::findOrFail($argv[3]), Draft::findOrFail($argv[2]), 1);
    echo $result['status'];
    exit;
}
Artisan::call('migrate:fresh', ['--force' => true]);
Schema::create('test_provider_calls', fn ($table) => $table->string('key'));
$user = User::factory()->create();
$box = Mailbox::create(['name' => 'Concurrency fixture', 'email' => $user->email]);
$box->users()->attach($user, ['can_send' => true]);
Address::create(['mailbox_id' => $box->id, 'email' => $user->email, 'active' => true]);
$create = fn () => Draft::create(['user_id' => $user->id, 'mailbox_id' => $box->id, 'from_email' => $user->email, 'to' => ['fiction@example.net'], 'cc' => [], 'bcc' => [], 'subject' => 'Concurrency fixture', 'body' => '<p>Fiction only.</p>']);
$drafts = array_map(fn () => $create(), range(1, 6));
$run = function (array $items) use ($user): array {
    $start = (string) (microtime(true) + 1);
    $children = array_map(fn ($draft) => new Process([PHP_BINARY, __FILE__, '--child', $draft->id, (string) $user->id, $start]), $items);
    foreach ($children as $child) {
        $child->start();
    }
    foreach ($children as $child) {
        $child->wait();
        if (! $child->isSuccessful()) {
            throw new RuntimeException($child->getErrorOutput().$child->getOutput());
        }
    }

    return array_map(fn ($child) => $child->getOutput(), $children);
};
$outcomes = $run($drafts);
if (count(array_filter($outcomes, fn ($s) => $s === 'accepted')) !== 1 || DB::table('quota_ledger')->sum('recipients') != 1) {
    throw new RuntimeException('Last-slot admission overbooked.');
}
$winner = Draft::where('status', 'accepted')->firstOrFail();
$run(array_fill(0, 6, $winner));
if (DB::table('test_provider_calls')->count() !== 1 || SendIntent::count() !== 1) {
    throw new RuntimeException('Repeated send reached provider.');
}
echo json_encode(['database' => 'PostgreSQL', 'last_slot_competitors' => 6, 'admitted' => 1, 'repeat_requests' => 6, 'provider_calls' => 1, 'result' => 'passed'], JSON_PRETTY_PRINT).PHP_EOL;
