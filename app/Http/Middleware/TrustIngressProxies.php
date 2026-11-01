<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class TrustIngressProxies
{
    public function handle(Request $request, Closure $next): mixed
    {
        // Read after configuration loads; do not inherit host-based wildcard trust.
        $request::setTrustedProxies(
            config('deployment.trusted_proxies', []),
            Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO | Request::HEADER_X_FORWARDED_PORT,
        );

        return $next($request);
    }
}
