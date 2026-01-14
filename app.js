// --- AYARLAR ---
const MAPBOX_TOKEN = 'pk.eyJ1IjoibXltYXN0ZXJwaWVjZSIsImEiOiJjbWtkeWFheDEwMTVvM2NxcXJkdzExZjd3In0.nmra2NE82BvwU654Svm9xQ'; // Tokenini buraya yapıştır!

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
let currentMode = 'temp';
let timeIndex = 0;
let isPlaying = false;
let playInterval = null;
let moveTimeout = null;
let isFetching = false;

// HTML Elemanları
const slider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const playBtn = document.getElementById('play-btn');

map.on('load', async () => {
    map.setFog({ 'range': [0.5, 10], 'color': '#000000', 'high-color': '#1a1d29' });
    document.getElementById('loader').style.display = 'block';

    if (activeCities.length === 0) { alert("Hata: data.js bulunamadı."); return; }

    await fetchWeatherData(activeCities);

    slider.value = 0;
    timeIndex = 0;

    updateLegend('temp');
    updateMapState();

    slider.disabled = false;
    document.getElementById('loader').style.display = 'none';

    map.on('moveend', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(scanAndFetchNewCities, 500);
    });
});

// --- VERİ ÇEKME MOTORU ---
async function fetchWeatherData(cityList) {
    if (cityList.length === 0 || isFetching) return;
    isFetching = true;

    const citiesToFetch = cityList.filter(c => !weatherCache[`${c.lat.toFixed(2)},${c.lon.toFixed(2)}`]);

    if (citiesToFetch.length === 0) {
        isFetching = false;
        return;
    }

    const batch = citiesToFetch.slice(0, 50);
    const lats = batch.map(c => c.lat.toFixed(2)).join(',');
    const lons = batch.map(c => c.lon.toFixed(2)).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl,apparent_temperature,relativehumidity_2m&forecast_days=3&wind_speed_unit=kmh&timezone=auto`;

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
}

function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = [];

    activeCities.forEach((city) => {
        const cityKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
        const data = weatherCache[cityKey];
        if (!data) return;

        let temp, feelsLike, humidity, windSpeed, windDir, wCode, pressure;

        if (timeIndex === 0) {
            if (!data.current) return;
            temp = data.current.temperature_2m;
            feelsLike = data.current.apparent_temperature;
            humidity = data.current.relative_humidity_2m;
            windSpeed = data.current.wind_speed_10m;
            windDir = data.current.wind_direction_10m;
            wCode = data.current.weather_code;
            pressure = data.current.surface_pressure;
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
        }

        const el = document.createElement('div');
        el.className = 'city-marker';

        let htmlContent = '';
        if (currentMode === 'temp') {
            let color = '#fdd835';
            if (temp < -10) color = '#81d4fa'; else if (temp < 0) color = '#4fc3f7'; else if (temp < 10) color = '#66bb6a'; else if (temp < 20) color = '#fdd835'; else if (temp < 30) color = '#ff7043'; else color = '#ff5252';
            htmlContent = `<div class="temp-value" style="color:${color}; text-shadow: 0 0 10px ${color};">${Math.round(temp)}°</div>`;
        }
        else if (currentMode === 'wind') {
            let color = windSpeed < 20 ? '#69f0ae' : '#ff5252';
            htmlContent = `<i class="fa-solid fa-arrow-up wind-arrow" style="transform: rotate(${windDir}deg); color: ${color}; text-shadow: 0 0 5px ${color};"></i>`;
        }
        else if (currentMode === 'code') {
            const style = getWeatherIcon(wCode);
            htmlContent = `<i class="fa-solid ${style.i} weather-icon" style="color: ${style.c}; filter: drop-shadow(0 0 5px ${style.c});"></i>`;
        }
        else if (currentMode === 'pressure') {
            htmlContent = `<div class="temp-value" style="font-size:12px; color:#fff">${Math.round(pressure)}</div>`;
        }

        htmlContent += `<div class="city-name">${city.n}</div>`;
        el.innerHTML = htmlContent;

        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const popupHTML = `
                <div class="pop-header">${city.n} <span style="font-size:10px; opacity:0.7; display:block">(${timeIndex === 0 ? 'CANLI' : 'TAHMİN'})</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-temperature-half"></i> Sıcaklık</span><span class="pop-val">${Math.round(temp)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-person"></i> Hissedilen</span><span class="pop-val">${Math.round(feelsLike)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-droplet"></i> Nem</span><span class="pop-val">%${humidity}</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-wind"></i> Rüzgar</span><span class="pop-val">${Math.round(windSpeed)} <small>km/h</small></span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-gauge-high"></i> Basınç</span><span class="pop-val">${Math.round(pressure)} <small>hPa</small></span></div>
                <div class="pop-row" style="margin-top:5px; justify-content:center; color:#aaa; font-size:10px;">${getWeatherDesc(wCode)}</div>
            `;
            new mapboxgl.Popup({ offset: 25, closeButton: true }).setLngLat([city.lon, city.lat]).setHTML(popupHTML).addTo(map);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([city.lon, city.lat]).addTo(map);
        markers.push(marker);
    });
}

function getWeatherIcon(code) {
    if (code === 0) return { i: 'fa-sun', c: '#fdd835' };
    if (code <= 3) return { i: 'fa-cloud-sun', c: '#fff' };
    if (code <= 48) return { i: 'fa-smog', c: '#90a4ae' };
    if (code <= 67 || (code >= 80 && code <= 82)) return { i: 'fa-cloud-rain', c: '#4fc3f7' };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { i: 'fa-snowflake', c: '#81d4fa' };
    if (code >= 95) return { i: 'fa-bolt', c: '#ff5252' };
    return { i: 'fa-cloud', c: '#ccc' };
}

function getWeatherDesc(code) {
    if (code === 0) return "Açık";
    if (code <= 3) return "Parçalı Bulutlu";
    if (code <= 48) return "Sisli";
    if (code <= 67) return "Yağmurlu";
    if (code <= 77) return "Karlı";
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
    else if (mode === 'pressure') { title.innerText = "BASINÇ (hPa)"; bar.style.background = "linear-gradient(to right, #7e57c2, #42a5f5, #66bb6a, #ffa726, #ef5350)"; labels.innerHTML = "<span>AB</span><span>1000</span><span>1013</span><span>1020</span><span>YB</span>"; }
    window.changeStyle = function (styleKey) {
        const icons = { 'dark': 'fa-moon', 'light': 'fa-sun', 'satellite': 'fa-earth-europe' }; const clickedBtn = document.querySelector(`.style-btn i.${icons[styleKey]}`).parentElement;
        document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active')); clickedBtn.classList.add('active');
        map.setStyle(MAP_STYLES[styleKey]);
    };
}

// --- TÜRKİYE MODU ---
const turkeyProvinces = [
    { n: "Adana", lat: 37.00, lon: 35.32 }, { n: "Adıyaman", lat: 37.76, lon: 38.27 }, { n: "Afyon", lat: 38.75, lon: 30.54 }, { n: "Ağrı", lat: 39.72, lon: 43.05 }, { n: "Amasya", lat: 40.65, lon: 35.83 }, { n: "Ankara", lat: 39.92, lon: 32.85 }, { n: "Antalya", lat: 36.88, lon: 30.70 }, { n: "Artvin", lat: 41.18, lon: 41.82 }, { n: "Aydın", lat: 37.84, lon: 27.84 }, { n: "Balıkesir", lat: 39.64, lon: 27.88 }, { n: "Bilecik", lat: 40.15, lon: 29.98 }, { n: "Bingöl", lat: 38.88, lon: 40.49 }, { n: "Bitlis", lat: 38.40, lon: 42.10 }, { n: "Bolu", lat: 40.73, lon: 31.60 }, { n: "Burdur", lat: 37.72, lon: 30.29 }, { n: "Bursa", lat: 40.19, lon: 29.06 }, { n: "Çanakkale", lat: 40.15, lon: 26.41 }, { n: "Çankırı", lat: 40.60, lon: 33.61 }, { n: "Çorum", lat: 40.54, lon: 34.95 }, { n: "Denizli", lat: 37.77, lon: 29.08 }, { n: "Diyarbakır", lat: 37.91, lon: 40.24 }, { n: "Edirne", lat: 41.67, lon: 26.55 }, { n: "Elazığ", lat: 38.68, lon: 39.22 }, { n: "Erzincan", lat: 39.75, lon: 39.50 }, { n: "Erzurum", lat: 39.90, lon: 41.27 }, { n: "Eskişehir", lat: 39.77, lon: 30.52 }, { n: "Gaziantep", lat: 37.06, lon: 37.38 }, { n: "Giresun", lat: 40.91, lon: 38.39 }, { n: "Gümüşhane", lat: 40.46, lon: 39.48 }, { n: "Hakkari", lat: 37.57, lon: 43.74 }, { n: "Hatay", lat: 36.40, lon: 36.34 }, { n: "Isparta", lat: 37.76, lon: 30.55 }, { n: "Mersin", lat: 36.81, lon: 34.64 }, { n: "İstanbul", lat: 41.01, lon: 28.97 }, { n: "İzmir", lat: 38.42, lon: 27.14 }, { n: "Kars", lat: 40.60, lon: 43.09 }, { n: "Kastamonu", lat: 41.37, lon: 33.77 }, { n: "Kayseri", lat: 38.72, lon: 35.48 }, { n: "Kırklareli", lat: 41.73, lon: 27.22 }, { n: "Kırşehir", lat: 39.14, lon: 34.17 }, { n: "Kocaeli", lat: 40.85, lon: 29.88 }, { n: "Konya", lat: 37.87, lon: 32.48 }, { n: "Kütahya", lat: 39.42, lon: 29.98 }, { n: "Malatya", lat: 38.35, lon: 38.33 }, { n: "Manisa", lat: 38.61, lon: 27.42 }, { n: "K.Maraş", lat: 37.57, lon: 36.93 }, { n: "Mardin", lat: 37.31, lon: 40.74 }, { n: "Muğla", lat: 37.21, lon: 28.36 }, { n: "Muş", lat: 38.73, lon: 41.49 }, { n: "Nevşehir", lat: 38.62, lon: 34.71 }, { n: "Niğde", lat: 37.96, lon: 34.68 }, { n: "Ordu", lat: 40.98, lon: 37.88 }, { n: "Rize", lat: 41.02, lon: 40.52 }, { n: "Sakarya", lat: 40.77, lon: 30.40 }, { n: "Samsun", lat: 41.28, lon: 36.33 }, { n: "Siirt", lat: 37.93, lon: 41.94 }, { n: "Sinop", lat: 42.02, lon: 35.15 }, { n: "Sivas", lat: 39.75, lon: 37.01 }, { n: "Tekirdağ", lat: 40.97, lon: 27.51 }, { n: "Tokat", lat: 40.32, lon: 36.55 }, { n: "Trabzon", lat: 41.00, lon: 39.72 }, { n: "Tunceli", lat: 39.10, lon: 39.54 }, { n: "Şanlıurfa", lat: 37.16, lon: 38.79 }, { n: "Uşak", lat: 38.67, lon: 29.40 }, { n: "Van", lat: 38.50, lon: 43.37 }, { n: "Yozgat", lat: 39.82, lon: 34.80 }, { n: "Zonguldak", lat: 41.45, lon: 31.79 }, { n: "Aksaray", lat: 38.37, lon: 34.02 }, { n: "Bayburt", lat: 40.26, lon: 40.22 }, { n: "Karaman", lat: 37.18, lon: 33.22 }, { n: "Kırıkkale", lat: 39.84, lon: 33.51 }, { n: "Batman", lat: 37.88, lon: 41.12 }, { n: "Şırnak", lat: 37.52, lon: 42.46 }, { n: "Bartın", lat: 41.63, lon: 32.33 }, { n: "Ardahan", lat: 41.11, lon: 42.70 }, { n: "Iğdır", lat: 39.92, lon: 44.04 }, { n: "Yalova", lat: 40.65, lon: 29.27 }, { n: "Karabük", lat: 41.20, lon: 32.62 }, { n: "Kilis", lat: 36.71, lon: 37.11 }, { n: "Osmaniye", lat: 37.07, lon: 36.25 }, { n: "Düzce", lat: 40.84, lon: 31.16 }
];

async function loadTurkey() {
    map.flyTo({ center: [35.24, 39.00], zoom: 5.5, speed: 1.2, curve: 1 });
    let newAddedCount = 0;
    turkeyProvinces.forEach(city => {
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