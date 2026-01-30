import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express'

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

io.on('connection', (socket) => {
  console.log('User подключился', socket.id);

  socket.on('message', (message: Buffer | string) => {
    if (Buffer.isBuffer(message)) {
      //Обработка фото и т.д
      console.log('buffer');
    } else {
      console.log(`Получено ${message}`)  

      socket.broadcast.emit('message', {
        message,
        senderId: socket.id,
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