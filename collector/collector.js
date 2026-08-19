const axios = require('axios');
const config = require('./config');
const logger = require('./logger');
const { saveUnknownMission } = require('./db');

const headers = { 'X-API-Key': config.api.key };

const KNOWN_MISSIONS = new Set(config.timetable.flatMap(e => e.missions));

async function fetchTimetable(entry, date) {
  const response = await axios.get(`${config.api.baseUrl}/api/transilien/timetable`, {
    headers,
    params: { date, departure: entry.departure, destination: entry.destination },
  });

  const trains = (response.data.trains || []).filter(t => t.line === 'RER_E' && !t.hasSubstitutionBus);

  return trains.map(t => {
    if (!KNOWN_MISSIONS.has(t.mission)) {
      logger.warn(`TIMETABLE | Mission inconnue : ${t.mission} (train ${t.trainNumber}, ${entry.label})`);
      saveUnknownMission(t.mission, entry.label, date).catch(() => {});
    }
    return {
      trainNumber:      t.trainNumber,
      date,
      mission:          t.mission,
      departureStation: t.departureStation,
      departureTime:    t.departureTime.replace(/^\d{4}-\d{2}-\d{2}/, date),
      arrivalStation:   t.arrivalStation,
      arrivalTime:      t.arrivalTime.replace(/^\d{4}-\d{2}-\d{2}/, date),
    };
  });
}

async function fetchEquipment(trainNumber, date) {
  const response = await axios.get(
    `${config.api.baseUrl}/api/transilien/equipment/${trainNumber}/${date}`,
    { headers }
  );
  return response.data.sets || [];
}

async function fetchTrainDetail(trainNumber, date) {
  const response = await axios.get(
    `${config.api.baseUrl}/api/train/${trainNumber}/${date}`,
    { headers }
  );
  return response.data;
}

module.exports = { fetchTimetable, fetchEquipment, fetchTrainDetail };
