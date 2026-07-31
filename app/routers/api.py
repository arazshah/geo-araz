from typing import Any

from fastapi import APIRouter

from app.config import get_settings
from app.schemas import ReverseGeocodeRequest, RouteRequest, SearchRequest
from app.services.mapir import mapir_service


router = APIRouter(prefix="/api", tags=["API"])


@router.get("/health")
async def health() -> dict[str, Any]:
    settings = get_settings()

    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.app_env,
        "mapir_configured": bool(settings.mapir_api_key),
    }


@router.post("/mapir/search")
async def search(payload: SearchRequest) -> Any:
    return await mapir_service.search(payload.text)


@router.post("/mapir/reverse")
async def reverse_geocode(payload: ReverseGeocodeRequest) -> Any:
    return await mapir_service.reverse_geocode(payload.lat, payload.lon)


@router.post("/mapir/route")
async def route(payload: RouteRequest) -> Any:
    return await mapir_service.route(
        origin_lat=payload.origin.lat,
        origin_lon=payload.origin.lon,
        destination_lat=payload.destination.lat,
        destination_lon=payload.destination.lon,
    )
