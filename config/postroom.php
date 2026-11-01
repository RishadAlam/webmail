<?php

return [
    'strict_free' => true,
    'provider' => env('POSTROOM_PROVIDER', 'mock'),
    'mock_outcome' => env('POSTROOM_MOCK_OUTCOME', 'accepted'),
    'max_mime_bytes' => 262144,
    'mailbox_bytes' => 26214400,
    'database_stop_bytes' => min(786432000, (int) env('POSTROOM_DATABASE_STOP_BYTES', 786432000)),
    'organization_bytes' => 367001600,
    'daily_limit' => min(100, (int) env('POSTROOM_DAILY_LIMIT', 100)),
    'monthly_limit' => min(3000, (int) env('POSTROOM_MONTHLY_LIMIT', 3000)),
    'usage_ttl' => 300,
    'resend_key' => env('RESEND_SENDING_KEY'),
    'resend_management_key' => env('RESEND_MANAGEMENT_KEY'),
    'worker_url' => env('INGRESS_WORKER_URL'),
    'worker_secret' => env('INGRESS_SECRET'),
    'sending_enabled' => (bool) env('EXTERNAL_SENDING_ENABLED', false),
    'domain' => env('MAIL_DOMAIN', 'postroom.test'),
];
