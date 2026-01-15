
const globalCities = [
    // --- TÜRKİYE & AZERBAYCAN ---
    {n:"İstanbul", lat:41.01, lon:28.97}, 
    {n:"Ankara", lat:39.92, lon:32.85}, 
    {n:"İzmir", lat:38.42, lon:27.14},
    {n:"Bakü", lat:40.40, lon:49.86},

    // --- AVRUPA ---
    {n:"Londra", lat:51.50, lon:-0.12},
    {n:"Paris", lat:48.85, lon:2.35}, 
    {n:"Berlin", lat:52.52, lon:13.40}, 
    {n:"Moskova", lat:55.75, lon:37.61},
    {n:"Roma", lat:41.90, lon:12.49},
    {n:"Madrid", lat:40.41, lon:-3.70}, 
    {n:"Amsterdam", lat:52.36, lon:4.90}, 
    {n:"Atina", lat:37.98, lon:23.72},
    {n:"Kiev", lat:50.45, lon:30.52},
    {n:"Viyana", lat:48.20, lon:16.37},
    {n:"Oslo", lat:59.91, lon:10.75},
    {n:"St. Petersburg", lat:59.93, lon:30.33},

    // --- AMERİKA (Kuzey & Güney) ---
    {n:"New York", lat:40.71, lon:-74.00}, 
    {n:"Los Angeles", lat:34.05, lon:-118.24}, 
    {n:"Toronto", lat:43.65, lon:-79.38},
    {n:"Mexico City", lat:19.43, lon:-99.13},
    {n:"Rio de Janeiro", lat:-22.90, lon:-43.17}, 
    {n:"Buenos Aires", lat:-34.60, lon:-58.38},
    {n:"Santiago", lat:-33.44, lon:-70.66},
    {n:"Bogota", lat:4.71, lon:-74.07},

    // --- ASYA & ORTADOĞU ---
    {n:"Tokyo", lat:35.68, lon:139.69}, 
    {n:"Pekin", lat:39.90, lon:116.40}, 
    {n:"Seul", lat:37.56, lon:126.97},
    {n:"Dubai", lat:25.20, lon:55.27},
    {n:"Riyad", lat:24.71, lon:46.67}, 
    {n:"Tahran", lat:35.68, lon:51.38},
    {n:"Bağdat", lat:33.31, lon:44.36}, 
    {n:"Delhi", lat:28.61, lon:77.20},
    {n:"Bangkok", lat:13.75, lon:100.50}, 
    {n:"Singapur", lat:1.35, lon:103.81},
    {n:"Cakarta", lat:-6.20, lon:106.84},

    // --- AFRİKA & OKYANUSYA ---
    {n:"Kahire", lat:30.04, lon:31.23},
    {n:"Cape Town", lat:-33.92, lon:18.42}, 
    {n:"Lagos", lat:6.52, lon:3.37},
    {n:"Nairobi", lat:-1.29, lon:36.82},
    {n:"Sidney", lat:-33.86, lon:151.20}, 
    {n:"Melbourne", lat:-37.81, lon:144.96},
    {n:"Auckland", lat:-36.84, lon:174.76}
];

// app.js ile uyumluluk
const allCities = [...globalCities];