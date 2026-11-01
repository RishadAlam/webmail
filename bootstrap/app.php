<?php

use App\Http\Middleware\ActiveUser;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\PrivateResponse;
use App\Http\Middleware\TrustIngressProxies;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\AuthenticateSession;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->replace(TrustProxies::class, TrustIngressProxies::class);
        $middleware->trustHosts(at: fn () => app()->isProduction()
            ? ['^'.preg_quote((string) parse_url(config('app.url'), PHP_URL_HOST), '/').'$']
            : ['.*'], subdomains: false);
        $middleware->validateCsrfTokens(except: ['internal/sync']);
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        $middleware->web(prepend: [PrivateResponse::class], append: [
            AuthenticateSession::class,
            ActiveUser::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (ThrottleRequestsException $error, Request $request) {
            if (! $request->isMethod('POST') || ! $request->hasHeader('X-Inertia') || $request->wantsJson()
                || ! in_array($request->path(), ['login', 'two-factor-challenge'], true)) {
                return null;
            }
            $retryAfter = max(1, (int) ($error->getHeaders()['Retry-After'] ?? 60));
            $field = $request->path() === 'login' ? 'email' : ($request->filled('recovery_code') ? 'recovery_code' : 'code');

            // Fixed destinations; never trust Referer or flash submitted credentials/codes.
            return redirect('/'.$request->path(), 303)
                ->withErrors([$field => "Too many attempts. Try again in $retryAfter seconds."])
                ->withHeaders([...$error->getHeaders(), 'Retry-After' => (string) $retryAfter]);
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
