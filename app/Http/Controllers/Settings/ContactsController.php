<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Services\MailWriting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ContactsController extends Controller
{
    public function index(Request $request, MailWriting $writing): mixed
    {
        $request->validate(['q' => 'sometimes|nullable|string|max:120']);

        return response()->json(['contacts' => $writing->contacts($request->user()->id, $request->has('q') ? $request->string('q')->toString() : null)]);
    }

    public function store(Request $request, MailWriting $writing): mixed
    {
        $data = $this->validated($request);
        $contact = DB::transaction(function () use ($request, $data, $writing) {
            $writing->lockOwner($request->user()->id);
            if (Contact::where('user_id', $request->user()->id)->count() >= Contact::LIMIT) {
                throw ValidationException::withMessages(['name' => 'You can save up to 500 contacts. Remove an unused contact before adding another.']);
            }
            $this->checkDuplicate($request->user()->id, $data['email']);
            $writing->admitGrowth(strlen($data['name'].$data['email']) + 1024);

            return Contact::create(['user_id' => $request->user()->id, ...$data]);
        }, 3);

        return response()->json(['contact' => $contact], 201);
    }

    public function update(Request $request, int $contact, MailWriting $writing): mixed
    {
        Contact::where('user_id', $request->user()->id)->findOrFail($contact);
        $data = $this->validated($request);
        $saved = DB::transaction(function () use ($request, $contact, $data, $writing) {
            $writing->lockOwner($request->user()->id);
            $saved = Contact::where('user_id', $request->user()->id)->findOrFail($contact);
            $this->checkDuplicate($request->user()->id, $data['email'], $contact);
            $writing->admitGrowth(strlen($data['name'].$data['email']) - strlen($saved->name.$saved->email));
            $saved->update($data);

            return $saved;
        }, 3);

        return response()->json(['contact' => $saved]);
    }

    public function destroy(Request $request, int $contact): mixed
    {
        Contact::where('user_id', $request->user()->id)->findOrFail($contact)->delete();

        return response()->json(['deleted' => true]);
    }

    /** @return array{name: string, email: string} */
    private function validated(Request $request): array
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => mb_strtolower(trim($request->input('email')))]);
        }

        return $request->validate(['name' => 'required|string|max:120', 'email' => 'required|string|email:rfc|max:254']);
    }

    private function checkDuplicate(int $userId, string $email, ?int $except = null): void
    {
        if (Contact::where('user_id', $userId)->where('email', $email)->when($except, fn ($query) => $query->where('id', '!=', $except))->exists()) {
            throw ValidationException::withMessages(['email' => 'This email address is already in your contacts.']);
        }
    }
}
