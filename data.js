// TÜRKİYE (81 İL)
const turkeyCities = [
    {n:"Adana",lat:37.00,lon:35.32}, {n:"Adıyaman",lat:37.76,lon:38.28}, {n:"Afyon",lat:38.75,lon:30.54}, {n:"Ağrı",lat:39.72,lon:43.05},
    {n:"Amasya",lat:40.65,lon:35.83}, {n:"Ankara",lat:39.92,lon:32.85}, {n:"Antalya",lat:36.88,lon:30.70}, {n:"Artvin",lat:41.18,lon:41.82},
    {n:"Aydın",lat:37.84,lon:27.84}, {n:"Balıkesir",lat:39.65,lon:27.88}, {n:"Bilecik",lat:40.14,lon:29.98}, {n:"Bingöl",lat:38.88,lon:40.49},
    {n:"Bitlis",lat:38.40,lon:42.10}, {n:"Bolu",lat:40.73,lon:31.60}, {n:"Burdur",lat:37.72,lon:30.29}, {n:"Bursa",lat:40.19,lon:29.06},
    {n:"Çanakkale",lat:40.15,lon:26.41}, {n:"Çankırı",lat:40.60,lon:33.61}, {n:"Çorum",lat:40.54,lon:34.95}, {n:"Denizli",lat:37.78,lon:29.09},
    {n:"Diyarbakır",lat:37.91,lon:40.24}, {n:"Edirne",lat:41.67,lon:26.55}, {n:"Elazığ",lat:38.67,lon:39.22}, {n:"Erzincan",lat:39.74,lon:39.49},
    {n:"Erzurum",lat:39.90,lon:41.27}, {n:"Eskişehir",lat:39.76,lon:30.52}, {n:"Gaziantep",lat:37.06,lon:37.38}, {n:"Giresun",lat:40.91,lon:38.39},
    {n:"Gümüşhane",lat:40.46,lon:39.48}, {n:"Hakkari",lat:37.57,lon:43.74}, {n:"Hatay",lat:36.20,lon:36.16}, {n:"Isparta",lat:37.76,lon:30.55},
    {n:"Mersin",lat:36.81,lon:34.64}, {n:"İstanbul",lat:41.01,lon:28.97}, {n:"İzmir",lat:38.42,lon:27.14}, {n:"Kars",lat:40.60,lon:43.09},
    {n:"Kastamonu",lat:41.37,lon:33.77}, {n:"Kayseri",lat:38.72,lon:35.48}, {n:"Kırklareli",lat:41.73,lon:27.22}, {n:"Kırşehir",lat:39.14,lon:34.16},
    {n:"Kocaeli",lat:40.76,lon:29.94}, {n:"Konya",lat:37.87,lon:32.48}, {n:"Kütahya",lat:39.42,lon:29.98}, {n:"Malatya",lat:38.35,lon:38.31},
    {n:"Manisa",lat:38.63,lon:27.44}, {n:"K.Maraş",lat:37.57,lon:36.93}, {n:"Mardin",lat:37.31,lon:40.74}, {n:"Muğla",lat:37.21,lon:28.36},
    {n:"Muş",lat:38.73,lon:41.49}, {n:"Nevşehir",lat:38.62,lon:34.71}, {n:"Niğde",lat:37.96,lon:34.68}, {n:"Ordu",lat:40.98,lon:37.88},
    {n:"Rize",lat:41.02,lon:40.52}, {n:"Sakarya",lat:40.77,lon:30.39}, {n:"Samsun",lat:41.28,lon:36.33}, {n:"Siirt",lat:37.93,lon:41.94},
    {n:"Sinop",lat:42.02,lon:35.15}, {n:"Sivas",lat:39.75,lon:37.01}, {n:"Tekirdağ",lat:40.97,lon:27.51}, {n:"Tokat",lat:40.32,lon:36.55},
    {n:"Trabzon",lat:41.00,lon:39.72}, {n:"Tunceli",lat:39.10,lon:39.54}, {n:"Şanlıurfa",lat:37.16,lon:38.79}, {n:"Uşak",lat:38.67,lon:29.40},
    {n:"Van",lat:38.50,lon:43.38}, {n:"Yozgat",lat:39.82,lon:34.80}, {n:"Zonguldak",lat:41.45,lon:31.79}, {n:"Aksaray",lat:38.37,lon:34.02},
    {n:"Bayburt",lat:40.26,lon:40.22}, {n:"Karaman",lat:37.18,lon:33.22}, {n:"Kırıkkale",lat:39.84,lon:33.50}, {n:"Batman",lat:37.88,lon:41.13},
    {n:"Şırnak",lat:37.52,lon:42.45}, {n:"Bartın",lat:41.63,lon:32.33}, {n:"Ardahan",lat:41.11,lon:42.70}, {n:"Iğdır",lat:39.92,lon:44.04},
    {n:"Yalova",lat:40.65,lon:29.27}, {n:"Karabük",lat:41.19,lon:32.62}, {n:"Kilis",lat:36.71,lon:37.11}, {n:"Osmaniye",lat:37.07,lon:36.25},
    {n:"Düzce",lat:40.84,lon:31.15}
];

// KOMŞU STRATEJİK NOKTALAR
const neighborCities = [
    {n:"Atina", lat:37.98, lon:23.72, isNeighbor:true}, {n:"Selanik", lat:40.64, lon:22.94, isNeighbor:true},
    {n:"Dedeağaç", lat:40.85, lon:25.87, isNeighbor:true}, {n:"Kavala", lat:40.93, lon:24.40, isNeighbor:true},
    {n:"Larissa", lat:39.63, lon:22.41, isNeighbor:true}, {n:"Girit", lat:35.33, lon:25.14, isNeighbor:true},
    {n:"Sofya", lat:42.69, lon:23.32, isNeighbor:true}, {n:"Filibe", lat:42.13, lon:24.74, isNeighbor:true},
    {n:"Burgas", lat:42.50, lon:27.46, isNeighbor:true}, {n:"Varna", lat:43.21, lon:27.91, isNeighbor:true},
    {n:"Kırcaali", lat:41.63, lon:25.36, isNeighbor:true}, {n:"Bükreş", lat:44.42, lon:26.10, isNeighbor:true},
    {n:"Köstence", lat:44.17, lon:28.63, isNeighbor:true}, {n:"Odessa", lat:46.48, lon:30.72, isNeighbor:true},
    {n:"Sivastopol", lat:44.61, lon:33.52, isNeighbor:true}, {n:"Soçi", lat:43.60, lon:39.73, isNeighbor:true},
    {n:"Krasnodar", lat:45.03, lon:38.97, isNeighbor:true}, {n:"Novorossiysk", lat:44.71, lon:37.76, isNeighbor:true},
    {n:"Batum", lat:41.61, lon:41.63, isNeighbor:true}, {n:"Tiflis", lat:41.71, lon:44.82, isNeighbor:true},
    {n:"Kutaisi", lat:42.26, lon:42.71, isNeighbor:true}, {n:"Bakü", lat:40.40, lon:49.86, isNeighbor:true},
    {n:"Gence", lat:40.68, lon:46.36, isNeighbor:true}, {n:"Erivan", lat:40.18, lon:44.51, isNeighbor:true},
    {n:"Tebriz", lat:38.09, lon:46.29, isNeighbor:true}, {n:"Urumiye", lat:37.55, lon:45.07, isNeighbor:true},
    {n:"Tahran", lat:35.68, lon:51.38, isNeighbor:true}, {n:"Hoy", lat:38.55, lon:44.95, isNeighbor:true},
    {n:"Reşt", lat:37.28, lon:49.58, isNeighbor:true}, {n:"Erbil", lat:36.19, lon:44.00, isNeighbor:true},
    {n:"Musul", lat:36.34, lon:43.13, isNeighbor:true}, {n:"Kerkük", lat:35.47, lon:44.39, isNeighbor:true},
    {n:"Bağdat", lat:33.31, lon:44.36, isNeighbor:true}, {n:"Halep", lat:36.20, lon:37.13, isNeighbor:true},
    {n:"Şam", lat:33.51, lon:36.27, isNeighbor:true}, {n:"Lazkiye", lat:35.53, lon:35.79, isNeighbor:true},
    {n:"Rakka", lat:35.95, lon:39.01, isNeighbor:true}, {n:"Lefkoşa", lat:35.18, lon:33.38, isNeighbor:true},
    {n:"Girne", lat:35.33, lon:33.31, isNeighbor:true}, {n:"Beyrut", lat:33.89, lon:35.50, isNeighbor:true},
    {n:"Tel Aviv", lat:32.08, lon:34.78, isNeighbor:true}
];