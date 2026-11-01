# Production runtime for the strict-free pilot. All dependencies come from lockfiles.
FROM php:8.4-apache@sha256:4af38a0245996e700e20ec211b9f1c44fb789ad8cc7d24c7ea81ff382b641052 AS php-runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev libonig-dev libxml2-dev libpq5 libonig5 libxml2 \
    && docker-php-ext-install -j2 pdo_pgsql mbstring dom xml xmlwriter opcache \
    && apt-get purge -y --auto-remove libpq-dev libonig-dev libxml2-dev \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod headers \
    && a2dismod -f autoindex status

FROM php-runtime AS dependencies
COPY --from=composer:2@sha256:4ed71c38c6d788eb4e4e3747b5332f5b40d5b5a6fcadd5062a1a70986a118e0a /usr/bin/composer /usr/local/bin/composer
RUN apt-get update && apt-get install -y --no-install-recommends unzip git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader

FROM dependencies AS assets
COPY --from=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da /usr/local/bin/node /usr/local/bin/node
COPY --from=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
COPY . .
RUN mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && composer dump-autoload --no-dev --classmap-authoritative --no-scripts \
    && APP_ENV=local APP_DEBUG=false php artisan package:discover --ansi
RUN npm ci --no-audit --no-fund \
    && APP_ENV=local APP_DEBUG=false npm run build

FROM php-runtime AS production
WORKDIR /var/www/html
COPY --from=assets /app/app ./app
COPY --from=assets /app/bootstrap ./bootstrap
COPY --from=assets /app/config ./config
COPY --from=assets /app/routes ./routes
COPY --from=assets /app/resources/views ./resources/views
COPY --from=assets /app/docs/CONFIGURATION.md /app/docs/DEPLOYMENT.md /app/docs/DELIVERY_RECOVERY.md /app/docs/IMPORT_RECOVERY.md ./docs/
COPY --from=assets /app/database/migrations ./database/migrations
COPY --from=assets /app/public ./public
COPY --from=assets /app/vendor ./vendor
COPY --from=assets /app/artisan /app/composer.json /app/composer.lock ./
COPY docker/php-production.ini /usr/local/etc/php/conf.d/zz-webmail.ini
COPY docker/apache-production.conf /etc/apache2/sites-available/000-default.conf
COPY docker/apache-limits.conf /etc/apache2/conf-enabled/webmail-limits.conf
COPY docker/entrypoint.sh /usr/local/bin/webmail-entrypoint
RUN printf 'Listen ${PORT}\n' > /etc/apache2/ports.conf \
    && mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs /var/run/apache2 /var/lock/apache2 \
    && chown -R www-data:www-data storage /var/run/apache2 /var/lock/apache2 \
    && chmod 755 /usr/local/bin/webmail-entrypoint
ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr LOG_LEVEL=warning \
    PORT=8080 APP_CONFIG_CACHE=/tmp/webmail-runtime/config.php \
    APP_ROUTES_CACHE=/tmp/webmail-runtime/routes.php APP_EVENTS_CACHE=/tmp/webmail-runtime/events.php \
    VIEW_COMPILED_PATH=/tmp/webmail-runtime/views PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt PGCONNECT_TIMEOUT=10
USER www-data
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["webmail-entrypoint"]
