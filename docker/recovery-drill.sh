#!/bin/sh
# Run from repository root. Only local Compose, two fixed disposable names, no live credentials.
set -eu
umask 077
drill_output=${1:?Provide a new owner-controlled local evidence directory}
if [ -e "$drill_output" ]; then
    printf '%s\n' 'Evidence directory already exists; refusing to overwrite it.' >&2
    exit 1
fi
mkdir -m 700 "$drill_output"
source_created=false
restore_created=false
cleanup() {
    if [ "$restore_created" = true ]; then
        timeout 20 docker compose exec -T postgres dropdb -U postroom webmail_recovery_restored
    fi
    if [ "$source_created" = true ]; then
        timeout 20 docker compose exec -T postgres dropdb -U postroom webmail_recovery_source
    fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
test "$(docker compose ps -q postgres)" != ''
timeout 20 docker compose exec -T postgres createdb -U postroom webmail_recovery_source
source_created=true
timeout 20 docker compose exec -T postgres createdb -U postroom webmail_recovery_restored
restore_created=true
APP_KEY="base64:$(php -r 'echo base64_encode(random_bytes(32));')"
export APP_KEY
printf '%s\n' "$APP_KEY" > "$drill_output/fixture-app-key.txt"
timeout 120 docker compose exec -T -e APP_ENV=testing -e APP_KEY -e DB_URL= -e DB_DATABASE=webmail_recovery_source app php artisan migrate --force --no-interaction > "$drill_output/migrations.txt"
timeout 30 docker compose exec -T -e APP_ENV=testing -e APP_KEY -e DB_URL= -e DB_DATABASE=webmail_recovery_source app php docker/recovery-fixture.php seed > "$drill_output/source.json"
timeout 60 docker compose exec -T postgres pg_dump -U postroom -d webmail_recovery_source --format=custom --no-owner --no-privileges > "$drill_output/fixture.dump"
timeout 60 docker compose exec -T postgres pg_restore -U postroom -d webmail_recovery_restored --exit-on-error --single-transaction --no-owner --no-privileges < "$drill_output/fixture.dump"
timeout 30 docker compose exec -T -e APP_ENV=testing -e APP_KEY -e DB_URL= -e DB_DATABASE=webmail_recovery_restored app php docker/recovery-fixture.php verify > "$drill_output/restored.json"
cmp "$drill_output/source.json" "$drill_output/restored.json"
sha256sum "$drill_output/fixture.dump" > "$drill_output/dump.sha256"
printf '%s\n' 'PASS: PostgreSQL restore preserves encrypted MIME, draft, idempotency IDs, uncertain intent, quota ledger and bootstrap latch.'
printf '%s\n' 'Both disposable databases are removed on exit. Evidence contains fictional data only; protect its separate fixture APP_KEY.'
