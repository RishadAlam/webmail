<?php

namespace App\Providers;

use App\Models\User;
use App\Providers\Mail\FakeIngressGateway;
use App\Providers\Mail\IngressGateway;
use App\Providers\Mail\MockOutboundProvider;
use App\Providers\Mail\OutboundMailProvider;
use App\Providers\Mail\ResendProvider;
use App\Providers\Mail\WorkerIngressGateway;
use App\Services\ProductionConfiguration;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Passkeys\Contracts\PasskeyUser;
use Laravel\Passkeys\Passkeys;

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
        // Passkey login bypasses Fortify's password/TOTP pipeline. Do not grant admin MFA here.
        Passkeys::authorizeLoginUsing(fn ($request, PasskeyUser $user): bool => $user instanceof User && $user->active && $user->role === 'member');
        if (app()->isProduction()) {
            app(ProductionConfiguration::class)->assertSafe();
            URL::forceRootUrl(config('app.url'));
            URL::forceScheme('https');
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
