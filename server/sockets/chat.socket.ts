import { Server, Socket } from "socket.io";
import { verifyToken } from "../scripts/jwtTools.ts";
import { pool } from "../configs/db.config.ts";
import SaveMessage from "../types/SaveMessageProps.ts";
import { redis } from "../configs/redis.config.ts";
import { encrypt } from "../scripts/encryptionMessages.ts";
import { MongoClient } from "mongodb";
import { clientPromise } from "../configs/mongodb.config.ts";

// ИНТЕРФЕЙС
interface ExtendedSocket extends Socket {
  userId: number | string;
  userName?: string;
  chatType: 'server' | 'personal';
  currentRoom?: string | null;
}

// Подключение к БД
pool.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch(err => console.error('Ошибка подключения к БД:', err));

redis.on('connect', () => {
  console.log('Подключено к Redis');
})

redis.on('error', (error: Error) => {
  console.error('❌ Ошибка Redis:', error);
});

const saveMessages = async ({message, userId, chatId, chatType}: SaveMessage) => {
  const ENCRYPT_SECRET = process.env.ENCRYPT_SECRET;

  if (!ENCRYPT_SECRET) {
    throw new Error("ENCRYPT_SECRET is missing");
  }
  
  if (!message) return;
  if (Buffer.isBuffer(message)) return;

  const encryptedMessage = encrypt(message, ENCRYPT_SECRET);
  console.log(chatId, chatType);
  
  try {
    const client: MongoClient = await clientPromise;
    const messages = client.db('MessangerDB').collection('Messages')
    await messages.insertOne({
      chat_id: Number(chatId),
      message_text: encryptedMessage.content,
      message_type: 'text',
      user_id: userId, 
      chat_type: chatType,
      created_at: new Date().toISOString(),
      iv: encryptedMessage.iv,
      auth_tag: encryptedMessage.tag
    })

  } catch (error) {
    console.error(error);
  }
} 

const getFriends = async(userId: number) => {
  const friends = await pool.query(
    `SELECT 
      f.friend_id
    FROM "Friends" f
    JOIN "Users" u ON f.friend_id = u.user_id
    WHERE f.user_id = $1 
    ORDER BY f.created_at DESC`,
    [userId]
  )
  
  if (friends.rows.length === 0) {
    return [];
  }
  return friends.rows;
}


const getCookie = (cookieHeader: string, name: string): string | undefined  => {
  const match = cookieHeader.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? match[2] : undefined;
}

  const getUserAvatar = async (userName: string | undefined): Promise<string | null> => {
    try {
      const result = await pool.query(
        'SELECT user_avatar FROM "Users" WHERE user_login = $1',
        [userName]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0].user_avatar;
    } catch (error) {
      console.error('Ошибка получения аватара:', error);
      return null;
    }
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
  io.on('connection', async (socketAny: any) => {
    try {
      const socket = socketAny as ExtendedSocket; 
      console.log(`[${new Date().toLocaleString()}] Подключился пользователь: ${socket.id}`);
      
      await redis.setex(`user:${socket.userId}:online`, 30, 'true');
      io.emit('user-status-change', {
        userId: socket.userId,
        status: 'online'
      });

      socket.on('join-room', (userData: { roomId: string; userName: string, chatType: 'server' | 'personal' }) => {
        const { roomId, userName, chatType } = userData;
        console.log(userData);
        
        socket.join(roomId);
        socket.userName = userName;
        socket.currentRoom = roomId;
        socket.chatType = chatType;
        console.log(`[${new Date().toLocaleString()}] ${userName} вошёл в комнату: ${roomId}`);
      });

      socket.on('leave-room', (userData: { roomId: string; userName: string }) => {
        const { roomId, userName } = userData;

        socket.leave(roomId);
        socket.currentRoom = null;

        console.log(`[${new Date().toLocaleString()}] ${userName} вышел из комнаты: ${roomId}`);
      });

      socket.on('message', async (data) => {
        const { message, roomId } = data;

        if (Buffer.isBuffer(message)) {
          console.log('Получено бинарное сообщение');
          return;
        }
        const avatar = await getUserAvatar(socket.userName);
        socket.to(roomId).emit('message', {
          message,
          userName: socket.userName,
          userAvatar: avatar,
          type: 'chat',
          renderTime: new Date().toISOString()
        });

        const chatType = socket.chatType;
        saveMessages({ message, userId: Number(socket.userId), chatId: roomId, chatType});
      });

      socket.on('user-join-voice', ({roomId}) => {
        socket.join(roomId);
        console.log(`[${new Date().toLocaleString()}] ${socket.userName} вошёл в комнату: ${roomId}`);
        socket.to(roomId).emit('user-join-voice', {
          userId: socket.id,
        });
      });

      socket.on('user-left-voice', ({roomId}) => {
        socket.to(roomId).emit('user-left-voice', {
          userId: socket.id,
        });
        socket.leave(roomId);
        console.log(`[${new Date().toLocaleString()}] ${socket.userName} вышел из комнаты: ${roomId}`);
      });

      socket.on('voice-signal', (data) => {
        const { signal, roomId, to } = data;
        
        if (to) {
          socket.to(to).emit('voice-signal', {
            signal,
            from: socket.id,
            userName: socket.userName,
          });
        } else {
          socket.to(roomId).emit('voice-signal', {
            signal,
            userName: socket.userName,
          });
        }
      })

      socket.on('voice-chat-participants', (data) => {
        const { roomId } = data;
        const room = io.sockets.adapter.rooms.get(roomId);
        const participants = room ? Array.from(room).map((socketId) => {
          const clientSocket = io.sockets.sockets.get(socketId) as ExtendedSocket;
          return {
            socketId,
            userId: clientSocket?.userId,
            userName: clientSocket?.userName,
          }
        }) : [];         
        socket.emit('voice-chat-participants', participants);
      });

      socket.on('error', (error) => {
        console.error(`[${new Date().toLocaleString()}] Ошибка сокета ${socket.id}:`, error);
      });

      socket.on('disconnect', async () => {
        if (socket.currentRoom) {
        socket.to(socket.currentRoom).emit('stop-typing', {
            userName: socket.userName,
          })
        }
        await redis.del(`user:${socket.userId}:online`);
        await redis.set(`user:${socket.userId}:last_seen`, new Date().toISOString());
        io.emit('user-status-change', {
          userId: socket.userId,
          status:'offline'
        });
        console.log(`[${new Date().toLocaleString()}] Пользователь отключился: ${socket.id}`);
      });

      socket.on('send-typing', () => {
        if (!socket.currentRoom) {
          return;
        }
        socket.to(socket.currentRoom).emit('send-typing', {
          userName: socket.userName,
        })
      })

      socket.on('stop-typing', () => {
        if (!socket.currentRoom) {
          return;
        }
        socket.to(socket.currentRoom).emit('stop-typing', {
          userName: socket.userName,
        })
      })

      socket.on('ping-online', async () => {
        await redis.setex(`user:${socket.userId}:online`, 30, 'true');
      })

      socket.on('online-users', async () => {
        const friends = await getFriends(Number(socket.userId));
  
        if (friends.length === 0) {
          socket.emit("online-users", []);
          return;
        }
        
        const keys = friends.map(f => `user:${f.friend_id}:online`);
        const values = await redis.mget(...keys); 
        
        const result = friends.map((f, i) => ({
          ...f,
          online: values[i] === 'true',
        }));
        
        socket.emit("online-users", result);
      })

    } catch (error) {
      console.error(`[${new Date().toLocaleString()}]:  ${error}`);
      
    }
  });

  io.on('error', (error) => {
    console.error('Ошибка Socket.io:', error);
  });
}
