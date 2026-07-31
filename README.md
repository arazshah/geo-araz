
# ابزارهای مکانی آراز

وب‌اپلیکیشن فارسی و رایگان ابزارهای عمومی نقشه و مختصات.

## فناوری‌ها

- Python 3.12
- FastAPI
- Leaflet
- Turf.js
- Map.ir
- Docker Compose

## امکانات

1. دریافت مختصات نقطه
2. انتخاب Bounding Box
3. اندازه‌گیری فاصله
4. محاسبه مساحت
5. ترسیم عوارض
6. تبدیل EPSG:4326 و EPSG:3857
7. جست‌وجوی مکان
8. تبدیل مختصات به آدرس
9. مسیریابی خودرو
10. خروجی GeoJSON و WKT

## اجرای محلی

```bash
cp .env.example .env
nano .env
docker compose up --build -d
```

سپس:

- برنامه: http://localhost:8000
- مستندات توسعه: http://localhost:8000/api/docs
- سلامت سرویس: http://localhost:8000/api/health

## مشاهده لاگ

```bash
docker compose logs -f
```

## توقف

```bash
docker compose down
```

## متغیرهای محیطی Coolify

```env
APP_NAME=ابزارهای مکانی آراز
APP_ENV=production
APP_DEBUG=false
MAPIR_API_KEY=YOUR_SECRET_KEY
MAPIR_BASE_URL=https://map.ir
REQUEST_TIMEOUT=20
CORS_ORIGINS=https://geo.araz.me
