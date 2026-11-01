<?php

namespace App\Http\Controllers;

use App\Models\Draft;
use App\Services\DeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeliveryRecoveryController extends Controller
{
    public function __invoke(Request $request, Draft $draft, DeliveryService $delivery): JsonResponse
    {
        $result = $delivery->resume($request->user(), $draft);

        return response()->json($result, $result['status'] === 'queued' && $result['error'] ? 422 : 200);
    }
}
