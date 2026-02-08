import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import userRoutes from './routes/user.routes.ts'; 
import { socketHandler } from './sockets/chat.socket.ts';
import { corsExpress, corsOptions } from './configs/cors.config.ts';
import path from 'path';

const PORT = 3000;
const app = express();
const httpServer = createServer(app);

app.use(cookieParser());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, './uploads')));
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
