<?php

namespace App\Http\Controllers;

use App\Models\BlockedSender;
use App\Models\Mailbox;
use App\Models\MailboxLabel;
use App\Models\MailboxRule;
use App\Models\User;
use App\Services\MailOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class MailOrganizationController extends Controller
{
    public function __construct(private MailOrganization $organization) {}

    public function index(Mailbox $mailbox): JsonResponse
    {
        Gate::authorize('view', $mailbox);

        return response()->json($this->organization->data($mailbox));
    }

    public function settings(Request $request, ?Mailbox $mailbox = null): mixed
    {
        $boxes = $request->user()->mailboxes()->get();
        $mailbox ??= $boxes->first();
        if ($mailbox) {
            Gate::authorize('view', $mailbox);
        }

        return Inertia::render('settings/organization', [
            'mailboxes' => $boxes, 'mailbox' => $mailbox,
            ...($mailbox ? $this->organization->data($mailbox) : ['labels' => [], 'rules' => [], 'blocked_senders' => []]),
        ]);
    }

    public function storeLabel(Request $request, Mailbox $mailbox): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        $data = $request->validate(['name' => ['required', 'string', 'max:32', 'regex:/\A[^\p{C}]+\z/u'], 'color' => ['sometimes', 'regex:/\A#[0-9a-fA-F]{6}\z/']]);
        DB::transaction(function () use ($mailbox, $data) {
            $this->lockMailbox($mailbox);
            $this->organization->retainLegacyLabels($mailbox);
            $this->organization->createLabel($mailbox, $data['name'], $data['color'] ?? '#64748b');
        });

        return response()->json($this->organization->data($mailbox), 201);
    }

    public function updateLabel(Request $request, Mailbox $mailbox, MailboxLabel $label): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        abort_unless($label->mailbox_id === $mailbox->id, 404);
        $data = $request->validate(['name' => ['sometimes', 'required', 'string', 'max:32', 'regex:/\A[^\p{C}]+\z/u'], 'color' => ['sometimes', 'regex:/\A#[0-9a-fA-F]{6}\z/']]);
        DB::transaction(function () use ($mailbox, $label, $data) {
            $this->lockMailbox($mailbox);
            $label = MailboxLabel::whereKey($label->id)->lockForUpdate()->firstOrFail();
            if (isset($data['name']) && $data['name'] !== $label->name) {
                $this->organization->uniqueLabelName($mailbox, $data['name'], $label->id);
                $this->organization->changeAssignedLabel($label, $data['name']);
            }
            $label->update($data);
        });

        return response()->json($this->organization->data($mailbox));
    }

    public function deleteLabel(Mailbox $mailbox, MailboxLabel $label): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        abort_unless($label->mailbox_id === $mailbox->id, 404);
        DB::transaction(function () use ($mailbox, $label) {
            $this->lockMailbox($mailbox);
            $label = MailboxLabel::whereKey($label->id)->lockForUpdate()->firstOrFail();
            $this->organization->changeAssignedLabel($label, null);
            foreach (MailboxRule::where('mailbox_id', $mailbox->id)->get() as $rule) {
                $actions = $rule->actions;
                if (($actions['label_id'] ?? null) === $label->id) {
                    unset($actions['label_id']);
                    // A rule whose only action disappeared has no remaining purpose.
                    if ($actions === []) {
                        $rule->delete();
                    } else {
                        $rule->update(['actions' => $actions]);
                    }
                }
            }
            $label->delete();
        });

        return response()->json($this->organization->data($mailbox));
    }

    public function storeRule(Request $request, Mailbox $mailbox): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        DB::transaction(function () use ($request, $mailbox) {
            $this->lockMailbox($mailbox);
            $data = $this->ruleData($request, $mailbox);
            if (MailboxRule::where('mailbox_id', $mailbox->id)->count() >= 50) {
                throw ValidationException::withMessages(['name' => 'This mailbox has reached its 50-rule limit.']);
            }
            MailboxRule::create(['mailbox_id' => $mailbox->id, ...$data]);
        });

        return response()->json($this->organization->data($mailbox), 201);
    }

    public function updateRule(Request $request, Mailbox $mailbox, MailboxRule $rule): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        abort_unless($rule->mailbox_id === $mailbox->id, 404);
        DB::transaction(function () use ($request, $mailbox, $rule) {
            $this->lockMailbox($mailbox);
            $rule = MailboxRule::whereKey($rule->id)->lockForUpdate()->firstOrFail();
            $rule->update($this->ruleData($request, $mailbox, $rule));
        });

        return response()->json($this->organization->data($mailbox));
    }

    public function deleteRule(Mailbox $mailbox, MailboxRule $rule): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        abort_unless($rule->mailbox_id === $mailbox->id, 404);
        DB::transaction(function () use ($mailbox, $rule) {
            $this->lockMailbox($mailbox);
            $rule->delete();
        });

        return response()->json($this->organization->data($mailbox));
    }

    public function blockSender(Request $request, Mailbox $mailbox): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        $data = $request->validate(['email' => 'required|email:rfc|max:254']);
        $created = DB::transaction(function () use ($mailbox, $data) {
            $this->lockMailbox($mailbox);
            $email = strtolower($data['email']);
            if (BlockedSender::where('mailbox_id', $mailbox->id)->where('email', $email)->exists()) {
                return false;
            }
            if (BlockedSender::where('mailbox_id', $mailbox->id)->count() >= 200) {
                throw ValidationException::withMessages(['email' => 'This mailbox has reached its 200-sender block limit.']);
            }
            BlockedSender::create(['mailbox_id' => $mailbox->id, 'email' => $email]);

            return true;
        });

        return response()->json($this->organization->data($mailbox), $created ? 201 : 200);
    }

    public function unblockSender(Mailbox $mailbox, BlockedSender $blockedSender): JsonResponse
    {
        Gate::authorize('view', $mailbox);
        abort_unless($blockedSender->mailbox_id === $mailbox->id, 404);
        DB::transaction(function () use ($mailbox, $blockedSender) {
            $this->lockMailbox($mailbox);
            $blockedSender->delete();
        });

        return response()->json($this->organization->data($mailbox));
    }

    /** @return array<string, mixed> */
    private function ruleData(Request $request, Mailbox $mailbox, ?MailboxRule $existing = null): array
    {
        $data = validator([
            ...($existing ? $existing->only(['name', 'enabled', 'predicates', 'actions']) : ['enabled' => true]),
            ...$request->only(['name', 'enabled', 'predicates', 'actions']),
        ], [
            'name' => 'required|string|max:80', 'enabled' => 'required|boolean',
            'predicates' => 'required|array:sender,recipient,subject|min:1|max:3',
            'predicates.sender' => 'sometimes|required|string|max:200',
            'predicates.recipient' => 'sometimes|required|string|max:200',
            'predicates.subject' => 'sometimes|required|string|max:200',
            'actions' => 'required|array:archive,read,star,important,category,label_id|min:1|max:6',
            'actions.archive' => 'sometimes|boolean', 'actions.read' => 'sometimes|boolean',
            'actions.star' => 'sometimes|boolean', 'actions.important' => 'sometimes|boolean',
            'actions.category' => ['sometimes', 'required', Rule::in(MailOrganization::CATEGORIES)],
            'actions.label_id' => ['sometimes', 'required', 'integer', Rule::exists('mailbox_labels', 'id')->where('mailbox_id', $mailbox->id)],
        ])->validate();
        $data['actions'] = array_filter($data['actions'], fn ($value, $key) => in_array($key, ['category', 'label_id'], true) || (bool) $value, ARRAY_FILTER_USE_BOTH);
        if ($data['actions'] === []) {
            throw ValidationException::withMessages(['actions' => 'Choose at least one action.']);
        }
        foreach (['archive', 'read', 'star', 'important'] as $action) {
            if (array_key_exists($action, $data['actions'])) {
                $data['actions'][$action] = (bool) $data['actions'][$action];
            }
        }
        if (isset($data['actions']['label_id'])) {
            $data['actions']['label_id'] = (int) $data['actions']['label_id'];
        }

        return $data;
    }

    private function lockMailbox(Mailbox $mailbox): void
    {
        $lockedMailbox = Mailbox::whereKey($mailbox->id)->lockForUpdate()->firstOrFail();
        Gate::forUser(User::whereKey(auth()->id())->firstOrFail())->authorize('view', $lockedMailbox);
    }
}
