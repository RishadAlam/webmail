<?php

namespace App\Providers;

use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Providers\Mail\MockOutboundProvider;
use App\Providers\Mail\OutboundMailProvider;
use App\Providers\Mail\ResendProvider;
use App\Providers\Mail\WorkerIngressGateway;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(OutboundMailProvider::class, fn () => config('postroom.provider') === 'mock' ? new MockOutboundProvider : new ResendProvider);
        $this->app->singleton(IngressGateway::class, fn () => config('postroom.provider') === 'mock' ? new FakeIngressGateway : new WorkerIngressGateway);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (app()->isProduction() && config('database.default') !== 'pgsql') {
            throw new \RuntimeException('Production Postroom requires durable PostgreSQL; ephemeral SQLite is forbidden.');
        }
        $this->configureDefaults();
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
