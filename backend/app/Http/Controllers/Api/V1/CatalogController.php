<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CategoryResource;
use App\Http\Resources\RegionResource;
use App\Models\Category;
use App\Models\Region;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class CatalogController extends Controller
{
    public function categories(): AnonymousResourceCollection
    {
        $categories = Category::query()
            ->with(['products' => fn ($query) => $query->active()->orderBy('sort')->orderBy('id')])
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function regions(): AnonymousResourceCollection
    {
        return RegionResource::collection(Region::query()->orderBy('sort')->orderBy('id')->get());
    }
}
