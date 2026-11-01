<?php

return [
    // Only verified ingress addresses/CIDRs. Never trust arbitrary forwarded hosts.
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', ''))))),
];
