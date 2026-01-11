// --- AYARLAR ---
const MAPBOX_TOKEN = 'pk.eyJ1IjoibXltYXN0ZXJwaWVjZSIsImEiOiJjbWthNHZmbzAxbnFwM2VxczR6bnFvZmp0In0.bH-yeHL1xeCQswDehy6AsA'; // Tokenini buraya yapıştır!

const allCities = [...turkeyCities, ...neighborCities];
mapboxgl.accessToken = MAPBOX_TOKEN;

// Harita stilleri
const MAP_STYLES = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    light: 'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
};

const map = new mapboxgl.Map({
    container: 'map',
    style: MAP_STYLES.dark,
    center: [35.0, 39.0], zoom: 4.8, projection: 'globe'
});

// GLOBAL DEĞİŞKENLER
let forecastData = null;
let markers = [];
let currentMode = 'temp';
let geojsonData = null;
let timeIndex = 0;
// OYNATMA İÇİN
let isPlaying = false;
let playInterval = null;

const slider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const playBtn = document.getElementById('play-btn');

map.on('load', async () => {
    map.setFog({ 'range': [0.5, 10], 'color': '#1a1d29', 'high-color': '#111421' });
    document.getElementById('loader').style.display = 'block';

    await fetchHourlyData();
    await loadProvinceBoundaries();

    syncToCurrentTime();
    updateLegend('temp');
    updateMapState();

    slider.disabled = false;
    document.getElementById('loader').style.display = 'none';
});

// --- OYNAT / DURDUR MOTORU ---
window.togglePlay = function () {
    isPlaying = !isPlaying;
    const icon = playBtn.querySelector('i');

    if (isPlaying) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');

        playInterval = setInterval(() => {
            timeIndex++;
            if (timeIndex > 47) timeIndex = 0; // Başa sar
            slider.value = timeIndex;
            updateMapState();
        }, 700);

    } else {
        stopPlay();
    }
};

function stopPlay() {
    isPlaying = false;
    clearInterval(playInterval);
    const icon = playBtn.querySelector('i');
    icon.classList.remove('fa-pause');
    icon.classList.add('fa-play');
}

// Kullanıcı slider'ı elle tutarsa oynatmayı durdur
slider.addEventListener('input', (e) => {
    if (isPlaying) stopPlay();
    timeIndex = parseInt(e.target.value);
    updateMapState();
});

// --- STİL DEĞİŞTİRME ---
window.changeStyle = function (styleKey) {
    document.querySelectorAll('.style-btn').forEach(btn => btn.classList.remove('active'));
    const icons = { 'dark': 'fa-moon', 'light': 'fa-sun', 'satellite': 'fa-earth-europe' };
    const clickedBtn = document.querySelector(`.style-btn i.${icons[styleKey]}`).parentElement;
    clickedBtn.classList.add('active');

    map.setStyle(MAP_STYLES[styleKey]);

    map.once('style.load', () => {
        if (styleKey === 'light') {
            map.setFog({ 'range': [0.5, 10], 'color': '#ffffff', 'high-color': '#e6f2ff', 'space-color': '#d9eaff' });
        } else {
            map.setFog({ 'range': [0.5, 10], 'color': '#1a1d29', 'high-color': '#111421', 'space-color': '#0b0e17' });
        }
        restoreLayers();
    });
};

function restoreLayers() {
    if (!geojsonData) return;
    if (!map.getSource('provinces-data')) {
        map.addSource('provinces-data', { 'type': 'geojson', 'data': geojsonData });
    }
    if (!map.getLayer('province-fills')) {
        map.addLayer({
            'id': 'province-fills', 'type': 'fill', 'source': 'provinces-data',
            'layout': { visibility: 'visible' },
            'paint': { 'fill-color': ['get', 'color'], 'fill-opacity': 0.6 }
        }, 'aeroway-line');
    }
    if (!map.getLayer('province-borders')) {
        map.addLayer({
            'id': 'province-borders', 'type': 'line', 'source': 'provinces-data',
            'layout': { visibility: 'visible' },
            'paint': { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.3 }
        }, 'aeroway-line');
    }
    setMode(currentMode);
}

function syncToCurrentTime() {
    const now = new Date();
    const currentHour = now.getHours();
    timeIndex = currentHour;
    slider.value = currentHour;
}

async function fetchHourlyData() {
    const lats = allCities.map(c => c.lat).join(',');
    const lons = allCities.map(c => c.lon).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl,apparent_temperature,relativehumidity_2m&forecast_days=2&wind_speed_unit=kmh&timezone=auto`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        forecastData = Array.isArray(data) ? data : [data];
    } catch (e) { console.error("Veri Hatası:", e); alert("Veri çekilemedi!"); }
}

function updateMapState() {
    if (!forecastData) return;

    const timeString = forecastData[0].hourly.time[timeIndex];
    const dateObj = new Date(timeString);
    const formattedTime = dateObj.toLocaleDateString('tr-TR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const now = new Date();
    const isNow = dateObj.getHours() === now.getHours() && dateObj.getDate() === now.getDate();
    timeDisplay.innerText = formattedTime + (isNow ? " (ŞU AN)" : "");

    renderMarkers();

    if ((currentMode === 'temp' || currentMode === 'pressure') && map.getSource('provinces-data')) {
        updateProvinceColors();
    }
}

async function loadProvinceBoundaries() {
    if (geojsonData) return;
    try {
        const response = await fetch('https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json');
        geojsonData = await response.json();
        restoreLayers();
    } catch (e) { console.error("GeoJSON Hatası:", e); }
}

function updateProvinceColors() {
    if (!geojsonData || !forecastData) return;

    geojsonData.features.forEach(feature => {
        const cityName = feature.properties.name;
        const cityIndex = turkeyCities.findIndex(c => c.n === cityName || (c.n === 'Afyon' && cityName === 'Afyonkarahisar') || (c.n === 'K.Maraş' && cityName === 'Kahramanmaraş'));

        let color = 'rgba(0,0,0,0)';

        if (cityIndex !== -1) {
            if (currentMode === 'temp') {
                const temp = forecastData[cityIndex].hourly.temperature_2m[timeIndex];
                if (temp < -5) color = '#3f51b5';
                else if (temp < 0) color = '#42a5f5';
                else if (temp < 10) color = '#66bb6a';
                else if (temp < 20) color = '#ffee58';
                else if (temp < 30) color = '#ffa726';
                else color = '#ef5350';
            }
            else if (currentMode === 'pressure') {
                const press = forecastData[cityIndex].hourly.pressure_msl[timeIndex];
                if (press < 1000) color = '#7e57c2';
                else if (press < 1010) color = '#42a5f5';
                else if (press < 1018) color = '#66bb6a';
                else if (press < 1025) color = '#ffa726';
                else color = '#ef5350';
            }
        }
        feature.properties.color = color;
    });

    if (map.getSource('provinces-data')) {
        map.getSource('provinces-data').setData(geojsonData);
    }
}

function updateLegend(mode) {
    const box = document.getElementById('legend-box');
    const title = document.querySelector('.legend-title');
    const bar = document.getElementById('legend-gradient');
    const labels = document.getElementById('legend-labels');

    if (mode === 'code') { box.style.opacity = '0'; return; }
    box.style.opacity = '1';

    if (mode === 'temp') {
        title.innerText = "SICAKLIK (°C)";
        bar.style.background = "linear-gradient(to right, #3f51b5, #42a5f5, #66bb6a, #ffee58, #ffa726, #ef5350)";
        labels.innerHTML = "<span>-10</span><span>0</span><span>10</span><span>20</span><span>30</span><span>40</span>";
    }
    else if (mode === 'wind') {
        title.innerText = "RÜZGAR (km/h)";
        bar.style.background = "linear-gradient(to right, #69f0ae, #ffff00, #ff5252, #d50000)";
        labels.innerHTML = "<span>0</span><span>20</span><span>40</span><span>60</span><span>80+</span>";
    }
    else if (mode === 'pressure') {
        title.innerText = "BASINÇ (hPa)";
        bar.style.background = "linear-gradient(to right, #7e57c2, #42a5f5, #66bb6a, #ffa726, #ef5350)";
        labels.innerHTML = "<span>AB</span><span>1000</span><span>1013</span><span>1020</span><span>YB</span>";
    }
}

window.setMode = function (mode) {
    currentMode = mode;
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');

    if (map.getLayer('province-fills')) {
        const showPaint = (mode === 'temp' || mode === 'pressure');
        const visibility = showPaint ? 'visible' : 'none';
        map.setLayoutProperty('province-fills', 'visibility', visibility);
        map.setLayoutProperty('province-borders', 'visibility', visibility);
        if (showPaint) updateProvinceColors();
    }
    updateLegend(mode);
    renderMarkers();
}

// --- DÜZELTİLMİŞ İKON FONKSİYONU ---
function getWeatherIcon(code) {
    // 0: AÇIK
    if (code === 0) return { i: 'fa-sun', c: '#fdd835' };
    // 1-3: BULUTLU
    if (code <= 3) return { i: 'fa-cloud-sun', c: '#fff' };
    // 45-48: SİS
    if (code <= 48) return { i: 'fa-smog', c: '#90a4ae' };
    // 51-67: ÇİSELEME/YAĞMUR VE 80-82: SAĞANAK (ARTIK YAĞMUR İKONU)
    if (code <= 67 || (code >= 80 && code <= 82)) return { i: 'fa-cloud-rain', c: '#4fc3f7' };
    // KAR
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { i: 'fa-snowflake', c: '#81d4fa' };
    // 95+: FIRTINA/ORAJ (Sadece bunlar şimşek)
    if (code >= 95) return { i: 'fa-bolt', c: '#ff5252' };

    return { i: 'fa-cloud', c: '#ccc' };
}

function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = [];
    if (!forecastData) return;

    allCities.forEach((city, index) => {
        const i = timeIndex;
        const temp = forecastData[index].hourly.temperature_2m[i];
        const feelsLike = forecastData[index].hourly.apparent_temperature[i];
        const windSpeed = forecastData[index].hourly.wind_speed_10m[i];
        const windDir = forecastData[index].hourly.wind_direction_10m[i];
        const wCode = forecastData[index].hourly.weather_code[i];
        const pressure = forecastData[index].hourly.pressure_msl[i];
        const humidity = forecastData[index].hourly.relativehumidity_2m[i];

        const el = document.createElement('div');
        el.className = city.isNeighbor ? 'city-marker neighbor-city' : 'city-marker';
        let htmlContent = '';

        if (currentMode === 'temp') {
            let color = '#fdd835';
            if (temp < 0) color = '#448aff'; else if (temp < 10) color = '#66bb6a'; else if (temp > 25) color = '#ff7043';
            const isPainted = (!city.isNeighbor && (currentMode === 'temp' || currentMode === 'pressure'));
            htmlContent = `<div class="temp-value" style="color:${isPainted ? '#fff' : color}">${Math.round(temp)}°</div>`;
        }
        else if (currentMode === 'wind') {
            let color = windSpeed < 20 ? '#69f0ae' : (windSpeed < 40 ? '#ffff00' : '#ff5252');
            let opacity = windSpeed < 5 ? 0.5 : 1;
            htmlContent = `<i class="fa-solid fa-arrow-up wind-arrow" style="transform: rotate(${windDir}deg); color: ${color}; opacity:${opacity}"></i>`;
        }
        else if (currentMode === 'code') {
            const style = getWeatherIcon(wCode);
            htmlContent = `<i class="fa-solid ${style.i} weather-icon" style="color: ${style.c};"></i>`;
        }
        else if (currentMode === 'pressure') {
            htmlContent = `<div class="temp-value" style="font-size:12px; color:#fff">${Math.round(pressure)}</div>`;
        }

        htmlContent += `<div class="city-name">${city.n}</div>`;
        el.innerHTML = htmlContent;

        // Tıklama Olayı (Popup)
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const popupHTML = `
                <div class="pop-header">${city.n}</div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-temperature-half"></i> Sıcaklık</span><span class="pop-val">${Math.round(temp)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-person"></i> Hissedilen</span><span class="pop-val">${Math.round(feelsLike)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-droplet"></i> Nem</span><span class="pop-val">${humidity}%</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-wind"></i> Rüzgar</span><span class="pop-val">${Math.round(windSpeed)} <small>km/h</small></span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-gauge-high"></i> Basınç</span><span class="pop-val">${Math.round(pressure)} <small>hPa</small></span></div>
            `;
            new mapboxgl.Popup({ offset: 25, closeButton: true }).setLngLat([city.lon, city.lat]).setHTML(popupHTML).addTo(map);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([city.lon, city.lat]).addTo(map);
        markers.push(marker);
    });
}