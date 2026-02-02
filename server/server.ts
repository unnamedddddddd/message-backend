import { Server } from 'socket.io';
import { createServer } from 'http';
import express from 'express'
import { Socket } from "socket.io"
import { Pool } from 'pg';
import cors from 'cors';

interface SocketProps extends Socket{
  userName?: string;
  currentRoom?: string| null;
}

const app = express();
app.use(express.json())
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});


const pool = new Pool({
    host: 'localhost',
    port: 5432, 
    database: 'Message', 
    user: 'postgres',
    password: 'Denis48916080'     
});

pool.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch(err => console.error('Ошибка подключения к БД:', err));

app.post('/api/createUser', async (req, res) => {
  try {
    const {userLogin, userPassword} = req.body;
    
    const findUserByLogin = await pool.query('SELECT user_login FROM "Users" WHERE user_login = $1', [userLogin]);

    if (findUserByLogin.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Логин уже занят',
        message: 'Пользователь с таким логином уже существует',
    });
    }

    const result = await pool.query('INSERT INTO "Users"(user_login, user_password) VALUES($1,$2) RETURNING user_id', [userLogin, userPassword]);

    if (result.rows.length > 0) {
      console.log('Пользователь создан успешно', userLogin);
      
      return res.status(201).json({
        success: true,
        user_id: result.rows[0].user_id,
        message: 'Пользователь создан успешно',
      })
    }
  } catch(error) {
      console.error(error);
      res.status(500).json({
        succees: false,
        message: error,
      })
  }
})

app.post('/api/login', async (req, res) => {
  try {
    const {userLogin, userPassword} = req.body;

    const result = await pool.query('SELECT user_login, user_password FROM "Users" WHERE user_login = $1 and user_password = $2', [userLogin, userPassword])

    if (result.rows.length > 0) {
      return res.status(200).json({
        success: true,
        user_id: result.rows[0].user_id,
        message: 'Вход выполнен успешно',
      })
    }

    return res.status(401).json({
      success: false,
      message: 'Такого пользователя не существует',
    })
  } catch (error) {
      console.error(error);
      res.status(500).json({
        success: false,
        message: error,
      })
    }
})




















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