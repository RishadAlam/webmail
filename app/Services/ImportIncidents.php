<?php

namespace App\Services;

use App\Enums\ImportIncidentCategory;
use App\Models\ImportIncident;
use Illuminate\Support\Facades\DB;

class ImportIncidents
{
    public function validReceiptId(mixed $id): bool
    {
        // Worker UUIDs and signed provider event IDs are opaque identifiers.
        // Never retain a header, address, or arbitrary payload as an identifier.
        return is_string($id) && preg_match('/\A[A-Za-z0-9][A-Za-z0-9_-]{0,127}\z/D', $id) === 1;
    }

    public function hold(mixed $id, string $kind, ImportIncidentCategory $category): void
    {
        if (! $this->validReceiptId($id)) {
            return;
        }

        DB::transaction(function () use ($id, $kind, $category) {
            DB::table('quota_lock')->where('id', 1)->lockForUpdate()->first();
            $incident = ImportIncident::firstOrNew(['receipt_id' => $id]);
            $incident->fill([
                'kind' => $kind === 'event' ? 'event' : 'mail',
                'category' => $category,
                'status' => 'unresolved',
                'attempts' => min(2147483647, (int) $incident->attempts + 1),
                'first_seen_at' => $incident->first_seen_at ?? now(),
                'last_seen_at' => now(),
                'resolved_at' => null,
            ])->save();
        }, 3);
    }

    public function resolve(string $id): void
    {
        // Caller must have committed the import and successfully acknowledged it.
        ImportIncident::where('receipt_id', $id)->where('status', 'unresolved')
            ->update(['status' => 'resolved', 'resolved_at' => now()]);
    }

    /** @return array{unresolved:int, resolved:int, recent:list<array<string, mixed>>} */
    public function summary(): array
    {
        return [
            'unresolved' => ImportIncident::where('status', 'unresolved')->count(),
            'resolved' => ImportIncident::where('status', 'resolved')->count(),
            'recent' => array_values(ImportIncident::select(['id', 'kind', 'category', 'status', 'attempts', 'first_seen_at', 'last_seen_at', 'resolved_at'])
                ->orderByRaw("CASE WHEN status = 'unresolved' THEN 0 ELSE 1 END")
                ->latest('last_seen_at')->latest('id')->limit(30)->get()
                ->map(fn (ImportIncident $incident) => [
                    'id' => $incident->id, 'kind' => $incident->kind,
                    'category' => $incident->category->value, 'status' => $incident->status,
                    'attempts' => $incident->attempts,
                    'first_seen_at' => $incident->first_seen_at->toIso8601String(),
                    'last_seen_at' => $incident->last_seen_at->toIso8601String(),
                    'resolved_at' => $incident->resolved_at?->toIso8601String(),
                ])->all()),
        ];
    }
}
