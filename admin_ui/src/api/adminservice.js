// src/api/adminService.js
import API from './client';

export const getBannedUsers = async () => {
  const response = await API.get('/admin/bans');
  return response.data;
};

export const banUser = async (userId, reason) => {
  const response = await API.post('/admin/ban', { userId, reason });
  return response.data;
};

export const unbanUser = async (userId) => {
  const response = await API.post(`/admin/unban/${userId}`);
  return response.data;
};