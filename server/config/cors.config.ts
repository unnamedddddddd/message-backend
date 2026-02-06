//ДЛЯ SOCKET
export const corsOptions = {
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

//ДЛЯ EXPRESS
import cors from 'cors';
export const corsExpress = cors(corsOptions);