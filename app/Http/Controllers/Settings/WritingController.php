<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\MailSignature;
use App\Models\MailTemplate;
use App\Services\MailWriting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WritingController extends Controller
{
    public function index(Request $request, MailWriting $writing): mixed
    {
        return response()->json($writing->payload($request->user()->id));
    }

    public function templates(Request $request, MailWriting $writing): mixed
    {
        return response()->json(['templates' => $writing->templates($request->user()->id)]);
    }

    public function storeTemplate(Request $request, MailWriting $writing): mixed
    {
        $data = $this->templateData($request);
        $template = DB::transaction(function () use ($request, $data, $writing) {
            $writing->lockOwner($request->user()->id);
            if (MailTemplate::where('user_id', $request->user()->id)->count() >= MailTemplate::LIMIT) {
                throw ValidationException::withMessages(['name' => 'You can save up to 50 templates. Remove an unused template before adding another.']);
            }
            $writing->admitGrowth(strlen($data['name'].$data['subject'].$data['body']) + 1024);

            return MailTemplate::create(['user_id' => $request->user()->id, ...$data]);
        }, 3);

        return response()->json(['template' => $template], 201);
    }

    public function updateTemplate(Request $request, int $template, MailWriting $writing): mixed
    {
        MailTemplate::where('user_id', $request->user()->id)->findOrFail($template);
        $data = $this->templateData($request);
        $saved = DB::transaction(function () use ($request, $template, $data, $writing) {
            $writing->lockOwner($request->user()->id);
            $saved = MailTemplate::where('user_id', $request->user()->id)->findOrFail($template);
            $writing->admitGrowth(strlen($data['name'].$data['subject'].$data['body']) - strlen($saved->name.$saved->subject.$saved->body));
            $saved->update($data);

            return $saved;
        }, 3);

        return response()->json(['template' => $saved]);
    }

    public function destroyTemplate(Request $request, int $template): mixed
    {
        MailTemplate::where('user_id', $request->user()->id)->findOrFail($template)->delete();

        return response()->json(['deleted' => true]);
    }

    public function signature(Request $request, MailWriting $writing): mixed
    {
        return response()->json(['signature' => $writing->signature($request->user()->id)]);
    }

    public function updateSignature(Request $request, MailWriting $writing): mixed
    {
        $data = $request->validate(['body' => 'present|nullable|string|max:4000']);
        $body = $data['body'] ?? '';
        DB::transaction(function () use ($request, $body, $writing) {
            $writing->lockOwner($request->user()->id);
            $signature = MailSignature::where('user_id', $request->user()->id)->first();
            $writing->admitGrowth(strlen($body) - strlen($signature ? $signature->body : ''));
            MailSignature::updateOrCreate(['user_id' => $request->user()->id], ['body' => $body]);
        }, 3);

        return response()->json(['signature' => ['body' => $body]]);
    }

    /** @return array{name: string, subject: string, body: string} */
    private function templateData(Request $request): array
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'subject' => 'nullable|string|max:255',
            'body' => 'required|string|max:20000',
        ]);

        return ['name' => $data['name'], 'subject' => $data['subject'] ?? '', 'body' => $data['body']];
    }
}
