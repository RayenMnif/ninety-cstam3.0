// src/api/tariffService.js
import API from './client';

export const getPricingRates = async () => {
  const response = await API.get('/tariff');
  return response.data;
};

export const updatePricingRate = async (tariffId, newRateData) => {
  const response = await API.put(`/tariff/${tariffId}`, newRateData);
  return response.data;
};