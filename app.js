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
// Veriyi artık Düz Dizi değil, Koordinat Bazlı Sözlük (Dictionary) olarak tutacağız.
// Bu sayede kayma/karışma riski %0 olur.
let weatherCache = {}; 

let markers = [];
let currentMode = 'temp'; 
let timeIndex = 0; 
let isPlaying = false;
let playInterval = null;
let moveTimeout = null;
let userTimezone = "auto"; 
let isFetching = false; // Çakışmayı önlemek için kilit

let markerOpacity = 1;

// HTML Elemanları
const slider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('time-display');
const playBtn = document.getElementById('play-btn');
const opacitySlider = document.getElementById('opacity-slider');

map.on('load', async () => {
    // Boyama/Sis efektini kapattık (Karanlık ve net)
    map.setFog({ 'range': [0.5, 10], 'color': '#000000', 'high-color': '#1a1d29' });
    document.getElementById('loader').style.display = 'block';
    
    if(activeCities.length === 0) { alert("Hata: data.js bulunamadı."); return; }

    // İlk verileri çek
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

if(opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
        markerOpacity = parseFloat(e.target.value);
        markers.forEach(marker => { 
            marker.getElement().style.opacity = markerOpacity; 
        });
    });
}

// --- VERİ ÇEKME MOTORU (YENİLENMİŞ) ---
async function fetchWeatherData(cityList) {
    if (cityList.length === 0 || isFetching) return;
    isFetching = true;

    // Sadece henüz verisi olmayan şehirleri filtrele (Gereksiz trafiği önle)
    const citiesToFetch = cityList.filter(c => !weatherCache[`${c.lat.toFixed(2)},${c.lon.toFixed(2)}`]);

    if (citiesToFetch.length === 0) {
        isFetching = false;
        return;
    }

    // Maksimum 50 şehir paketi halinde çek (API sınırı yememek için)
    const batch = citiesToFetch.slice(0, 50);

    const lats = batch.map(c => c.lat.toFixed(2)).join(',');
    const lons = batch.map(c => c.lon.toFixed(2)).join(',');
    
    // ANLIK (Current) ve SAATLİK (Hourly) veriyi aynı anda istiyoruz
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code,pressure_msl,apparent_temperature,relativehumidity_2m&forecast_days=3&wind_speed_unit=kmh&timezone=auto`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const rawDataArray = Array.isArray(data) ? data : [data];
        
        // Gelen veriyi Cache'e işle
        rawDataArray.forEach((cityData, index) => {
            const cityKey = `${batch[index].lat.toFixed(2)},${batch[index].lon.toFixed(2)}`;
            weatherCache[cityKey] = processCityData(cityData);
        });

    } catch (e) { console.error("Veri Hatası:", e); }
    
    isFetching = false;
}

function processCityData(data) {
    if (!data) return null;

    // Saatlik verileri şimdiki zamana göre hizala
    const currentHourIndex = new Date().getHours(); 
    const slicedHourly = {};

    if (data.hourly) {
        Object.keys(data.hourly).forEach(key => {
            const arr = data.hourly[key];
            if (Array.isArray(arr)) {
                // Şimdiki saatten başla, 48 saat al
                slicedHourly[key] = arr.slice(currentHourIndex, currentHourIndex + 48);
            }
        });
    }

    return {
        current: data.current, // Anlık Veri (Kesin Doğru)
        hourly: slicedHourly   // Tahmin Verisi
    };
}

async function scanAndFetchNewCities() {
    const zoom = map.getZoom();
    if (zoom < 4.5) return;
    
    const features = map.queryRenderedFeatures({ 
        layers: ['settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label'] 
    });
    
    if (!features.length) return;
    
    const newCitiesFound = [];
    
    features.forEach(f => {
        const name = f.properties.name_tr || f.properties.name; 
        // Benzersizlik kontrolü (İsim yerine koordinat kullanmak daha güvenli ama isim pratik)
        const alreadyExists = activeCities.some(c => c.n === name);
        
        if (name && !alreadyExists) {
            const newCity = { 
                n: name, 
                lat: f.geometry.coordinates[1], 
                lon: f.geometry.coordinates[0] 
            };
            activeCities.push(newCity);
            newCitiesFound.push(newCity);
        }
    });
    
    if (newCitiesFound.length > 0) {
        document.getElementById('loader').style.display = 'block';
        document.getElementById('loader').innerText = `+${newCitiesFound.length} Bölge Yükleniyor`;
        
        await fetchWeatherData(newCitiesFound);
        updateMapState();
        
        document.getElementById('loader').style.display = 'none';
        document.getElementById('loader').innerText = "Sistem Hazır";
    }
}

function updateMapState() {
    // Zaman Başlığını Güncelle
    // Herhangi bir şehrin verisinden zamanı okuyabiliriz
    const sampleKey = Object.keys(weatherCache)[0];
    const sampleData = weatherCache[sampleKey];

    if (timeIndex === 0) {
        timeDisplay.innerHTML = '<span style="color:#00e676"><i class="fa-solid fa-circle-dot"></i> CANLI</span>';
    } else if (sampleData && sampleData.hourly && sampleData.hourly.time) {
        const timeString = sampleData.hourly.time[timeIndex];
        const dateObj = new Date(timeString);
        const formattedTime = dateObj.toLocaleDateString('tr-TR', { weekday: 'long', hour: '2-digit', minute:'2-digit' });
        timeDisplay.innerText = formattedTime;
    }
    renderMarkers();
}

function renderMarkers() {
    markers.forEach(m => m.remove());
    markers = [];
    
    activeCities.forEach((city) => {
        // Koordinat anahtarıyla veriyi çek (Karışıklığı önler)
        const cityKey = `${city.lat.toFixed(2)},${city.lon.toFixed(2)}`;
        const data = weatherCache[cityKey];
        
        if (!data) return; // Veri henüz gelmediyse geç

        // VERİ SEÇİMİ (CANLI MI TAHMİN Mİ?)
        let temp, feelsLike, humidity, windSpeed, windDir, wCode, pressure;

        if (timeIndex === 0) {
            // SLIDER 0 İSE: Direkt 'current' verisini kullan
            if (!data.current) return;
            temp = data.current.temperature_2m;
            feelsLike = data.current.apparent_temperature;
            humidity = data.current.relative_humidity_2m;
            windSpeed = data.current.wind_speed_10m;
            windDir = data.current.wind_direction_10m;
            wCode = data.current.weather_code;
            pressure = data.current.surface_pressure;
        } else {
            // SLIDER İLERİDEYSE: 'hourly' listesinden çek
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
        el.style.opacity = markerOpacity; 

        let htmlContent = '';
        
        if (currentMode === 'temp') {
            // RENKLENDİRME
            let color = '#fdd835'; 
            if (temp < -10) color = '#81d4fa';      
            else if (temp < 0) color = '#4fc3f7';   
            else if (temp < 10) color = '#66bb6a';  
            else if (temp < 20) color = '#fdd835';  
            else if (temp < 30) color = '#ff7043';  
            else color = '#ff5252';                 

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

        // --- DETAYLI POPUP ---
        el.addEventListener('click', (e) => {
             e.stopPropagation(); 
             
             const popupHTML = `
                <div class="pop-header">${city.n} <span style="font-size:10px; opacity:0.7; display:block">(${timeIndex===0 ? 'CANLI VERİ' : 'TAHMİN'})</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-temperature-half"></i> Sıcaklık</span><span class="pop-val">${Math.round(temp)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-person"></i> Hissedilen</span><span class="pop-val">${Math.round(feelsLike)}°</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-droplet"></i> Nem</span><span class="pop-val">%${humidity}</span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-wind"></i> Rüzgar</span><span class="pop-val">${Math.round(windSpeed)} <small>km/h</small></span></div>
                <div class="pop-row"><span class="pop-label"><i class="fa-solid fa-gauge-high"></i> Basınç</span><span class="pop-val">${Math.round(pressure)} <small>hPa</small></span></div>
                <div class="pop-row" style="margin-top:5px; justify-content:center; color:#aaa; font-size:10px;">${getWeatherDesc(wCode)}</div>
            `;

             new mapboxgl.Popup({offset:25, closeButton:true})
                .setLngLat([city.lon, city.lat])
                .setHTML(popupHTML)
                .addTo(map);
        });

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([city.lon, city.lat])
            .addTo(map);
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
    } else { stopPlay(); }
};

function stopPlay() { 
    isPlaying = false; 
    clearInterval(playInterval); 
    const icon = playBtn.querySelector('i'); 
    icon.classList.remove('fa-pause'); 
    icon.classList.add('fa-play'); 
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
        bar.style.background = "linear-gradient(to right, #81d4fa, #4fc3f7, #66bb6a, #fdd835, #ff7043, #ff5252)"; 
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
    
    window.changeStyle = function(styleKey) {
        const icons = { 'dark': 'fa-moon', 'light': 'fa-sun', 'satellite': 'fa-earth-europe' }; 
        const clickedBtn = document.querySelector(`.style-btn i.${icons[styleKey]}`).parentElement;
        document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active')); 
        clickedBtn.classList.add('active');
        map.setStyle(MAP_STYLES[styleKey]);
    };
}

// 30 dakikada bir güncelle
setInterval(async () => { 
    if (activeCities.length > 0) { 
        // Veri önbelleğini temizleme, sadece üzerine yaz
        await fetchWeatherData(activeCities); 
    } 
    updateMapState(); 
}, 1000 * 60 * 30);