// src/api/stationService.js
import API from './client';

// Ask the backend for the list of all stations
export const getAllStations = async () => {
  const response = await API.get('/stations');
  return response.data; 
};

// Tell the backend to send a command to a specific station
export const sendCommand = async (stationId, action) => {
  const response = await API.post(`/stations/${stationId}/session-command`, { action });
  return response.data;
};