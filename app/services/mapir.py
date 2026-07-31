from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import get_settings


class MapIRService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _headers(self) -> dict[str, str]:
        if not self.settings.mapir_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="کلید دسترسی Map.ir روی سرور تنظیم نشده است.",
            )

        return {
            "x-api-key": self.settings.mapir_api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "geo.araz.me/1.0",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self.settings.mapir_base_url.rstrip('/')}/{path.lstrip('/')}"

        try:
            async with httpx.AsyncClient(
                timeout=self.settings.request_timeout,
                follow_redirects=True,
            ) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    params=params,
                    json=json,
                )

        except httpx.TimeoutException as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="زمان پاسخ‌گویی Map.ir به پایان رسید.",
            ) from exc

        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="ارتباط با Map.ir برقرار نشد.",
            ) from exc

        if response.status_code >= 400:
            try:
                provider_error = response.json()
            except ValueError:
                provider_error = response.text[:500]

            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "message": "سرویس Map.ir درخواست را نپذیرفت.",
                    "provider_status": response.status_code,
                    "provider_error": provider_error,
                },
            )

        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="پاسخ Map.ir از نوع JSON نبود.",
            ) from exc

    async def search(self, text: str) -> Any:
        # Search API v2
        return await self._request(
            "GET",
            "/search/v2/",
            params={"text": text},
        )

    async def reverse_geocode(self, lat: float, lon: float) -> Any:
        return await self._request(
            "GET",
            "/reverse/",
            params={"lat": lat, "lon": lon},
        )

    async def route(self, origin_lat: float, origin_lon: float,
                    destination_lat: float, destination_lon: float) -> Any:
        # فرمت رایج API مسیریابی Map.ir:
        # coordinates=origin_lon,origin_lat;destination_lon,destination_lat
        coordinates = (
            f"{origin_lon},{origin_lat};"
            f"{destination_lon},{destination_lat}"
        )

        return await self._request(
            "GET",
            f"/routes/route/v1/driving/{coordinates}",
            params={
                "overview": "full",
                "geometries": "geojson",
                "steps": "true",
            },
        )


mapir_service = MapIRService()
