// src/api/reservationService.js
import API from './client';

export const getAllReservations = async () => {
  const response = await API.get('/reservations');
  return response.data;
};

export const createReservation = async (reservationData) => {
  // reservationData includes: stationId, userId, startTime, duration
  const response = await API.post('/reservations', reservationData);
  return response.data;
};

export const cancelReservation = async (reservationId) => {
  const response = await API.delete(`/reservations/${reservationId}`);
  return response.data;
};