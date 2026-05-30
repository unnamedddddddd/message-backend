import dotenv from "dotenv";
import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { socketHandler } from './sockets/chat.socket';
import { corsExpress, corsOptions } from './configs/cors.config';
import path from 'path';
import userRoutes from './routes/user.routes'; 

dotenv.config();

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

httpServer.listen(process.env.PORT, () => {
  console.log(`Сервер запущен на порту ${process.env.PORT}`);
});

// ДЛЯ ТЕСТОВ
export { app, io };
