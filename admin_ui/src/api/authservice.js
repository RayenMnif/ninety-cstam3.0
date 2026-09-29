// src/api/authService.js
import API from './client';

export const login = async (email, password) => {
  const response = await API.post('/auth/login', { email, password });
  
  // Save the token to the browser if login is successful
  if (response.data.token) {
    localStorage.setItem('accessToken', response.data.token);
  }
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('accessToken');
  window.location.href = '/login'; // Send user back to login page
};

export const getCurrentUser = async () => {
  const response = await API.get('/auth/me');
  return response.data;
};