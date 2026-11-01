<?php

namespace App\Http\Controllers;

use DOMDocument;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Inertia\Inertia;

class HelpController extends Controller
{
    public function __invoke(string $guide): mixed
    {
        // Fixed public documentation only; no user paths, env files or runtime values.
        $guides = [
            'setup' => ['CONFIGURATION.md', 'Set up WebMail'],
            'deployment' => ['DEPLOYMENT.md', 'Deployment and recovery'],
            'delivery' => ['DELIVERY_RECOVERY.md', 'Sending and recovery'],
            'imports' => ['IMPORT_RECOVERY.md', 'Incoming mail recovery'],
        ];
        abort_unless(isset($guides[$guide]), 404);
        [$filename, $title] = $guides[$guide];
        $html = Str::markdown(File::get(base_path('docs/'.$filename)), [
            'html_input' => 'strip', 'allow_unsafe_links' => false,
        ]);
        $document = new DOMDocument;
        $document->loadHTML('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'.$html.'</body></html>', LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET);
        foreach (iterator_to_array($document->getElementsByTagName('h1')) as $heading) {
            $heading->parentNode->removeChild($heading);
        }
        $contents = [];
        foreach ($document->getElementsByTagName('h2') as $heading) {
            $id = Str::slug($heading->textContent);
            $heading->setAttribute('id', $id);
            $heading->setAttribute('tabindex', '-1');
            $contents[] = ['id' => $id, 'title' => $heading->textContent];
        }
        foreach ($document->getElementsByTagName('a') as $link) {
            $href = $link->getAttribute('href');
            foreach ($guides as $slug => [$file]) {
                if ($href === $file || str_starts_with($href, $file.'#')) {
                    $link->setAttribute('href', '/help/'.$slug.substr($href, strlen($file)));

                    continue 2;
                }
            }
            if ($href !== '' && ! preg_match('~^(https?://|mailto:|/|#)~i', $href)) {
                $link->setAttribute('href', 'https://github.com/RishadAlam/webmail/blob/main/docs/'.$href);
            }
        }
        foreach (iterator_to_array($document->getElementsByTagName('table')) as $index => $table) {
            $wrapper = $document->createElement('div');
            $wrapper->setAttribute('class', 'guide-table');
            $wrapper->setAttribute('tabindex', '0');
            $wrapper->setAttribute('role', 'region');
            $label = $table->getElementsByTagName('th')->item(0)->textContent ?? 'Reference';
            $wrapper->setAttribute('aria-label', $label.' table '.($index + 1));
            $table->parentNode->insertBefore($wrapper, $table);
            $wrapper->appendChild($table);
        }
        $body = $document->getElementsByTagName('body')->item(0);
        $rendered = '';
        foreach ($body->childNodes as $node) {
            $rendered .= $document->saveHTML($node);
        }

        return Inertia::render('help/guide', ['title' => $title, 'html' => $rendered, 'contents' => $contents, 'guide' => $guide]);
    }
}
