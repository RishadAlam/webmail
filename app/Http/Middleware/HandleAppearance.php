<?php

namespace App\Http\Middleware;

use App\Enums\MailPalette;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

class HandleAppearance
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $preferences = $request->user()->preferences ?? [];
        $appearance = $preferences['theme'] ?? $request->cookie('appearance');
        View::share('appearance', in_array($appearance, ['light', 'dark', 'system'], true) ? $appearance : 'system');
        $palette = $preferences['palette'] ?? null;
        View::share('palette', is_string($palette) ? (MailPalette::tryFrom($palette)->value ?? 'default') : 'default');

        return $next($request);
    }
}
