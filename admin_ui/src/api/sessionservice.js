// src/api/sessionService.js
import API from './client';

export const getActiveSessions = async () => {
  const response = await API.get('/sessions');
  return response.data;
};

export const endSession = async (sessionId) => {
  const response = await API.post(`/sessions/${sessionId}/end`);
  return response.data;
};