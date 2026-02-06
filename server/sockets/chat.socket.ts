import { Server, Socket } from "socket.io";
import { verifyToken } from "../scripts/jwtTools.ts";
import { pool } from "../config/db.config.ts";
import { error } from "node:console";
import SaveMessage from "../Interfaces/SaveMessageProps.ts";

// ИНТЕРФЕЙС
interface ExtendedSocket extends Socket {
  userId: number | string;
  userName?: string;
  currentRoom?: string | null;
}

// Подключение к БД
pool.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch(err => console.error('Ошибка подключения к БД:', err));

const saveMessages = async ({message, userId, chatName}: SaveMessage) => {
  try {
   await pool.query(
    `INSERT INTO "Messages" (chat_id, user_id, message_text) 
    VALUES (
      (SELECT chat_id FROM "Chats" WHERE chat_name = $1 LIMIT 1), 
      $2, 
      $3
    ) 
    RETURNING message_id`,
    [chatName, userId, message]
   );

  } catch (error) {
    console.error(error);
  }
} 

const getCookie = (cookieHeader: string, name: string): string | undefined  => {
  const match = cookieHeader.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : undefined;
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
      const correctToken = getCookie(cookieToken, 'auth_token')
      if (!correctToken) {
        throw ('cookie не найдена');
      }
      const decoded = verifyToken(correctToken);
      socket.userId = decoded.userId;

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
    console.log(`[${new Date().toLocaleString()}] Подключился пользователь: ${socket.id}`);

    socket.on('join-room', (userData: { roomId: string; userName: string }) => {
      const { roomId, userName } = userData;

      socket.join(roomId);
      socket.userName = userName;
      socket.currentRoom = roomId;

      console.log(`[${new Date().toLocaleString()}] ${userName} вошёл в комнату: ${roomId}`);
    });

    socket.on('leave-room', (userData: { roomId: string; userName: string }) => {
      const { roomId, userName } = userData;

      socket.leave(roomId);
      socket.currentRoom = null;

      console.log(`[${new Date().toLocaleString()}] ${userName} вышел из комнаты: ${roomId}`);
    });

    socket.on('message', (data: { message: Buffer | string; roomId: string, }) => {
      const { message, roomId } = data;

      if (Buffer.isBuffer(message)) {
        console.log('Получено бинарное сообщение');
      } else {
        console.log(`[${new Date().toLocaleString()}] Сообщение от ${socket.userName}: ${message}`);

        socket.to(roomId).emit('message', {
          message,
          userName: socket.userName,
          type: 'chat',
          renderTime: new Date().toISOString()
        });
      }
      saveMessages({message, userId: Number(socket.userId), chatName: roomId});
    });

    socket.on('error', (error) => {
      console.error(`[${new Date().toLocaleString()}] Ошибка сокета ${socket.id}:`, error);
    });

    socket.on('disconnect', () => {
      console.log(`[${new Date().toLocaleString()}] Пользователь отключился: ${socket.id}`);
    });
  });

  io.on('error', (error) => {
    console.error('Ошибка Socket.io:', error);
  });
}
