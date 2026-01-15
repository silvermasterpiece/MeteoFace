// --- AYARLAR ---
const MAPBOX_TOKEN = 'pk.eyJ1IjoibXltYXN0ZXJwaWVjZSIsImEiOiJjbWtkeWFheDEwMTVvM2NxcXJkdzExZjd3In0.nmra2NE82BvwU654Svm9xQ'; // Kendi Tokenini buraya yapıştır!

mapboxgl.accessToken = MAPBOX_TOKEN;

// data.js kontrolü
let activeCities = (typeof globalCities !== 'undefined') ? [...globalCities] : [];

const MAP_STYLES = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    light: 'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
};

const map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLES.dark,
    center: [35.0, 39.0],
    zoom: 4,
    projection: 'globe'
});

// GLOBAL DEĞİŞKENLER
let weatherCache = {};
let markers = [];
let pressureMarkers = [];
let activePopup = null;
let currentMode = 'code';
let timeIndex = 0;
let isPlaying = false;
let playInterval = null;
let moveTimeout = null;
let isFetching = false;
let markerOpacity = 1;

// HTML Elemanları
const slider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const playBtn = document.getElementById('play-btn');

map.on('load', async () => {
    // Siyah atmosfer efekti
    map.setFog({ 'range': [0.5, 10], 'color': '#000000', 'high-color': '#1a1d29' });

    document.getElementById('loader').style.display = 'block';

    // Isı Haritası Katmanını Kur
    setupHeatmapLayer();

    if (activeCities.length === 0) { alert("Hata: data.js bulunamadı."); return; }

    await fetchWeatherData(activeCities);

    slider.value = 0;
    timeIndex = 0;

    updateLegend('code');
    updateMapState();

    slider.disabled = false;
    document.getElementById('loader').style.display = 'none';

    map.on('moveend', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(scanAndFetchNewCities, 500);
    });

    map.on('click', () => {
        if (activePopup) {
            activePopup.remove();
            activePopup = null;
        }
    });
});

// --- STİL DEĞİŞTİRME FONKSİYONU (DÜZELTİLDİ) ---
window.changeStyle = function (styleKey) {
    // 1. Harita stilini değiştir
    if (MAP_STYLES[styleKey]) {
        map.setStyle(MAP_STYLES[styleKey]);
    }

    // 2. Butonların aktiflik durumunu güncelle
    const buttons = document.querySelectorAll('.style-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        // Butonun onclick özelliğinde styleKey geçiyor mu diye bakıyoruz (En garantili yöntem)
        if (btn.getAttribute('onclick').includes(`'${styleKey}'`)) {
            btn.classList.add('active');
        }
    });

    // 3. Stil yüklendikten sonra katmanları geri getir
    map.once('style.load', () => {
        // Atmosfer ayarı
        if (styleKey === 'light') {
            map.setFog({ 'range': [0.5, 10], 'color': '#ffffff', 'high-color': '#e6f2ff', 'space-color': '#d9eaff' });
        } else {
            map.setFog({ 'range': [0.5, 10], 'color': '#000000', 'high-color': '#1a1d29' });
        }

        // Heatmap katmanını tekrar oluştur (Mapbox stil değişince özel katmanları siler)
        setupHeatmapLayer();

        // Verileri tekrar haritaya işle
        setTimeout(updateMapState, 500);
    });
};

// --- ISI HARİTASI (HEATMAP) KURULUMU ---
function setupHeatmapLayer() {
    // Eğer kaynak zaten varsa tekrar ekleme (Hata önleyici)
    if (map.getSource('pressure-source')) return;

    map.addSource('pressure-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'pressure-heat',
        type: 'circle',
        source: 'pressure-source',
        layout: { 'visibility': 'none' },
        paint: {
            'circle-radius': [
                'interpolate', ['linear'], ['zoom'],
                3, 80,
                6, 200
            ],
            'circle-blur': 1.5,
            'circle-opacity': 0.5,
            'circle-color': [
                'interpolate', ['linear'], ['get', 'pressure'],
                990, '#d50000', 1005, '#ff5252', 1013, 'transparent', 1020, '#42a5f5', 1035, '#1565c0'
            ]
        }
    }, 'settlement-label');
}

// --- HARİTA GÜNCELLEME ---
function updateMapState() {
    const sampleKey = Object.keys(weatherCache)[0];
    const sampleData = weatherCache[sampleKey];

    if (timeIndex === 0) {
        timeDisplay.innerHTML = '<span style="color:#00e676"><i class="fa-solid fa-circle-dot"></i> CANLI</span>';
    } else if (sampleData && sampleData.hourly && sampleData.hourly.time) {
        const timeString = sampleData.hourly.time[timeIndex];
        const dateObj = new Date(timeString);
        const formattedTime = dateObj.toLocaleDateString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
        timeDisplay.innerText = formattedTime;
    }

    renderMarkers();
    updateHeatmap();
}

// --- ISI HARİTASI VERİ GÜNCELLEME ---
function updateHeatmap() {
    if (currentMode !== 'pressure') {
        if (map.getLayer('pressure-heat')) map.setLayoutProperty('pressure-heat', 'visibility', 'none');
        removePressureMarkers();
        return;
    }

    // Stil değişimi sonrası katman silinmiş olabilir, kontrol et
    if (!map.getLayer('pressure-heat')) setupHeatmapLayer();

    if (map.getLayer('pressure-heat')) map.setLayoutProperty('pressure-heat', 'visibility', 'visible');

    const features = [];

    activeCities.forEach(city => {
        const cityKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
        const data = weatherCache[cityKey];
        if (!data) return;

        let pressure;
        if (timeIndex === 0 && data.current) pressure = data.current.pressure_msl;
        else if (data.hourly && data.hourly.pressure_msl) {
            const i = timeIndex;
            if (i < data.hourly.pressure_msl.length) pressure = data.hourly.pressure_msl[i];
        }

        if (pressure) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
                properties: { pressure: pressure }
            });
        }
    });

    if (map.getSource('pressure-source')) {
        map.getSource('pressure-source').setData({
            type: 'FeatureCollection',
            features: features
        });
    }

    updatePressureCenters();
}

// --- ÇOKLU BASINÇ MERKEZİ TESPİTİ ---
function updatePressureCenters() {
    removePressureMarkers();

    let points = [];
    activeCities.forEach(city => {
        const cityKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
        const data = weatherCache[cityKey];
        if (!data) return;

        let pressure;
        if (timeIndex === 0 && data.current) pressure = data.current.pressure_msl;
        else if (data.hourly && data.hourly.pressure_msl) {
            const i = timeIndex;
            if (i < data.hourly.pressure_msl.length) pressure = data.hourly.pressure_msl[i];
        }

        if (pressure) {
            points.push({ ...city, p: pressure });
        }
    });

    if (points.length < 5) return;

    const SEARCH_RADIUS = 600;
    const centers = [];

    points.forEach(center => {
        let isLow = true;
        let isHigh = true;
        let neighborCount = 0;

        points.forEach(neighbor => {
            if (center === neighbor) return;
            if (Math.abs(center.lat - neighbor.lat) + Math.abs(center.lon - neighbor.lon) > 15) return;

            const dist = getDistanceFromLatLonInKm(center.lat, center.lon, neighbor.lat, neighbor.lon);

            if (dist < SEARCH_RADIUS) {
                neighborCount++;
                if (neighbor.p <= center.p) isLow = false;
                if (neighbor.p >= center.p) isHigh = false;
            }
        });

        if (neighborCount < 2) return;

        if (isLow) centers.push({ type: 'AB', ...center });
        else if (isHigh) centers.push({ type: 'YB', ...center });
    });

    const finalCenters = filterCloseCenters(centers, 400);

    finalCenters.forEach(c => {
        const el = document.createElement('div');
        el.className = `pressure-center ${c.type.toLowerCase()}`;
        el.innerHTML = `${c.type}<div style="font-size:10px">${Math.round(c.p)}</div>`;

        const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([c.lon, c.lat])
            .addTo(map);

        pressureMarkers.push(marker);
    });
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d;
}

function deg2rad(deg) { return deg * (Math.PI / 180); }

function filterCloseCenters(centers, minDistance) {
    const result = [];
    centers.forEach(current => {
        const isTooClose = result.some(existing => {
            return getDistanceFromLatLonInKm(current.lat, current.lon, existing.lat, existing.lon) < minDistance;
        });
        if (!isTooClose) {
            result.push(current);
        }
    });
    return result;
}

function removePressureMarkers() {
    pressureMarkers.forEach(m => m.remove());
    pressureMarkers = [];
}

// --- NORMAL MARKER RENDER ---
function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = [];

    activeCities.forEach((city) => {
        const cityKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
        const data = weatherCache[cityKey];
        if (!data) return;

        let temp, feelsLike, humidity, windSpeed, windDir, wCode, pressure, isDay;

        if (timeIndex === 0) {
            if (!data.current) return;
            temp = data.current.temperature_2m;
            feelsLike = data.current.apparent_temperature;
            humidity = data.current.relative_humidity_2m;
            windSpeed = data.current.wind_speed_10m;
            windDir = data.current.wind_direction_10m;
            wCode = data.current.weather_code;
            pressure = data.current.pressure_msl;
            isDay = data.current.is_day;
        } else {
            if (!data.hourly || !data.hourly.temperature_2m) return;
            const i = timeIndex;
            if (i >= data.hourly.temperature_2m.length) return;
            temp = data.hourly.temperature_2m[i];
            feelsLike = data.hourly.apparent_temperature ? data.hourly.apparent_temperature[i] : temp;
            humidity = data.hourly.relativehumidity_2m ? data.hourly.relativehumidity_2m[i] : 0;
            windSpeed = data.hourly.wind_speed_10m[i];
            windDir = data.hourly.wind_direction_10m[i];
            wCode = data.hourly.weather_code[i];
            pressure = data.hourly.pressure_msl[i];
            const forecastHour = new Date(data.hourly.time[i]).getHours();
            isDay = (forecastHour >= 6 && forecastHour <= 19) ? 1 : 0;
        }

        const el = document.createElement('div');
        el.className = 'city-marker';
        el.style.opacity = markerOpacity;

        let htmlContent = '';
        if (currentMode === 'temp') {
            let color = temp < 0 ? '#4fc3f7' : (temp < 15 ? '#66bb6a' : (temp < 30 ? '#fdd835' : '#ff5252'));
            htmlContent = `<div class="temp-value" style="color:${color}; text-shadow: 0 0 10px ${color};">${Math.round(temp)}°</div>`;
        }
        else if (currentMode === 'wind') {
            let color = windSpeed < 20 ? '#69f0ae' : '#ff5252';
            htmlContent = `<i class="fa-solid fa-arrow-up wind-arrow" style="transform: rotate(${windDir}deg); color: ${color}; text-shadow: 0 0 5px ${color};"></i>`;
        }
        else if (currentMode === 'code') {
            htmlContent = `<div class="icon-box">${getAnimatedIcon(wCode, isDay)}</div>`;
        }
        else if (currentMode === 'pressure') {
            htmlContent = `<div class="temp-value" style="font-size:12px; color:#fff">${Math.round(pressure)}</div>`;
        }

        htmlContent += `<div class="city-name">${city.n}</div>`;
        el.innerHTML = htmlContent;

        // --- POPUP ---
        el.addEventListener('click', (e) => {
            e.stopPropagation();

            if (activePopup) {
                const isOpen = activePopup._content.innerHTML.includes(city.n);
                activePopup.remove();
                activePopup = null;
                if (isOpen) return;
            }

            const animatedIcon = getAnimatedIcon(wCode, isDay).replace('width="40" height="40"', 'width="64" height="64"');

            const popupHTML = `
                <div class="card-header">
                    <div class="card-city">${city.n}</div>
                    <div class="card-status">${timeIndex === 0 ? 'Canlı' : 'Tahmin'}</div>
                </div>
                <div class="card-body">
                    
                    <div class="card-main">
                        <div class="card-temp">${Math.round(temp)}°</div>
                        <div class="card-visual-group">
                            <div class="card-icon-big">${animatedIcon}</div>
                            <div class="card-desc">${getWeatherDesc(wCode)}</div>
                        </div>
                    </div>
                    
                    <div class="card-grid">
                        <div class="card-item">
                            <i class="fa-solid fa-person"></i>
                            <div>
                                <div class="card-val">${Math.round(feelsLike)}°</div>
                                <span class="card-label">Hissedilen</span>
                            </div>
                        </div>
                        <div class="card-item">
                            <i class="fa-solid fa-droplet"></i>
                            <div>
                                <div class="card-val">%${humidity}</div>
                                <span class="card-label">Nem</span>
                            </div>
                        </div>
                        <div class="card-item">
                            <i class="fa-solid fa-wind"></i>
                            <div>
                                <div class="card-val">${Math.round(windSpeed)} <span style="font-size:9px">km/h</span></div>
                                <span class="card-label">Rüzgar</span>
                            </div>
                        </div>
                        <div class="card-item">
                            <i class="fa-solid fa-gauge-high"></i>
                            <div>
                                <div class="card-val">${Math.round(pressure)}</div>
                                <span class="card-label">Basınç</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const isMobile = window.innerWidth < 768;

            activePopup = new mapboxgl.Popup({
                offset: 25,
                closeButton: true,
                maxWidth: isMobile ? '90vw' : '300px',
                className: 'custom-popup'
            })
                .setLngLat([city.lon, city.lat])
                .setHTML(popupHTML)
                .addTo(map);

            activePopup.on('close', () => {
                activePopup = null;
            });
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([city.lon, city.lat]).addTo(map);
        markers.push(marker);
    });
}

// --- VERİ ÇEKME MOTORU ---
async function fetchWeatherData(cityList) {
    if (cityList.length === 0 || isFetching) return;
    isFetching = true;

    const citiesToFetch = cityList.filter(c => !weatherCache[`${c.lat.toFixed(2)},${c.lon.toFixed(2)}`]);
    if (citiesToFetch.length === 0) { isFetching = false; return; }

    const batch = citiesToFetch.slice(0, 50);
    const lats = batch.map(c => c.lat.toFixed(2)).join(',');
    const lons = batch.map(c => c.lon.toFixed(2)).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl,apparent_temperature,relativehumidity_2m&forecast_days=3&wind_speed_unit=kmh&timezone=auto`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const rawDataArray = Array.isArray(data) ? data : [data];

        rawDataArray.forEach((cityData, index) => {
            const cityKey = `${batch[index].lat.toFixed(2)},${batch[index].lon.toFixed(2)}`;
            weatherCache[cityKey] = processCityData(cityData);
        });

    } catch (e) { console.error("Veri Hatası:", e); }

    isFetching = false;
}

function processCityData(data) {
    if (!data) return null;
    const currentHourIndex = new Date().getHours();
    const slicedHourly = {};
    if (data.hourly) {
        Object.keys(data.hourly).forEach(key => {
            const arr = data.hourly[key];
            if (Array.isArray(arr)) {
                slicedHourly[key] = arr.slice(currentHourIndex, currentHourIndex + 48);
            }
        });
    }
    return { current: data.current, hourly: slicedHourly };
}

async function scanAndFetchNewCities() {
    const zoom = map.getZoom();
    if (zoom < 4.5) return;
    const features = map.queryRenderedFeatures({ layers: ['settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label'] });
    if (!features.length) return;
    const newCitiesFound = [];
    features.forEach(f => {
        const name = f.properties.name_tr || f.properties.name;
        const alreadyExists = activeCities.some(c => c.n === name);
        if (name && !alreadyExists) {
            const newCity = { n: name, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
            activeCities.push(newCity);
            newCitiesFound.push(newCity);
        }
    });
    if (newCitiesFound.length > 0) {
        document.getElementById('loader').style.display = 'block';
        document.getElementById('loader').innerText = `+${newCitiesFound.length} Bölge`;
        await fetchWeatherData(newCitiesFound);
        updateMapState();
        document.getElementById('loader').style.display = 'none';
        document.getElementById('loader').innerText = "Sistem Hazır";
    }
}

// --- HAREKETLİ SVG İKON MOTORU ---
function getAnimatedIcon(code, isDay = 1) {
    if (code <= 1) {
        if (isDay) {
            return `
            <svg width="40" height="40" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="10" fill="#fdd835" />
                <g class="anm-sun">
                    <path d="M32 10 L32 6 M32 58 L32 54 M10 32 L6 32 M58 32 L54 32 M16.5 16.5 L13.5 13.5 M47.5 47.5 L44.5 44.5 M16.5 47.5 L13.5 50.5 M47.5 16.5 L44.5 19.5" stroke="#fdd835" stroke-width="3" stroke-linecap="round" />
                </g>
            </svg>`;
        } else {
            return `
            <svg width="40" height="40" viewBox="0 0 64 64">
                <path class="anm-moon" d="M36 18 Q46 22 46 36 Q46 50 32 50 Q42 50 50 40 Q54 30 50 20 Q46 16 36 18 Z" fill="#fff9c4" stroke="#fbc02d" stroke-width="1" />
                <circle cx="16" cy="20" r="1.5" fill="#fff" opacity="0.8" />
                <circle cx="50" cy="10" r="1" fill="#fff" opacity="0.6" />
                <circle cx="10" cy="40" r="1" fill="#fff" opacity="0.5" />
            </svg>`;
        }
    }
    if (code <= 3) {
        if (isDay) {
            return `
            <svg width="40" height="40" viewBox="0 0 64 64">
                <g class="anm-sun">
                    <circle cx="40" cy="24" r="8" fill="#fdd835" />
                    <path d="M40 8 L40 12 M40 40 L40 36 M24 24 L28 24 M56 24 L52 24" stroke="#fdd835" stroke-width="2" />
                </g>
                <path class="anm-cloud" d="M20 40 Q12 40 12 30 Q12 18 24 18 Q28 10 38 14 Q46 12 48 22 Q56 24 56 32 Q56 40 46 40 Z" fill="#ffffff" filter="drop-shadow(0 2px 2px rgba(0,0,0,0.2))" />
            </svg>`;
        } else {
            return `
            <svg width="40" height="40" viewBox="0 0 64 64">
                <path class="anm-moon" d="M42 16 Q50 20 50 30 Q50 40 40 40 Q46 40 52 32 Q54 26 52 20 Q50 16 42 16 Z" fill="#fff9c4" />
                <path class="anm-cloud" d="M20 40 Q12 40 12 30 Q12 18 24 18 Q28 10 38 14 Q46 12 48 22 Q56 24 56 32 Q56 40 46 40 Z" fill="#b0bec5" filter="drop-shadow(0 2px 2px rgba(0,0,0,0.5))" />
            </svg>`;
        }
    }
    if (code <= 48) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-fog" d="M12 24 L52 24" stroke="#cfd8dc" stroke-width="4" stroke-linecap="round" />
            <path class="anm-fog" d="M8 36 L56 36" stroke="#b0bec5" stroke-width="4" stroke-linecap="round" />
            <path class="anm-fog" d="M16 48 L48 48" stroke="#90a4ae" stroke-width="4" stroke-linecap="round" />
        </svg>`;
    }
    if (code <= 57) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-cloud" d="M20 36 Q12 36 12 26 Q12 14 24 14 Q28 6 38 10 Q46 8 48 18 Q56 20 56 28 Q56 36 46 36 Z" fill="#cfd8dc" />
            <line class="anm-drop" x1="26" y1="40" x2="26" y2="46" stroke="#4fc3f7" stroke-width="1.5" stroke-linecap="round" />
            <line class="anm-drop" x1="38" y1="40" x2="38" y2="46" stroke="#4fc3f7" stroke-width="1.5" stroke-linecap="round" style="animation-delay:0.5s"/>
        </svg>`;
    }
    if (code <= 67 || (code >= 80 && code <= 82)) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-cloud" d="M20 36 Q12 36 12 26 Q12 14 24 14 Q28 6 38 10 Q46 8 48 18 Q56 20 56 28 Q56 36 46 36 Z" fill="#90a4ae" />
            <line class="anm-drop" x1="24" y1="40" x2="22" y2="50" stroke="#0288d1" stroke-width="2" stroke-linecap="round" />
            <line class="anm-drop" x1="32" y1="40" x2="30" y2="50" stroke="#0288d1" stroke-width="2" stroke-linecap="round" />
            <line class="anm-drop" x1="40" y1="40" x2="38" y2="50" stroke="#0288d1" stroke-width="2" stroke-linecap="round" />
        </svg>`;
    }
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-cloud" d="M20 36 Q12 36 12 26 Q12 14 24 14 Q28 6 38 10 Q46 8 48 18 Q56 20 56 28 Q56 36 46 36 Z" fill="#e3f2fd" />
            <circle class="anm-flake" cx="24" cy="44" r="2.5" fill="white" />
            <circle class="anm-flake" cx="34" cy="48" r="2" fill="white" style="animation-delay:0.5s" />
            <circle class="anm-flake" cx="44" cy="44" r="2.5" fill="white" style="animation-delay:1s" />
        </svg>`;
    }
    if (code >= 96) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-cloud" d="M20 34 Q12 34 12 24 Q12 12 24 12 Q28 4 38 8 Q46 6 48 16 Q56 18 56 26 Q56 34 46 34 Z" fill="#546e7a" />
            <path class="anm-bolt" d="M36 34 L28 46 L34 46 L30 58 L42 42 L34 42 Z" fill="#ffeb3b" stroke="#fbc02d" stroke-width="1" />
            <circle class="anm-drop" cx="20" cy="45" r="3" fill="#fff" opacity="0.9" />
            <circle class="anm-drop" cx="45" cy="45" r="3" fill="#fff" opacity="0.9" style="animation-delay:0.4s"/>
        </svg>`;
    }
    if (code >= 95) {
        return `
        <svg width="40" height="40" viewBox="0 0 64 64">
            <path class="anm-cloud" d="M20 34 Q12 34 12 24 Q12 12 24 12 Q28 4 38 8 Q46 6 48 16 Q56 18 56 26 Q56 34 46 34 Z" fill="#78909c" />
            <path class="anm-bolt" d="M36 34 L28 46 L34 46 L30 58 L42 42 L34 42 Z" fill="#ffeb3b" stroke="#fbc02d" stroke-width="1" />
        </svg>`;
    }
    return `
    <svg width="40" height="40" viewBox="0 0 64 64">
        <path class="anm-cloud" d="M20 40 Q12 40 12 30 Q12 18 24 18 Q28 10 38 14 Q46 12 48 22 Q56 24 56 32 Q56 40 46 40 Z" fill="#ccc" />
    </svg>`;
}

function getWeatherDesc(code) {
    if (code === 0) return "Açık";
    if (code <= 3) return "Parçalı Bulutlu";
    if (code <= 48) return "Sisli";
    if (code <= 57) return "Çiseleme";
    if (code <= 67) return "Yağmurlu";
    if (code <= 77) return "Karlı";
    if (code >= 96) return "Dolu / Fırtına";
    if (code >= 95) return "Fırtına";
    return "Bulutlu";
}

window.togglePlay = function () {
    isPlaying = !isPlaying;
    const icon = playBtn.querySelector('i');
    if (isPlaying) {
        icon.classList.remove('fa-play'); icon.classList.add('fa-pause');
        playInterval = setInterval(() => { timeIndex++; if (timeIndex > 47) timeIndex = 0; slider.value = timeIndex; updateMapState(); }, 700);
    } else { stopPlay(); }
};
function stopPlay() { isPlaying = false; clearInterval(playInterval); const icon = playBtn.querySelector('i'); icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); }
slider.addEventListener('input', (e) => { if (isPlaying) stopPlay(); timeIndex = parseInt(e.target.value); updateMapState(); });
window.setMode = function (mode) { currentMode = mode; document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active')); document.getElementById('btn-' + mode).classList.add('active'); updateLegend(mode); updateMapState(); }
function updateLegend(mode) {
    const box = document.getElementById('legend-box'); const title = document.querySelector('.legend-title'); const bar = document.getElementById('legend-gradient'); const labels = document.getElementById('legend-labels');
    if (mode === 'code') { box.style.opacity = '0'; return; } box.style.opacity = '1';
    if (mode === 'temp') { title.innerText = "SICAKLIK (°C)"; bar.style.background = "linear-gradient(to right, #81d4fa, #4fc3f7, #66bb6a, #fdd835, #ff7043, #ff5252)"; labels.innerHTML = "<span>-10</span><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span>"; }
    else if (mode === 'wind') { title.innerText = "RÜZGAR (km/h)"; bar.style.background = "linear-gradient(to right, #69f0ae, #ffff00, #ff5252, #d50000)"; labels.innerHTML = "<span>0</span><span>20</span><span>40</span><span>60</span><span>80+</span>"; }
    else if (mode === 'pressure') { title.innerText = "BASINÇ (hPa)"; bar.style.background = "linear-gradient(to right, #d50000, #ff5252, transparent, #42a5f5, #1565c0)"; labels.innerHTML = "<span>990</span><span>1000</span><span>1013</span><span>1020</span><span>1035</span>"; }
}

// --- TÜRKİYE MODU ---
const turkeyProvinces = [
    { n: "Adana", lat: 37.00, lon: 35.32 }, { n: "Adıyaman", lat: 37.76, lon: 38.27 }, { n: "Afyon", lat: 38.75, lon: 30.54 }, { n: "Ağrı", lat: 39.72, lon: 43.05 }, { n: "Amasya", lat: 40.65, lon: 35.83 }, { n: "Ankara", lat: 39.92, lon: 32.85 }, { n: "Antalya", lat: 36.88, lon: 30.70 }, { n: "Artvin", lat: 41.18, lon: 41.82 }, { n: "Aydın", lat: 37.84, lon: 27.84 }, { n: "Balıkesir", lat: 39.64, lon: 27.88 }, { n: "Bilecik", lat: 40.15, lon: 29.98 }, { n: "Bingöl", lat: 38.88, lon: 40.49 }, { n: "Bitlis", lat: 38.40, lon: 42.10 }, { n: "Bolu", lat: 40.73, lon: 31.60 }, { n: "Burdur", lat: 37.72, lon: 30.29 }, { n: "Bursa", lat: 40.19, lon: 29.06 }, { n: "Çanakkale", lat: 40.15, lon: 26.41 }, { n: "Çankırı", lat: 40.60, lon: 33.61 }, { n: "Çorum", lat: 40.54, lon: 34.95 }, { n: "Denizli", lat: 37.77, lon: 29.08 }, { n: "Diyarbakır", lat: 37.91, lon: 40.24 }, { n: "Edirne", lat: 41.67, lon: 26.55 }, { n: "Elazığ", lat: 38.68, lon: 39.22 }, { n: "Erzincan", lat: 39.75, lon: 39.50 }, { n: "Erzurum", lat: 39.90, lon: 41.27 }, { n: "Eskişehir", lat: 39.77, lon: 30.52 }, { n: "Gaziantep", lat: 37.06, lon: 37.38 }, { n: "Giresun", lat: 40.91, lon: 38.39 }, { n: "Gümüşhane", lat: 40.46, lon: 39.48 }, { n: "Hakkari", lat: 37.57, lon: 43.74 }, { n: "Hatay", lat: 36.40, lon: 36.34 }, { n: "Isparta", lat: 37.76, lon: 30.55 }, { n: "Mersin", lat: 36.81, lon: 34.64 }, { n: "İstanbul", lat: 41.01, lon: 28.97 }, { n: "İzmir", lat: 38.42, lon: 27.14 }, { n: "Kars", lat: 40.60, lon: 43.09 }, { n: "Kastamonu", lat: 41.37, lon: 33.77 }, { n: "Kayseri", lat: 38.72, lon: 35.48 }, { n: "Kırklareli", lat: 41.73, lon: 27.22 }, { n: "Kırşehir", lat: 39.14, lon: 34.17 }, { n: "Kocaeli", lat: 40.85, lon: 29.88 }, { n: "Konya", lat: 37.87, lon: 32.48 }, { n: "Kütahya", lat: 39.42, lon: 29.98 }, { n: "Malatya", lat: 38.35, lon: 38.33 }, { n: "Manisa", lat: 38.61, lon: 27.42 }, { n: "K.Maraş", lat: 37.57, lon: 36.93 }, { n: "Mardin", lat: 37.31, lon: 40.74 }, { n: "Muğla", lat: 37.21, lon: 28.36 }, { n: "Muş", lat: 38.73, lon: 41.49 }, { n: "Nevşehir", lat: 38.62, lon: 34.71 }, { n: "Niğde", lat: 37.96, lon: 34.68 }, { n: "Ordu", lat: 40.98, lon: 37.88 }, { n: "Rize", lat: 41.02, lon: 40.52 }, { n: "Sakarya", lat: 40.77, lon: 30.40 }, { n: "Samsun", lat: 41.28, lon: 36.33 }, { n: "Siirt", lat: 37.93, lon: 41.94 }, { n: "Sinop", lat: 42.02, lon: 35.15 }, { n: "Sivas", lat: 39.75, lon: 37.01 }, { n: "Tekirdağ", lat: 40.97, lon: 27.51 }, { n: "Tokat", lat: 40.32, lon: 36.55 }, { n: "Trabzon", lat: 41.00, lon: 39.72 }, { n: "Tunceli", lat: 39.10, lon: 39.54 }, { n: "Şanlıurfa", lat: 37.16, lon: 38.79 }, { n: "Uşak", lat: 38.67, lon: 29.40 }, { n: "Van", lat: 38.50, lon: 43.37 }, { n: "Yozgat", lat: 39.82, lon: 34.80 }, { n: "Zonguldak", lat: 41.45, lon: 31.79 }, { n: "Aksaray", lat: 38.37, lon: 34.02 }, { n: "Bayburt", lat: 40.26, lon: 40.22 }, { n: "Karaman", lat: 37.18, lon: 33.22 }, { n: "Kırıkkale", lat: 39.84, lon: 33.51 }, { n: "Batman", lat: 37.88, lon: 41.12 }, { n: "Şırnak", lat: 37.52, lon: 42.46 }, { n: "Bartın", lat: 41.63, lon: 32.33 }, { n: "Ardahan", lat: 41.11, lon: 42.70 }, { n: "Iğdır", lat: 39.92, lon: 44.04 }, { n: "Yalova", lat: 40.65, lon: 29.27 }, { n: "Karabük", lat: 41.20, lon: 32.62 }, { n: "Kilis", lat: 36.71, lon: 37.11 }, { n: "Osmaniye", lat: 37.07, lon: 36.25 }, { n: "Düzce", lat: 40.84, lon: 31.16 }
];

async function loadTurkey() {
    map.flyTo({ center: [35.24, 39.00], zoom: 5.5, speed: 1.2, curve: 1 });
    let newAddedCount = 0;
    turkeyProvinces.forEach(city => {
        // Koordinat bazlı kontrol
        const isExists = activeCities.some(c => Math.abs(c.lat - city.lat) < 0.01 && Math.abs(c.lon - city.lon) < 0.01);
        if (!isExists) { activeCities.push(city); newAddedCount++; }
    });
    if (newAddedCount > 0) {
        document.getElementById('loader').style.display = 'block';
        document.getElementById('loader').innerText = `Türkiye Verileri Yükleniyor...`;
        await fetchWeatherData(activeCities);
        updateMapState();
        document.getElementById('loader').style.display = 'none';
        document.getElementById('loader').innerText = "Sistem Hazır";
    } else { updateMapState(); }
}

setInterval(async () => { if (activeCities.length > 0) { await fetchWeatherData(activeCities); } updateMapState(); }, 1000 * 60 * 30);