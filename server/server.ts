import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from './routes/user.routes.ts'; 
import { socketHandler } from './sockets/chat.socket.ts';
import cors from './corsConfig.ts';

const PORT = 3000;
const app = express();
const httpServer = createServer(app);

app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(userRoutes); 
socketHandler(io);   

httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// ДЛЯ ТЕСТОВ
export { app, io };
