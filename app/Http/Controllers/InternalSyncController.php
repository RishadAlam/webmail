<?php

namespace App\Http\Controllers;

use App\Services\ImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class InternalSyncController
{
    public function __invoke(Request $request, ImportService $importer): mixed
    {
        $time = $request->header('X-Postroom-Time', '');
        $nonce = $request->header('X-Postroom-Nonce', '');
        $secret = config('postroom.worker_secret');
        abort_unless($secret && strlen($secret) >= 32 && ctype_digit($time) && abs(time() - (int) $time) <= 300 && preg_match('/^[a-zA-Z0-9-]{16,80}$/', $nonce), 401);
        $expected = hash_hmac('sha256', "$time\n$nonce\nPOST\n/internal/sync\n".$request->getContent(), $secret);
        abort_unless(hash_equals($expected, $request->header('X-Postroom-Signature', '')), 401);
        abort_unless(Cache::add('ingress-nonce:'.$nonce, true, 600), 401);

        return response()->json($importer->sync());
    }
}
