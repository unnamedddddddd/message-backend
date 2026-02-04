import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import express from 'express';
import { Pool } from 'pg';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { comparePassword, hashPassword } from './scripts/hashPassword.ts';
import { authMiddleware, generateToken, verifyToken } from './scripts/jwyTools.ts';

// ИНТЕРФЕЙСЫ 
interface ExtendedSocket extends Socket {
  userName?: string;
  currentRoom?: string | null;
}
// ПОРТЫ
const PORT = 3000;

// ИНИЦИАЛИЗАЦИЯ 
const app = express();
const httpServer = createServer(app);

// MIDDLEWARE 
app.use(cookieParser());
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// SOCKET.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

io.use((socket: ExtendedSocket, next) => {
  try{
    const cookieToken: string | undefined = socket.handshake.headers.cookie;
    
    if (!cookieToken) {
      console.log(`Socket ${socket.id}: нет токена авторизации`);
      return next(new Error('Токен авторизации отсутствует'));
    }
    const correctToken = cookieToken.split('=')    
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

//  БАЗА ДАННЫХ 
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'Message',
  user: 'postgres',
  password: 'Denis48916080'
});

// Подключение к БД
pool.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch(err => console.error('Ошибка подключения к БД:', err));

const handleDatabaseError = (error: any, res: any) => {
  console.error('Ошибка БД:', error);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера'
  });
};

// API РОУТЫ 
app.post('/api/createUser', async (req, res) => {
  try {
    const { userLogin, userPassword } = req.body;

    const userCheck = await pool.query(
      'SELECT user_login FROM "Users" WHERE user_login = $1',
      [userLogin]
    );

    if (userCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Логин уже занят',
        message: 'Пользователь с таким логином уже существует',
      });
    }
    const hashedPassword = await hashPassword(userPassword);
    
    const result = await pool.query(
      'INSERT INTO "Users" (user_login, user_password) VALUES ($1, $2) RETURNING user_id',
      [userLogin, hashedPassword]
    );

    if (result.rows.length > 0) {
      console.log(`Пользователь создан: ${userLogin}`);
      
      return res.status(201).json({
        success: true,
        user_id: result.rows[0].user_id,
        message: 'Пользователь создан успешно',
      });
    }

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { userLogin, userPassword } = req.body;

    const userCheck = await pool.query(
      'SELECT user_id, user_password FROM "Users" WHERE user_login = $1',
      [userLogin]
    );

    if (userCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Неверный логин или пароль',
      });
    }
    const isPasswordCorrect = await comparePassword(userPassword, userCheck.rows[0].user_password)
    if (isPasswordCorrect) {
      const token = generateToken(userCheck.rows[0].user_id);
      console.log(token);
      
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: false, // ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА true
        sameSite: 'lax',// ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА strict
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
      })

      return res.status(200).json({
        success: true,
        user_id: userCheck.rows[0].user_id,
        message: 'Вход выполнен успешно',
      });
    }
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post('/api/me', authMiddleware, async (req, res) => {
  try {
  const {userId} = req.body();

  const result = await pool.query('SELECT user_login FROM Users WHERE user_id = $1', [userId]);
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Пользователь не найден',
    });
  }

  return res.status(200).json({
    success: true,
    userLogin: result.rows[0].user_login,
  })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token', {
    path: '/',
  });
  
  res.status(200).json({
    success: true,
    message: 'Выход выполнен успешно',
  });
});

app.post('/api/forgotPassword', async (req, res) => {
  try {
    const { userLogin, newUserPassword } = req.body;

    const userCheck = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_login = $1',
      [userLogin]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    await pool.query(
      'UPDATE "Users" SET user_password = $1 WHERE user_login = $2',
      [newUserPassword, userLogin]
    );

    return res.status(200).json({
      success: true,
      user_id: userCheck.rows[0].user_id,
      message: 'Пароль успешно изменён',
    });

  } catch (error) {
    handleDatabaseError(error, res);
  }
});

//  SOCKET.IO СОБЫТИЯ
io.on('connection', (socket: ExtendedSocket) => {
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
      // Обработка файлов/изображений
    } else {
      console.log(`Сообщение от ${socket.userName}: ${message}`);

      socket.to(roomId).emit('message', {
        message,
        senderId: socket.userName,
        type: 'chat',
        time: new Date().toISOString()
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

httpServer.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
});

// ДЛЯ ТЕСТОВ
export { app, io, pool };