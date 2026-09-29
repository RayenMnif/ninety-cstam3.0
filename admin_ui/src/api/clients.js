
import axios from 'axios';

// Create a master configuration
const API = axios.create({
  baseURL: 'http://localhost:3000/api', // The address of your Fastify backend
});

// Automatically attach the login token if it exists
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;