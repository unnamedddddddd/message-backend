//ДЛЯ SOCKET
const allowedOrigins = [
  'http://localhost:5173',
  'https://message-frontend-kappa.vercel.app',
  'https://message-backend-production-989b.up.railway.app'
];

export const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
};

//ДЛЯ EXPRESS
import cors from 'cors';
export const corsExpress = cors(corsOptions);