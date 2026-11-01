<?php

namespace App\Http\Controllers;

use App\Models\Draft;
use App\Models\DraftAttachment;
use App\Models\Mailbox;
use App\Models\Message;
use App\Services\MailAttachments;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\HeaderUtils;

class AttachmentController extends Controller
{
    public function index(Message $message, MailAttachments $attachments): JsonResponse
    {
        Gate::authorize('view', Mailbox::findOrFail($message->mailbox_id));

        return response()->json(['attachments' => array_map(function (array $file): array {
            unset($file['content']);

            return $file;
        }, $attachments->incoming($message))]);
    }

    public function download(Message $message, string $attachment, MailAttachments $attachments): Response
    {
        Gate::authorize('view', Mailbox::findOrFail($message->mailbox_id));
        $file = collect($attachments->incoming($message))->firstWhere('id', $attachment);
        abort_unless($file !== null, 404);

        return $this->fileResponse($file['content'], $file['name']);
    }

    public function store(Request $request, Draft $draft, MailAttachments $attachments): JsonResponse
    {
        $attachments->authorizeDraft($request->user(), $draft);
        $data = $request->validate(['version' => 'required|integer|min:1', 'file' => 'required|file|max:128']);
        $current = $attachments->store($request->user(), $draft, $request->file('file'), $data['version']);

        return response()->json($attachments->draftResponse($current), 201);
    }

    public function destroy(Request $request, Draft $draft, string $attachment, MailAttachments $attachments): JsonResponse
    {
        $attachments->authorizeDraft($request->user(), $draft);
        $data = $request->validate(['version' => 'required|integer|min:1']);
        $current = $attachments->remove($request->user(), $draft, $attachment, $data['version']);

        return response()->json($attachments->draftResponse($current));
    }

    public function draftDownload(Request $request, Draft $draft, string $attachment, MailAttachments $attachments): Response
    {
        $attachments->authorizeDraft($request->user(), $draft);
        $file = DraftAttachment::where('draft_id', $draft->id)->whereKey($attachment)->firstOrFail();

        return $this->fileResponse($file->content, $file->name);
    }

    private function fileResponse(string $content, string $name): Response
    {
        return response($content, 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Disposition' => HeaderUtils::makeDisposition('attachment', $name),
            'Content-Length' => (string) strlen($content),
            'Content-Security-Policy' => "default-src 'none'; sandbox; frame-ancestors 'none'",
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
