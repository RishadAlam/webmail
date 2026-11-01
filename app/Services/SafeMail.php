<?php

namespace App\Services;

use Symfony\Component\HtmlSanitizer\HtmlSanitizer;
use Symfony\Component\HtmlSanitizer\HtmlSanitizerConfig;

class SafeMail
{
    public function html(string $html): string
    {
        $config = (new HtmlSanitizerConfig)->allowSafeElements()->dropElement('img')->dropElement('style')
            ->dropElement('svg')->dropElement('form')->dropElement('iframe')->allowLinkSchemes(['https', 'http', 'mailto'])
            ->forceAttribute('a', 'rel', 'noreferrer noopener')->forceAttribute('a', 'target', '_blank')->withMaxInputLength(262144);

        return (new HtmlSanitizer($config))->sanitize($html);
    }
}
