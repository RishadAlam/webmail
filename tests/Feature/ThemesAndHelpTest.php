<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ThemesAndHelpTest extends TestCase
{
    use RefreshDatabase;

    public function test_palettes_persist_for_only_the_current_account_and_keep_display_mode(): void
    {
        $this->withoutVite();
        $user = User::factory()->create(['preferences' => ['theme' => 'dark']]);
        $other = User::factory()->create();
        foreach (['default', 'ocean', 'forest', 'terracotta', 'plum', 'graphite'] as $palette) {
            $this->actingAs($user)->putJson('/preferences', ['palette' => $palette])
                ->assertOk()->assertJsonPath('palette', $palette)->assertJsonPath('theme', 'dark');
        }
        $this->actingAs($user->fresh());
        $this->get('/settings/themes')->assertOk()->assertInertia(fn (Assert $page) => $page->component('settings/appearance'));
        $this->get('/settings/appearance')->assertOk();
        $this->get('/settings/themes')->assertSee('data-palette="graphite"', false)->assertSee('class="dark"', false);
        $this->actingAs($other)->get('/settings/themes')->assertSee('data-palette="default"', false);
        $this->assertEmpty($other->fresh()->preferences);
    }

    public function test_invalid_palettes_cannot_replace_valid_preferences(): void
    {
        $user = User::factory()->create(['preferences' => ['palette' => 'forest', 'theme' => 'dark']]);
        foreach (['https://example.test/theme.css', 'unknown', '', null, ['ocean']] as $palette) {
            $this->actingAs($user)->putJson('/preferences', ['palette' => $palette, 'theme' => 'light'])
                ->assertUnprocessable()->assertJsonValidationErrors('palette');
        }
        $preferences = $user->fresh()->preferences;
        // JSON object key order is not preserved by every database driver.
        ksort($preferences);
        $this->assertSame(['palette' => 'forest', 'theme' => 'dark'], $preferences);
        auth()->forgetGuards();
        $this->putJson('/preferences', ['palette' => 'ocean'])->assertUnauthorized();
    }

    public function test_setup_guide_is_available_before_sign_in_with_no_runtime_secrets(): void
    {
        $this->withoutVite();
        config(['webmail.worker_secret' => 'test-runtime-secret-not-for-help']);
        $response = $this->get('/help/setup')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('help/guide')->where('title', 'Set up WebMail')
            ->has('contents')->where('auth.user', null)
            ->where('html', fn ($html) => str_contains($html, 'Cloudflare') && str_contains($html, 'Resend')
                && str_contains($html, 'id="personalize-your-mail"') && ! str_contains($html, 'test-runtime-secret-not-for-help')));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->get('/help/deployment')->assertOk();
        $this->get('/help/not-a-guide')->assertNotFound();
    }
}
