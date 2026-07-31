"use strict";

const IRAN_CENTER = [32.4279, 53.6880];
const IRAN_ZOOM = 5;

const state = {
    activeTool: "coordinate",
    lastPoint: null,
    routePoints: [],
    drawnItems: null,
    drawControl: null,
    activeDrawer: null,
};

const tools = {
    coordinate: {
        title: "مختصات نقطه",
        description: "برای دریافت طول و عرض جغرافیایی، روی نقشه کلیک کنید.",
        hint: "روی نقشه کلیک کنید.",
    },
    bbox: {
        title: "انتخاب Bounding Box",
        description: "یک مستطیل روی نقشه ترسیم کنید و حدود آن را دریافت کنید.",
        hint: "با موس یک مستطیل روی نقشه رسم کنید.",
    },
    distance: {
        title: "اندازه‌گیری فاصله",
        description: "یک خط چندبخشی رسم کنید تا طول آن محاسبه شود.",
        hint: "نقاط مسیر را انتخاب و در پایان دوبار کلیک کنید.",
    },
    area: {
        title: "محاسبه مساحت",
        description: "با ترسیم چندضلعی، مساحت و محیط آن را محاسبه کنید.",
        hint: "محدوده موردنظر را به شکل چندضلعی رسم کنید.",
    },
    draw: {
        title: "ترسیم عوارض",
        description: "نقطه، خط، مستطیل یا چندضلعی را روی نقشه ترسیم کنید.",
        hint: "نوع عارضه را از پنل انتخاب کنید.",
    },
    convert: {
        title: "تبدیل مختصات",
        description: "تبدیل EPSG:4326 و EPSG:3857 بدون ارسال اطلاعات به سرور.",
        hint: "مختصات را در پنل وارد کنید.",
    },
    search: {
        title: "جست‌وجوی مکان",
        description: "نام شهر، خیابان یا مکان موردنظر را جست‌وجو کنید.",
        hint: "عبارت جست‌وجو را در پنل وارد کنید.",
    },
    reverse: {
        title: "مختصات به آدرس",
        description: "روی نقشه کلیک کنید یا مختصات را دستی وارد کنید.",
        hint: "برای دریافت آدرس، روی نقشه کلیک کنید.",
    },
    route: {
        title: "مسیریابی خودرو",
        description: "مبدأ و مقصد را با دو کلیک متوالی روی نقشه تعیین کنید.",
        hint: "ابتدا مبدأ و سپس مقصد را انتخاب کنید.",
    },
    export: {
        title: "خروجی مکانی",
        description: "عوارض ترسیم‌شده را در قالب GeoJSON یا WKT دریافت کنید.",
        hint: "ابتدا با ابزار ترسیم یک یا چند عارضه ایجاد کنید.",
    },
};

const map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
}).setView(IRAN_CENTER, IRAN_ZOOM);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

state.drawnItems = new L.FeatureGroup();
map.addLayer(state.drawnItems);

const markerIcon = L.divIcon({
    className: "",
    html: '<div style="width:18px;height:18px;border:4px solid white;border-radius:50%;background:#2563eb;box-shadow:0 2px 8px #0f172a66"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
});

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatNumber(value, maximumFractionDigits = 6) {
    return new Intl.NumberFormat("fa-IR", {
        maximumFractionDigits,
    }).format(value);
}

function showToast(message, type = "") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");

    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    container.appendChild(toast);

    window.setTimeout(() => toast.remove(), 3800);
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast("در کلیپ‌بورد کپی شد.", "success");
    } catch {
        showToast("امکان کپی خودکار وجود ندارد.", "error");
    }
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(options.headers || {}),
        },
    });

    let data;

    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        const detail = data?.detail;
        let message = "خطایی در اجرای درخواست رخ داد.";

        if (typeof detail === "string") {
            message = detail;
        } else if (detail?.message) {
            message = detail.message;
        }

        throw new Error(message);
    }

    return data;
}

function clearActiveDrawer() {
    if (state.activeDrawer?.disable) {
        state.activeDrawer.disable();
    }

    state.activeDrawer = null;
}

function clearMapLayers() {
    clearActiveDrawer();
    state.drawnItems.clearLayers();
    state.routePoints = [];
    state.lastPoint = null;
}

function addLayer(layer, fit = false) {
    state.drawnItems.addLayer(layer);

    if (fit && layer.getBounds) {
        map.fitBounds(layer.getBounds(), { padding: [30, 30] });
    }

    return layer;
}

function createMarker(latlng, popup = "") {
    const marker = L.marker(latlng, { icon: markerIcon });

    if (popup) {
        marker.bindPopup(popup);
    }

    addLayer(marker);
    return marker;
}

function startDrawer(type) {
    clearActiveDrawer();

    const options = {
        shapeOptions: {
            color: "#2563eb",
            weight: 3,
            fillColor: "#60a5fa",
            fillOpacity: 0.22,
        },
    };

    const drawerMap = {
        marker: () => new L.Draw.Marker(map, { icon: markerIcon }),
        polyline: () => new L.Draw.Polyline(map, options),
        polygon: () => new L.Draw.Polygon(map, {
            ...options,
            allowIntersection: false,
            showArea: true,
        }),
        rectangle: () => new L.Draw.Rectangle(map, options),
    };

    state.activeDrawer = drawerMap[type]();
    state.activeDrawer.enable();
}

function resultElement() {
    return document.getElementById("tool-result");
}

function setResult(html) {
    const element = resultElement();

    if (element) {
        element.innerHTML = html;
    }
}

function activateTool(toolName) {
    if (!tools[toolName]) return;

    clearActiveDrawer();
    state.activeTool = toolName;

    document.querySelectorAll(".tool-button").forEach((button) => {
        button.classList.toggle("active", button.dataset.tool === toolName);
    });

    const tool = tools[toolName];

    document.getElementById("panel-title").textContent = tool.title;
    document.getElementById("panel-description").textContent = tool.description;
    document.getElementById("map-hint").textContent = tool.hint;

    renderToolPanel(toolName);

    if (toolName === "bbox") startDrawer("rectangle");
    if (toolName === "distance") startDrawer("polyline");
    if (toolName === "area") startDrawer("polygon");

    document.getElementById("sidebar").classList.remove("open");
}

function renderToolPanel(toolName) {
    const body = document.getElementById("panel-body");

    const templates = {
        coordinate: `
            <ul class="help-list">
                <li>روی هر نقطه از نقشه کلیک کنید.</li>
                <li>مختصات در قالب Latitude و Longitude نمایش داده می‌شود.</li>
                <li>نتیجه را می‌توانید مستقیماً کپی کنید.</li>
            </ul>
            <div id="tool-result" class="result-box"></div>
        `,

        bbox: `
            <div class="button-row">
                <button class="btn btn-primary" data-action="start-bbox">ترسیم محدوده</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,

        distance: `
            <div class="button-row">
                <button class="btn btn-primary" data-action="start-distance">ترسیم خط</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,

        area: `
            <div class="button-row">
                <button class="btn btn-primary" data-action="start-area">ترسیم محدوده</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,

        draw: `
            <div class="button-row">
                <button class="btn" data-action="draw-marker">نقطه</button>
                <button class="btn" data-action="draw-line">خط</button>
                <button class="btn" data-action="draw-polygon">چندضلعی</button>
                <button class="btn" data-action="draw-rectangle">مستطیل</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن همه</button>
            </div>
            <div id="tool-result" class="result-box">
                عارضه موردنظر را انتخاب و روی نقشه ترسیم کنید.
            </div>
        `,

        convert: `
            <div class="form-row">
                <div class="form-group">
                    <label for="convert-lat">Latitude</label>
                    <input id="convert-lat" class="form-control" type="number" step="any" value="35.6892">
                </div>
                <div class="form-group">
                    <label for="convert-lon">Longitude</label>
                    <input id="convert-lon" class="form-control" type="number" step="any" value="51.3890">
                </div>
            </div>
            <button class="btn btn-primary" data-action="convert-forward">
                تبدیل 4326 به 3857
            </button>
            <hr style="border:0;border-top:1px solid #e2e8f0;margin:15px 0">
            <div class="form-row">
                <div class="form-group">
                    <label for="convert-x">X</label>
                    <input id="convert-x" class="form-control" type="number" step="any">
                </div>
                <div class="form-group">
                    <label for="convert-y">Y</label>
                    <input id="convert-y" class="form-control" type="number" step="any">
                </div>
            </div>
            <button class="btn" data-action="convert-backward">
                تبدیل 3857 به 4326
            </button>
            <div id="tool-result" class="result-box"></div>
        `,

        search: `
            <form id="search-form">
                <div class="form-group">
                    <label for="search-text">نام مکان یا نشانی</label>
                    <input
                        id="search-text"
                        class="form-control"
                        type="text"
                        minlength="2"
                        maxlength="200"
                        placeholder="مثلاً میدان آزادی تهران"
                        style="direction:rtl"
                        required
                    >
                </div>
                <button class="btn btn-primary" type="submit">جست‌وجو</button>
            </form>
            <div id="tool-result" class="result-box"></div>
            <div id="search-results" class="search-results"></div>
        `,

        reverse: `
            <div class="form-row">
                <div class="form-group">
                    <label for="reverse-lat">Latitude</label>
                    <input id="reverse-lat" class="form-control" type="number" step="any">
                </div>
                <div class="form-group">
                    <label for="reverse-lon">Longitude</label>
                    <input id="reverse-lon" class="form-control" type="number" step="any">
                </div>
            </div>
            <div class="button-row">
                <button class="btn btn-primary" data-action="reverse-submit">دریافت آدرس</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,

        route: `
            <p style="margin-top:0;color:#64748b;font-size:11px;line-height:1.9">
                ابتدا مبدأ و سپس مقصد را روی نقشه انتخاب کنید.
            </p>
            <div class="form-row">
                <div class="form-group">
                    <label>مبدأ</label>
                    <input id="route-origin" class="form-control" readonly placeholder="انتخاب نشده">
                </div>
                <div class="form-group">
                    <label>مقصد</label>
                    <input id="route-destination" class="form-control" readonly placeholder="انتخاب نشده">
                </div>
            </div>
            <div class="button-row">
                <button class="btn btn-primary" data-action="route-submit">نمایش مسیر</button>
                <button class="btn btn-danger" data-action="route-clear">شروع دوباره</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,

        export: `
            <div class="button-row">
                <button class="btn btn-primary" data-action="copy-geojson">کپی GeoJSON</button>
                <button class="btn" data-action="download-geojson">دانلود GeoJSON</button>
                <button class="btn" data-action="copy-wkt">کپی WKT</button>
                <button class="btn btn-danger" data-action="clear">پاک‌کردن</button>
            </div>
            <div id="tool-result" class="result-box"></div>
        `,
    };

    body.innerHTML = templates[toolName] || "";
    bindPanelEvents(toolName);

    if (toolName === "route") updateRouteInputs();
    if (toolName === "export") updateExportPreview();
}

function bindPanelEvents(toolName) {
    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => handleAction(button.dataset.action));
    });

    if (toolName === "search") {
        document.getElementById("search-form").addEventListener("submit", searchPlaces);
    }
}

function handleAction(action) {
    const actions = {
        "start-bbox": () => startDrawer("rectangle"),
        "start-distance": () => startDrawer("polyline"),
        "start-area": () => startDrawer("polygon"),
        "draw-marker": () => startDrawer("marker"),
        "draw-line": () => startDrawer("polyline"),
        "draw-polygon": () => startDrawer("polygon"),
        "draw-rectangle": () => startDrawer("rectangle"),
        "convert-forward": convertForward,
        "convert-backward": convertBackward,
        "reverse-submit": reverseFromInputs,
        "route-submit": submitRoute,
        "route-clear": clearRoute,
        "copy-geojson": () => copyText(JSON.stringify(getGeoJSON(), null, 2)),
        "download-geojson": downloadGeoJSON,
        "copy-wkt": () => copyText(featureCollectionToWKT(getGeoJSON())),
        clear: () => {
            clearMapLayers();
            setResult("");
        },
    };

    actions[action]?.();
}

function handleMapClick(event) {
    const { lat, lng } = event.latlng;

    if (state.activeTool === "coordinate") {
        clearMapLayers();
        state.lastPoint = { lat, lon: lng };

        createMarker(event.latlng, `${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();

        setResult(`
            <div class="result-title">مختصات انتخاب‌شده</div>
            <div>Latitude: <span class="result-value">${lat.toFixed(7)}</span></div>
            <div>Longitude: <span class="result-value">${lng.toFixed(7)}</span></div>
            <div class="button-row">
                <button id="copy-coordinate" class="btn">کپی مختصات</button>
            </div>
        `);

        document.getElementById("copy-coordinate").onclick =
            () => copyText(`${lat.toFixed(7)}, ${lng.toFixed(7)}`);
    }

    if (state.activeTool === "reverse") {
        document.getElementById("reverse-lat").value = lat.toFixed(7);
        document.getElementById("reverse-lon").value = lng.toFixed(7);

        state.drawnItems.clearLayers();
        createMarker(event.latlng);

        reverseGeocode(lat, lng);
    }

    if (state.activeTool === "route") {
        selectRoutePoint(lat, lng);
    }
}

map.on("click", handleMapClick);

map.on(L.Draw.Event.CREATED, (event) => {
    const layer = event.layer;
    addLayer(layer);

    if (state.activeTool === "bbox") {
        showBoundingBox(layer);
    } else if (state.activeTool === "distance") {
        showDistance(layer);
    } else if (state.activeTool === "area") {
        showArea(layer);
    } else if (state.activeTool === "draw") {
        setResult(`تعداد عوارض ترسیم‌شده: ${state.drawnItems.getLayers().length}`);
    } else if (state.activeTool === "export") {
        updateExportPreview();
    }
});

function showBoundingBox(layer) {
    const bounds = layer.getBounds();
    const west = bounds.getWest();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const north = bounds.getNorth();

    const bbox = [west, south, east, north];

    setResult(`
        <div class="result-title">Bounding Box</div>
        <div class="result-value">${bbox.map((v) => v.toFixed(7)).join(", ")}</div>
        <div>West: <span class="result-value">${west.toFixed(7)}</span></div>
        <div>South: <span class="result-value">${south.toFixed(7)}</span></div>
        <div>East: <span class="result-value">${east.toFixed(7)}</span></div>
        <div>North: <span class="result-value">${north.toFixed(7)}</span></div>
        <div class="button-row">
            <button id="copy-bbox" class="btn">کپی</button>
        </div>
    `);

    document.getElementById("copy-bbox").onclick =
        () => copyText(bbox.join(","));
}

function showDistance(layer) {
    const geojson = layer.toGeoJSON();
    const kilometers = turf.length(geojson, { units: "kilometers" });
    const meters = kilometers * 1000;

    setResult(`
        <div class="result-title">طول خط</div>
        <div>${formatNumber(meters, 2)} متر</div>
        <div>${formatNumber(kilometers, 3)} کیلومتر</div>
    `);
}

function showArea(layer) {
    const geojson = layer.toGeoJSON();
    const squareMeters = turf.area(geojson);
    const hectares = squareMeters / 10000;
    const perimeter = turf.length(turf.polygonToLine(geojson), {
        units: "kilometers",
    });

    setResult(`
        <div class="result-title">مساحت محدوده</div>
        <div>${formatNumber(squareMeters, 2)} مترمربع</div>
        <div>${formatNumber(hectares, 3)} هکتار</div>
        <div>${formatNumber(squareMeters / 1_000_000, 4)} کیلومترمربع</div>
        <div>محیط: ${formatNumber(perimeter, 3)} کیلومتر</div>
    `);
}

function convertForward() {
    const lat = Number(document.getElementById("convert-lat").value);
    const lon = Number(document.getElementById("convert-lon").value);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -85.05112878 || lat > 85.05112878 ||
        lon < -180 || lon > 180) {
        showToast("مختصات WGS84 معتبر نیست.", "error");
        return;
    }

    const earthRadius = 6378137;
    const x = earthRadius * lon * Math.PI / 180;
    const y = earthRadius * Math.log(
        Math.tan(Math.PI / 4 + lat * Math.PI / 360)
    );

    document.getElementById("convert-x").value = x.toFixed(3);
    document.getElementById("convert-y").value = y.toFixed(3);

    setResult(`
        <div class="result-title">EPSG:3857</div>
        <div>X: <span class="result-value">${x.toFixed(3)}</span></div>
        <div>Y: <span class="result-value">${y.toFixed(3)}</span></div>
    `);
}

function convertBackward() {
    const x = Number(document.getElementById("convert-x").value);
    const y = Number(document.getElementById("convert-y").value);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        showToast("مقادیر X و Y معتبر نیست.", "error");
        return;
    }

    const earthRadius = 6378137;
    const lon = x / earthRadius * 180 / Math.PI;
    const lat = (
        2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2
    ) * 180 / Math.PI;

    document.getElementById("convert-lat").value = lat.toFixed(7);
    document.getElementById("convert-lon").value = lon.toFixed(7);

    setResult(`
        <div class="result-title">EPSG:4326</div>
        <div>Latitude: <span class="result-value">${lat.toFixed(7)}</span></div>
        <div>Longitude: <span class="result-value">${lon.toFixed(7)}</span></div>
    `);
}

function findCoordinates(value) {
    if (!value || typeof value !== "object") return null;

    const lat = Number(
        value.lat ??
        value.latitude ??
        value.location?.lat ??
        value.geom?.coordinates?.[1] ??
        value.geometry?.coordinates?.[1]
    );

    const lon = Number(
        value.lon ??
        value.lng ??
        value.longitude ??
        value.location?.lon ??
        value.location?.lng ??
        value.geom?.coordinates?.[0] ??
        value.geometry?.coordinates?.[0]
    );

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
    }

    return null;
}

function extractSearchItems(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.value)) return data.value;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.features)) return data.features;
    if (Array.isArray(data?.items)) return data.items;
    return [];
}

function itemTitle(item) {
    return (
        item.title ||
        item.name ||
        item.address ||
        item.properties?.title ||
        item.properties?.name ||
        item.properties?.address ||
        "نتیجه بدون عنوان"
    );
}

function itemSubtitle(item) {
    return (
        item.address ||
        item.region ||
        item.province ||
        item.properties?.address ||
        item.properties?.region ||
        ""
    );
}

async function searchPlaces(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const text = document.getElementById("search-text").value.trim();
    const resultsElement = document.getElementById("search-results");

    if (text.length < 2) return;

    form.classList.add("loading");
    resultsElement.innerHTML = "";
    setResult("در حال جست‌وجو...");

    try {
        const data = await apiRequest("/api/mapir/search", {
            method: "POST",
            body: JSON.stringify({ text }),
        });

        const items = extractSearchItems(data);

        if (!items.length) {
            setResult("نتیجه‌ای پیدا نشد.");
            return;
        }

        setResult(`${items.length} نتیجه پیدا شد.`);

        items.slice(0, 20).forEach((item) => {
            const coordinates = findCoordinates(item);
            const button = document.createElement("button");

            button.className = "search-item";
            button.type = "button";
            button.innerHTML = `
                <strong>${escapeHtml(itemTitle(item))}</strong>
                <small>${escapeHtml(itemSubtitle(item))}</small>
            `;

            button.addEventListener("click", () => {
                if (!coordinates) {
                    showToast("مختصات این نتیجه در پاسخ موجود نیست.", "error");
                    return;
                }

                map.setView([coordinates.lat, coordinates.lon], 16);
                createMarker(
                    [coordinates.lat, coordinates.lon],
                    escapeHtml(itemTitle(item))
                ).openPopup();
            });

            resultsElement.appendChild(button);
        });
    } catch (error) {
        setResult("");
        showToast(error.message, "error");
    } finally {
        form.classList.remove("loading");
    }
}

async function reverseFromInputs() {
    const lat = Number(document.getElementById("reverse-lat").value);
    const lon = Number(document.getElementById("reverse-lon").value);

    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        showToast("مختصات واردشده معتبر نیست.", "error");
        return;
    }

    map.setView([lat, lon], Math.max(map.getZoom(), 15));
    state.drawnItems.clearLayers();
    createMarker([lat, lon]);

    await reverseGeocode(lat, lon);
}

function extractAddress(data) {
    return (
        data?.address ||
        data?.formatted_address ||
        data?.display_name ||
        data?.value?.address ||
        data?.result?.address ||
        data?.properties?.address ||
        JSON.stringify(data, null, 2)
    );
}

async function reverseGeocode(lat, lon) {
    setResult("در حال دریافت آدرس...");

    try {
        const data = await apiRequest("/api/mapir/reverse", {
            method: "POST",
            body: JSON.stringify({ lat, lon }),
        });

        const address = extractAddress(data);

        setResult(`
            <div class="result-title">آدرس تقریبی</div>
            <div>${escapeHtml(address)}</div>
            <div class="button-row">
                <button id="copy-address" class="btn">کپی آدرس</button>
            </div>
        `);

        document.getElementById("copy-address").onclick =
            () => copyText(address);
    } catch (error) {
        setResult("");
        showToast(error.message, "error");
    }
}

function selectRoutePoint(lat, lon) {
    if (state.routePoints.length >= 2) {
        clearRoute();
    }

    state.routePoints.push({ lat, lon });

    const label = state.routePoints.length === 1 ? "مبدأ" : "مقصد";
    createMarker([lat, lon], label).bindTooltip(label, {
        permanent: true,
        direction: "top",
    });

    updateRouteInputs();
}

function updateRouteInputs() {
    const origin = document.getElementById("route-origin");
    const destination = document.getElementById("route-destination");

    if (!origin || !destination) return;

    origin.value = state.routePoints[0]
        ? `${state.routePoints[0].lat.toFixed(5)}, ${state.routePoints[0].lon.toFixed(5)}`
        : "";

    destination.value = state.routePoints[1]
        ? `${state.routePoints[1].lat.toFixed(5)}, ${state.routePoints[1].lon.toFixed(5)}`
        : "";
}

function clearRoute() {
    state.routePoints = [];
    state.drawnItems.clearLayers();
    updateRouteInputs();
    setResult("");
}

function findRoute(data) {
    if (Array.isArray(data?.routes) && data.routes.length) {
        return data.routes[0];
    }

    if (Array.isArray(data?.result?.routes) && data.result.routes.length) {
        return data.result.routes[0];
    }

    return data?.route || null;
}

function routeGeometryToGeoJSON(route) {
    const geometry = route?.geometry;

    if (!geometry) return null;

    if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
        return geometry;
    }

    if (Array.isArray(geometry.coordinates)) {
        return {
            type: "LineString",
            coordinates: geometry.coordinates,
        };
    }

    return null;
}

async function submitRoute() {
    if (state.routePoints.length !== 2) {
        showToast("مبدأ و مقصد را روی نقشه انتخاب کنید.", "error");
        return;
    }

    setResult("در حال محاسبه مسیر...");

    try {
        const data = await apiRequest("/api/mapir/route", {
            method: "POST",
            body: JSON.stringify({
                origin: state.routePoints[0],
                destination: state.routePoints[1],
            }),
        });

        const route = findRoute(data);
        const geometry = routeGeometryToGeoJSON(route);

        if (!route || !geometry) {
            throw new Error("هندسه مسیر در پاسخ Map.ir پیدا نشد.");
        }

        state.drawnItems.eachLayer((layer) => {
            if (!(layer instanceof L.Marker)) {
                state.drawnItems.removeLayer(layer);
            }
        });

        const routeLayer = L.geoJSON(geometry, {
            style: {
                color: "#2563eb",
                weight: 6,
                opacity: 0.9,
            },
        });

        addLayer(routeLayer, true);

        const distanceMeters = Number(route.distance ?? 0);
        const durationSeconds = Number(route.duration ?? 0);

        setResult(`
            <div class="result-title">مشخصات مسیر</div>
            <div>فاصله: ${formatNumber(distanceMeters / 1000, 2)} کیلومتر</div>
            <div>زمان تقریبی: ${formatNumber(durationSeconds / 60, 0)} دقیقه</div>
        `);
    } catch (error) {
        setResult("");
        showToast(error.message, "error");
    }
}

function getGeoJSON() {
    return state.drawnItems.toGeoJSON();
}

function downloadGeoJSON() {
    const data = JSON.stringify(getGeoJSON(), null, 2);
    const blob = new Blob([data], {
        type: "application/geo+json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `geo-araz-${Date.now()}.geojson`;
    anchor.click();

    URL.revokeObjectURL(url);
}

function coordinateToText(coordinate) {
    return coordinate.join(" ");
}

function geometryToWKT(geometry) {
    if (!geometry) return "";

    switch (geometry.type) {
        case "Point":
            return `POINT (${coordinateToText(geometry.coordinates)})`;

        case "LineString":
            return `LINESTRING (${geometry.coordinates
                .map(coordinateToText)
                .join(", ")})`;

        case "Polygon":
            return `POLYGON (${geometry.coordinates
                .map((ring) => `(${ring.map(coordinateToText).join(", ")})`)
                .join(", ")})`;

        case "MultiPoint":
            return `MULTIPOINT (${geometry.coordinates
                .map((coordinate) => `(${coordinateToText(coordinate)})`)
                .join(", ")})`;

        case "MultiLineString":
            return `MULTILINESTRING (${geometry.coordinates
                .map((line) => `(${line.map(coordinateToText).join(", ")})`)
                .join(", ")})`;

        case "MultiPolygon":
            return `MULTIPOLYGON (${geometry.coordinates
                .map((polygon) =>
                    `(${polygon.map((ring) =>
                        `(${ring.map(coordinateToText).join(", ")})`
                    ).join(", ")})`
                )
                .join(", ")})`;

        default:
            return `GEOMETRYCOLLECTION EMPTY`;
    }
}

function featureCollectionToWKT(collection) {
    const geometries = collection.features
        .map((feature) => geometryToWKT(feature.geometry))
        .filter(Boolean);

    if (!geometries.length) return "GEOMETRYCOLLECTION EMPTY";
    if (geometries.length === 1) return geometries[0];

    return `GEOMETRYCOLLECTION (${geometries.join(", ")})`;
}

function updateExportPreview() {
    const geojson = getGeoJSON();
    const count = geojson.features.length;

    setResult(`
        <div class="result-title">وضعیت خروجی</div>
        <div>تعداد عوارض: ${formatNumber(count, 0)}</div>
        <div>CRS خروجی: EPSG:4326</div>
    `);
}

async function checkHealth() {
    const indicator = document.getElementById("service-indicator");
    const status = document.getElementById("service-status");

    try {
        const data = await apiRequest("/api/health");
        indicator.classList.add("online");

        status.textContent = data.mapir_configured
            ? "سرویس فعال و Map.ir تنظیم شده"
            : "سرویس فعال؛ کلید Map.ir تنظیم نشده";
    } catch {
        indicator.classList.add("offline");
        status.textContent = "Backend در دسترس نیست";
    }
}

document.querySelectorAll(".tool-button").forEach((button) => {
    button.addEventListener("click", () => activateTool(button.dataset.tool));
});

document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("open");
});

document.getElementById("sidebar-close").addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
});

document.getElementById("panel-collapse").addEventListener("click", () => {
    const panel = document.getElementById("tool-panel");
    panel.classList.toggle("collapsed");
});

window.addEventListener("resize", () => map.invalidateSize());

activateTool("coordinate");
checkHealth();
