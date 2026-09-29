// src/api/walletService.js
import API from './clients';

export const getWalletBalance = async (userId) => {
  const response = await API.get(`/wallets/${userId}`);
  return response.data;
};

export const topUpWallet = async (userId, amount) => {
  const response = await API.post(`/wallets/${userId}/topup`, { amount });
  return response.data;
};