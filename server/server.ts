import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express'
import { Socket } from "socket.io"

interface SocketProps extends Socket{
  userName?: string;
  currentRoom?: string| null;
}

const app = express();
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

io.on('connection', (socket: SocketProps) => {
  console.log('User подключился', socket.id);

  socket.on('join-room', (userData) => {
    const {roomId, userName} = userData;

    socket.join(roomId);
    socket.userName = userName;
    socket.currentRoom = roomId;
    console.log(`Пользователь ${userName} зашел в ${roomId}`);

  })

   socket.on('leave-room', (userData) => {
    const {roomId, userName} = userData;

    socket.leave(roomId);
    socket.userName = userName;
    socket.currentRoom = null;

    console.log(`Пользователь ${userName} вышел из ${roomId}`);
  })

   socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });

  socket.on('message', (data: {message: Buffer | string, roomId: string}) => {
    const {message, roomId} = data;

    if (Buffer.isBuffer(message)) {
      //Обработка фото и т.д
      console.log('buffer');
    } else {
      console.log(`Получено ${message}`)  

      socket.to(roomId).emit('message', {
        message,
        senderId: socket.userName,
        type: 'chat',
        time: new Date().toISOString()
      });
    }
  })

  socket.on('error', error => {
    console.error(error);
  })
})

io.on('error', error => {
  console.error(error);
})

const PORT = 3000;

httpServer.listen(PORT)