import { Server, Socket } from "socket.io";
import { verifyToken } from "../scripts/jwyTools.ts";

// ИНТЕРФЕЙС
interface ExtendedSocket extends Socket {
  userName?: string;
  currentRoom?: string | null;
}

export const socketHandler = (io: Server) => {
  // ПРОМЕЖУТОЧНАЯ ПРОВЕРКА ТОКЕНА
  io.use((socketAny: any, next) => {
    const socket = socketAny as ExtendedSocket; 
    try {
      const cookieToken: string | undefined = socket.handshake.headers.cookie;
      
      if (!cookieToken) {
        console.log(`Socket ${socket.id}: нет токена авторизации`);
        return next(new Error('Токен авторизации отсутствует'));
      }
      const correctToken = cookieToken.split('=');    
      verifyToken(correctToken[1]!);
      next();
    } catch (error: any) {
      console.error(`Socket ${socket.id} auth error:`, error.message);
      
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Токен истек'));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Неверный токен'));
      }
      
      return next(new Error('Ошибка авторизации'));
    }
  });

  //  SOCKET.IO СОБЫТИЯ
  io.on('connection', (socketAny: any) => {
    const socket = socketAny as ExtendedSocket; 
    console.log(`Подключился пользователь: ${socket.id}`);

    socket.on('join-room', (userData: { roomId: string; userName: string }) => {
      const { roomId, userName } = userData;

      socket.join(roomId);
      socket.userName = userName;
      socket.currentRoom = roomId;

      console.log(`${userName} вошёл в комнату: ${roomId}`);
    });

    socket.on('leave-room', (userData: { roomId: string; userName: string }) => {
      const { roomId, userName } = userData;

      socket.leave(roomId);
      socket.currentRoom = null;

      console.log(`${userName} вышел из комнаты: ${roomId}`);
    });

    socket.on('message', (data: { message: Buffer | string; roomId: string }) => {
      const { message, roomId } = data;

      if (Buffer.isBuffer(message)) {
        console.log('Получено бинарное сообщение');
      } else {
        console.log(`Сообщение от ${socket.userName}: ${message}`);

        socket.to(roomId).emit('message', {
          message,
          userName: socket.userName,
          type: 'chat',
          renderTime: new Date().toISOString()
        });
      }
    });

    socket.on('error', (error) => {
      console.error(`Ошибка сокета ${socket.id}:`, error);
    });

    socket.on('disconnect', () => {
      console.log(`Пользователь отключился: ${socket.id}`);
    });
  });

  io.on('error', (error) => {
    console.error('Ошибка Socket.io:', error);
  });
}
