// --- AYARLAR ---
const MAPBOX_TOKEN = 'pk.eyJ1IjoibXltYXN0ZXJwaWVjZSIsImEiOiJjbWtkeWFheDEwMTVvM2NxcXJkdzExZjd3In0.nmra2NE82BvwU654Svm9xQ'; // Tokenini buraya yapıştır!

mapboxgl.accessToken = MAPBOX_TOKEN;

// Hafızadaki Şehirler (data.js dosyasından geliyor mu kontrol et)
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
    zoom: 3, 
    projection: 'globe' 
});

// GLOBAL DEĞİŞKENLER
let forecastData = []; 
let markers = [];
let currentMode = 'temp'; 
let timeIndex = 0; 
let isPlaying = false;
let playInterval = null;
let moveTimeout = null;
let userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let markerOpacity = 1;

// HTML Elemanları
const slider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const playBtn = document.getElementById('play-btn');
const opacitySlider = document.getElementById('opacity-slider');

map.on('load', async () => {
    map.setFog({ 'range': [0.5, 10], 'color': '#1a1d29', 'high-color': '#111421' });
    document.getElementById('loader').style.display = 'block';
    
    // Veri dosyası kontrolü
    if(activeCities.length === 0) {
        alert("HATA: data.js dosyası bulunamadı veya içi boş!");
        return;
    }
    
    setupHeatmapLayer();
    await fetchWeatherData(activeCities);
    
    slider.value = 0; 
    timeIndex = 0;
    
    updateLegend('temp');
    updateMapState();

    slider.disabled = false;
    document.getElementById('loader').style.display = 'none';

    // Dinamik Keşif
    map.on('moveend', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(scanAndFetchNewCities, 500);
    });
});

// Opaklık Ayarı
if(opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        markerOpacity = parseFloat(e.target.value);
        markers.forEach(marker => {
            marker.getElement().style.opacity = markerOpacity;
        });
    });
}

// --- VERİ İŞLEMLERİ ---
async function fetchWeatherData(cityList) {
    if (cityList.length === 0) return;
    const lats = cityList.map(c => c.lat.toFixed(2)).join(',');
    const lons = cityList.map(c => c.lon.toFixed(2)).join(',');
    
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl&forecast_days=3&wind_speed_unit=kmh&timezone=${userTimezone}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const rawDataArray = Array.isArray(data) ? data : [data];
        forecastData = rawDataArray.map(cityData => processCityData(cityData));
    } catch (e) { console.error("Veri Hatası:", e); }
}

async function appendWeatherData(newCityList) {
    if (newCityList.length === 0) return;
    const lats = newCityList.map(c => c.lat.toFixed(2)).join(',');
    const lons = newCityList.map(c => c.lon.toFixed(2)).join(',');
    
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl&forecast_days=3&wind_speed_unit=kmh&timezone=${userTimezone}`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const rawDataArray = Array.isArray(data) ? data : [data];
        const processedNewData = rawDataArray.map(cityData => processCityData(cityData));
        forecastData = [...forecastData, ...processedNewData];
    } catch (e) { console.error("Veri Hatası:", e); }
}

function processCityData(data) {
    if (!data || !data.hourly) return null;
    const currentHour = new Date().getHours(); 
    const slicedData = { hourly: {} };
    Object.keys(data.hourly).forEach(key => {
        const arr = data.hourly[key];
        slicedData.hourly[key] = arr.slice(currentHour, currentHour + 48);
    });
    return slicedData;
}

async function scanAndFetchNewCities() {
    const zoom = map.getZoom();
    if (zoom < 4.5) return;

    const features = map.queryRenderedFeatures({ 
        layers: ['settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label'] 
    });

    if (!features.length) return;

    const newCitiesToFetch = [];

    features.forEach(f => {
        const name = f.properties.name_tr || f.properties.name; 
        const alreadyExists = activeCities.some(c => c.n === name);

        if (name && !alreadyExists) {
            const newCity = {
                n: name,
                lat: f.geometry.coordinates[1],
                lon: f.geometry.coordinates[0]
            };
            activeCities.push(newCity);
            newCitiesToFetch.push(newCity);
        }
    });

    if (newCitiesToFetch.length > 0) {
        const batch = newCitiesToFetch.slice(0, 20);
        document.getElementById('loader').style.display = 'block';
        document.getElementById('loader').innerText = `+${batch.length} Bölge Eklendi`;
        await appendWeatherData(batch);
        updateMapState();
        document.getElementById('loader').style.display = 'none';
        document.getElementById('loader').innerText = "Veriler Yükleniyor...";
    }
}

// --- HARİTA GÜNCELLEME ---
function updateMapState() {
    if (!forecastData || forecastData.length === 0) return;
    
    const cityData = forecastData[0];
    if(cityData && cityData.hourly && cityData.hourly.time) {
        const timeString = cityData.hourly.time[timeIndex];
        const dateObj = new Date(timeString);
        const formattedTime = dateObj.toLocaleDateString('tr-TR', { weekday: 'long', hour: '2-digit', minute:'2-digit' });
        timeDisplay.innerText = formattedTime + (timeIndex === 0 ? " (ŞU AN)" : "");
    }

    renderMarkers();
    updateAtmosphereLayer();
}

function updateAtmosphereLayer() {
    if (currentMode !== 'temp') {
        map.setLayoutProperty('atmospheric-glow', 'visibility', 'none');
        return;
    }
    map.setLayoutProperty('atmospheric-glow', 'visibility', 'visible');

    const features = activeCities.map((city, index) => {
        if (!forecastData[index] || !forecastData[index].hourly || !forecastData[index].hourly.temperature_2m) return null;

        const temp = forecastData[index].hourly.temperature_2m[timeIndex];
        let color = '#fdd835'; 

        if (temp < -15) color = '#1a237e';
        else if (temp < -5) color = '#283593';
        else if (temp < 0) color = '#448aff';
        else if (temp < 10) color = '#69f0ae';
        else if (temp < 20) color = '#fdd835';
        else if (temp < 30) color = '#ff7043';
        else color = '#d50000';

        return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
            properties: { color: color }
        };
    }).filter(f => f !== null);

    map.getSource('weather-points').setData({
        type: 'FeatureCollection',
        features: features
    });
}

function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = [];
    
    activeCities.forEach((city, index) => {
        if (!forecastData[index] || !forecastData[index].hourly) return;
        const i = timeIndex;
        if (i >= forecastData[index].hourly.temperature_2m.length) return;

        const temp = forecastData[index].hourly.temperature_2m[i];
        const windSpeed = forecastData[index].hourly.wind_speed_10m[i];
        const windDir = forecastData[index].hourly.wind_direction_10m[i];
        const wCode = forecastData[index].hourly.weather_code[i];
        const pressure = forecastData[index].hourly.pressure_msl[i];

        const el = document.createElement('div');
        el.className = 'city-marker';
        el.style.opacity = markerOpacity; 

        let htmlContent = '';

        if (currentMode === 'temp') {
            let color = '#fdd835'; 
            if (temp < 0) color = '#448aff'; else if (temp < 10) color = '#66bb6a'; else if (temp > 25) color = '#ff7043';
            htmlContent = `<div class="temp-value" style="color:${color}">${Math.round(temp)}°</div>`;
        }
        else if (currentMode === 'wind') {
            let color = windSpeed < 20 ? '#69f0ae' : '#ff5252';
            htmlContent = `<i class="fa-solid fa-arrow-up wind-arrow" style="transform: rotate(${windDir}deg); color: ${color};"></i>`;
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

        el.addEventListener('click', (e) => {
             e.stopPropagation(); 
             new mapboxgl.Popup({offset:25, closeButton:false})
                .setLngLat([city.lon, city.lat])
                .setHTML(`<div style="color:black; font-weight:bold;">${city.n}: ${Math.round(temp)}°C</div>`)
                .addTo(map);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([city.lon, city.lat])
            .addTo(map);
        markers.push(marker);
    });
}

function setupHeatmapLayer() {
    map.addSource('weather-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id: 'atmospheric-glow',
        type: 'circle',
        source: 'weather-points',
        paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 20, 5, 50, 10, 150],
            'circle-color': ['get', 'color'],
            'circle-blur': 0.6,
            'circle-opacity': 0.5
        }
    }, 'aeroway-line');
}

// --- YARDIMCI FONKSİYONLAR ---
function getWeatherIcon(code) {
    if (code === 0) return { i: 'fa-sun', c: '#fdd835' }; 
    if (code <= 3) return { i: 'fa-cloud-sun', c: '#fff' }; 
    if (code <= 48) return { i: 'fa-smog', c: '#90a4ae' }; 
    if (code <= 67 || (code >= 80 && code <= 82)) return { i: 'fa-cloud-rain', c: '#4fc3f7' }; 
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { i: 'fa-snowflake', c: '#81d4fa' }; 
    if (code >= 95) return { i: 'fa-bolt', c: '#ff5252' }; 
    return { i: 'fa-cloud', c: '#ccc' }; 
}

// Global (Window) Fonksiyonlar
window.togglePlay = function() {
    isPlaying = !isPlaying;
    const icon = playBtn.querySelector('i');
    if (isPlaying) {
        icon.classList.remove('fa-play'); icon.classList.add('fa-pause');
        playInterval = setInterval(() => {
            timeIndex++;
            if (timeIndex > 47) timeIndex = 0;
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
    icon.classList.remove('fa-pause'); icon.classList.add('fa-play');
}

slider.addEventListener('input', (e) => {
    if (isPlaying) stopPlay();
    timeIndex = parseInt(e.target.value);
    updateMapState();
});

window.setMode = function(mode) {
    currentMode = mode;
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + mode).classList.add('active');
    updateLegend(mode);
    updateMapState();
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
        bar.style.background = "linear-gradient(to right, #1a237e, #283593, #448aff, #69f0ae, #fdd835, #ff7043, #d50000)";
        labels.innerHTML = "<span>-15</span><span>-5</span><span>0</span><span>10</span><span>20</span><span>30</span>";
    } else if (mode === 'wind') {
        title.innerText = "RÜZGAR (km/h)";
        bar.style.background = "linear-gradient(to right, #69f0ae, #ffff00, #ff5252, #d50000)";
        labels.innerHTML = "<span>0</span><span>20</span><span>40</span><span>60</span><span>80+</span>";
    } else if (mode === 'pressure') {
        title.innerText = "BASINÇ (hPa)";
        bar.style.background = "linear-gradient(to right, #7e57c2, #42a5f5, #66bb6a, #ffa726, #ef5350)";
        labels.innerHTML = "<span>AB</span><span>1000</span><span>1013</span><span>1020</span><span>YB</span>";
    }
}

window.changeStyle = function(styleKey) {
    const icons = { 'dark': 'fa-moon', 'light': 'fa-sun', 'satellite': 'fa-earth-europe' };
    const clickedBtn = document.querySelector(`.style-btn i.${icons[styleKey]}`).parentElement;
    document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    clickedBtn.classList.add('active');

    map.setStyle(MAP_STYLES[styleKey]);
    map.once('style.load', () => {
        setupHeatmapLayer();
        if(styleKey === 'light') map.setFog({ 'range': [0.5, 10], 'color': '#ffffff', 'high-color': '#e6f2ff', 'space-color': '#d9eaff' });
        else map.setFog({ 'range': [0.5, 10], 'color': '#1a1d29', 'high-color': '#111421', 'space-color': '#0b0e17' });
        
        setTimeout(updateMapState, 500);
    });
};

// Otomatik güncelleme (30 dk)
setInterval(async () => {
    if (activeCities.length > 0) {
        forecastData = []; 
        await fetchWeatherData(activeCities);
    }
    updateMapState();

}, 1000 * 60 * 30);

