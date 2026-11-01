<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\MetricResource;
use App\Models\Metric;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MetricController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return MetricResource::collection(Metric::query()->orderBy('sort')->get());
    }
}
