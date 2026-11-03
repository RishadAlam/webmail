<?php

namespace App\Http\Responses;

use App\Models\Mailbox;
use Illuminate\Http\Request;
use Laravel\Fortify\Contracts\LoginResponse;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse;

final class PrivateLoginResponse implements LoginResponse, TwoFactorLoginResponse
{
    /** @param Request $request */
    public function toResponse($request): mixed
    {
        $intended = $request->session()->pull('url.intended', '/dashboard');
        $path = is_string($intended) ? parse_url($intended, PHP_URL_PATH) : null;
        $target = '/dashboard';
        // An intended URL can belong to the account that previously used this browser.
        // Never redirect a new identity into that mailbox or to an external host.
        if (is_string($path) && preg_match('#^/mail(?:/(\d+)(?:/thread/[a-zA-Z0-9-]+)?)?$#D', $path, $match)) {
            $box = isset($match[1]) ? Mailbox::find((int) $match[1]) : null;
            if (! isset($match[1]) || ($box && $request->user()->can('view', $box))) {
                $query = parse_url($intended, PHP_URL_QUERY);
                $target = $path.($query ? '?'.$query : '');
            }
        } elseif (in_array($path, ['/settings/profile', '/settings/security', '/settings/appearance'], true)) {
            $target = $path;
        } elseif ($path === '/admin' && in_array($request->user()->role, ['owner', 'admin'], true) && $request->session()->get('webmail.mfa_user') === $request->user()->id) {
            $target = '/admin';
        }

        return $request->wantsJson() ? response()->json(['two_factor' => false]) : redirect($target);
    }
}
