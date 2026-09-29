// src/api/healthService.js
import API from './client';

export const checkServerHealth = async () => {
  const response = await API.get('/health');
  return response.data;
};