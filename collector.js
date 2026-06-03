const axios = require('axios');
const config = require('./config');

const headers = { 'X-API-Key': config.api.key };

async function fetchTimetable(entry, date) {
  const response = await axios.get(`${config.api.baseUrl}/api/transilien/timetable`, {
    headers,
    params: { date, departure: entry.departure, destination: entry.destination },
  });

  const trains = response.data.trains || [];

  return trains
    .filter(t => entry.missions.includes(t.mission))
    .map(t => ({
      trainNumber:      t.trainNumber,
      date:             t.departureTime.substring(0, 10),
      mission:          t.mission,
      departureStation: t.departureStation,
      departureTime:    t.departureTime,
      arrivalStation:   t.arrivalStation,
      arrivalTime:      t.arrivalTime,
    }));
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
    `${config.api.baseUrl}/api/train/detail/${trainNumber}/${date}`,
    { headers }
  );
  return response.data;
}

module.exports = { fetchTimetable, fetchEquipment, fetchTrainDetail };
