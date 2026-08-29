require('dotenv').config();

module.exports = {
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3050',
    key:     process.env.API_KEY,
  },
  db: {
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME     || 'rer_e_stats',
    dateStrings: true,
  },
  timetable: [
    { label: 'Chelles → Nanterre',  departure: 'stop_area:IDFM:68407',  destination: 'stop_area:IDFM:488087', missions: ['NOCY'] },
    { label: 'Nanterre → Chelles',  departure: 'stop_area:IDFM:488087', destination: 'stop_area:IDFM:68407',  missions: ['CONY'] },
    { label: 'Tournan → Nanterre',  departure: 'stop_area:IDFM:67625',  destination: 'stop_area:IDFM:488087', missions: ['NATU', 'NUTU', 'NOTU'] },
    { label: 'Nanterre → Tournan',  departure: 'stop_area:IDFM:488087', destination: 'stop_area:IDFM:67625',  missions: ['TANU', 'TINU', 'TONU'] },
    { label: 'Villiers → Nanterre', departure: 'stop_area:IDFM:73097',  destination: 'stop_area:IDFM:488087', missions: ['NOVY', 'NOPI'] },
    { label: 'Nanterre → Villiers', departure: 'stop_area:IDFM:488087', destination: 'stop_area:IDFM:73097',  missions: ['VONY', 'VOPI'] },
    { label: 'Magenta → Nanterre',  departure: 'stop_area:IDFM:478733', destination: 'stop_area:IDFM:488087', missions: ['NOMY'] },
    { label: 'Nanterre → Magenta',  departure: 'stop_area:IDFM:488087', destination: 'stop_area:IDFM:478733', missions: ['MONY'] },

    // Travaux — trains détournés via Paris Est (ne desservent pas Nanterre/Magenta)
    { label: 'Paris Est → Tournan',  departure: 'stop_area:IDFM:71359',  destination: 'stop_area:IDFM:67625', missions: ['TAPA', 'TOPU'] },
    { label: 'Tournan → Paris Est',  departure: 'stop_area:IDFM:67625',  destination: 'stop_area:IDFM:71359', missions: ['PAVU'] },
    { label: 'Paris Est → Chelles',  departure: 'stop_area:IDFM:71359',  destination: 'stop_area:IDFM:68407', missions: ['COPI', 'CIPI'] },
    { label: 'Chelles → Paris Est',  departure: 'stop_area:IDFM:68407',  destination: 'stop_area:IDFM:71359', missions: ['POCI'] },
    { label: 'Paris Est → Villiers', departure: 'stop_area:IDFM:71359',  destination: 'stop_area:IDFM:73097', missions: ['VOPE'] },
    { label: 'Villiers → Paris Est', departure: 'stop_area:IDFM:73097',  destination: 'stop_area:IDFM:71359', missions: ['POVE'] },

    // Travaux — trains au départ de Haussmann Saint-Lazare
    { label: 'Haussmann → Tournan',  departure: 'stop_area:IDFM:73688',  destination: 'stop_area:IDFM:67625',  missions: ['TAVA', 'TUVA'] },
    { label: 'Tournan → Haussmann',  departure: 'stop_area:IDFM:67625',  destination: 'stop_area:IDFM:73688',  missions: ['HAVA', 'HUVA'] },
    { label: 'Haussmann → Chelles',  departure: 'stop_area:IDFM:73688',  destination: 'stop_area:IDFM:68407',  missions: ['COHI'] },
    { label: 'Chelles → Haussmann',  departure: 'stop_area:IDFM:68407',  destination: 'stop_area:IDFM:73688',  missions: ['HOCI'] },
    { label: 'Magenta → Villiers',   departure: 'stop_area:IDFM:478733', destination: 'stop_area:IDFM:73097',  missions: ['VONE'] },
    { label: 'Villiers → Magenta',   departure: 'stop_area:IDFM:73097',  destination: 'stop_area:IDFM:478733', missions: ['NOVE'] },
  ],
  scheduler: {
    delayAfterDeparture: 5,
    retryDelays: [10, 10],
    equipmentCallSpacing: 10000,
    detailCallSpacing:    2000,
    detailPerCycle:       2,
    timetableCallSpacing: 6 * 60 * 1000,
  },
};
