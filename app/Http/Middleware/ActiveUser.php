<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class ActiveUser
{
    public function handle(Request $request, Closure $next): mixed
    {
        abort_if($request->user() && ! $request->user()->active, 403, 'This account is suspended. Contact your administrator.');

        return $next($request);
    }
}
