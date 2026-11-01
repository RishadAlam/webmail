#!/bin/sh
set -eu
umask 077

if [ "${APP_ENV:-}" != production ]; then
    printf '%s\n' 'The production image requires APP_ENV=production.' >&2
    exit 1
fi

case "${PORT:-}" in
    ''|*[!0-9]*) printf '%s\n' 'PORT must be numeric.' >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1024 ] || [ "$PORT" -gt 65535 ]; then
    printf '%s\n' 'PORT must be an unprivileged TCP port (1024-65535).' >&2
    exit 1
fi

mkdir -p /tmp/webmail-runtime/views
# Every boot validates live configuration before serving. Never migrate, seed or generate keys here.
php artisan webmail:check-production --no-interaction
php artisan config:cache --no-interaction
php artisan route:cache --no-interaction
php artisan view:cache --no-interaction

apache2-foreground &
apache_pid=$!
stop_apache() {
    trap '' TERM INT
    kill -WINCH "$apache_pid" 2>/dev/null || true
    wait "$apache_pid" || true
    exit 0
}
trap stop_apache TERM INT
wait "$apache_pid"
