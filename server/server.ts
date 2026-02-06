import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from './routes/user.routes.ts'; 
import { socketHandler } from './sockets/chat.socket.ts';
import { corsExpress, corsOptions } from './config/cors.config.ts';

const PORT = 3000;
const app = express();
const httpServer = createServer(app);

app.use(cookieParser());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(corsExpress);

const io = new Server(httpServer, {
  cors: corsOptions
})

app.use(userRoutes); 
socketHandler(io);   

httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

// ДЛЯ ТЕСТОВ
export { app, io };
