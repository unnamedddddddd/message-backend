//ДЛЯ SOCKET
const allowedOrigins = [
  'http://localhost:5173',
  'https://message-frontend-u24g.onrender.com'
];

export const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
};

//ДЛЯ EXPRESS
import cors from 'cors';
export const corsExpress = cors(corsOptions);