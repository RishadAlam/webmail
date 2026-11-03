<?php

namespace App\Http\Controllers;

use App\Concerns\AuthorizesAdministration;
use App\Services\ImportService;
use Illuminate\Http\Request;

class ImportIncidentController extends Controller
{
    use AuthorizesAdministration;

    public function __invoke(Request $request, ImportService $importer): mixed
    {
        $this->authorizeAdmin($request);

        try {
            $result = $importer->sync();
        } catch (\Throwable) {
            return response()->json(['message' => 'Pending imports could not be checked. Review the ingress connection and try again.'], 503);
        }

        return response()->json([...$result, 'checked_at' => now()->toIso8601String(), 'simulated' => config('webmail.provider') === 'mock']);
    }
}
