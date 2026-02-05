import { Router } from 'express';
import { comparePassword, hashPassword } from '../scripts/hashPassword.ts';
import { authMiddleware, authRememberMiddleware, generateToken, generateTokenRemember } from '../scripts/jwtTools.ts';
import { pool } from '../dbCongif.ts';
import { CustomRequest } from '../Interfaces/CustomRequest.ts';

const router = Router(); 

const handleDatabaseError = (error: any, res: any) => {
  console.error('Ошибка БД:', error);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера'
  });
};

// Подключение к БД
pool.connect()
  .then(() => console.log('Подключено к PostgreSQL'))
  .catch(err => console.error('Ошибка подключения к БД:', err));

// API РОУТЫ 
router.post('/api/createUser', async (req, res) => {
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
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/login', async (req, res) => {
  try {
    const { userLogin, userPassword, isRemember } = req.body;

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
      if (isRemember) {
        const tokenRemember = generateTokenRemember(userCheck.rows[0].user_id);

        res.cookie('remember_token', tokenRemember, {
          httpOnly: true,
          secure: false, // ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА true
          sameSite: 'lax',// ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА strict
          maxAge: 360 * 60 * 60 * 1000, // 360 часов
          path: '/'
        })
      }      
      const token = generateToken(userCheck.rows[0].user_id);
      
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: false, // ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА true
        sameSite: 'lax',// ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА strict
        maxAge: 24 * 60 * 60 * 1000, // 24 часа
        path: '/'
      })
      
      

      return res.status(200).json({
        success: true,
        user_id: userCheck.rows[0].user_id,
        message: 'Вход выполнен успешно',
      });
    }
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/logout', async (req, res) => {
  try {
    res.clearCookie('auth_token');
    res.clearCookie('remember_token');

    res.status(200).json({
      success: true,
      message: 'Выход выполнен успешно',
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/verificationTokenRemember', authRememberMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId  = req.userId;
    const userCheck = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Пользователя не существует',
      });
    }

    const token = generateToken(Number(userId))

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: false, // ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА true
      sameSite: 'lax',// ПРИ ДЕПЛОЕ ПОМЕНЯТЬ НА strict
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(200).json({
      success: true,
      user_id: userId,
      message: 'Вход выполнен успешно',
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

router.post('/api/me', authMiddleware, async (req, res) => {
  try {
  const {userId} = req.body;

  const result = await pool.query(
    'SELECT user_login FROM "Users" WHERE user_id = $1', 
  [userId]);

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

router.post('/api/logout', (req, res) => {
  res.clearCookie('auth_token', {
    path: '/',
  });
  
  res.status(200).json({
    success: true,
    message: 'Выход выполнен успешно',
  });
});

router.post('/api/forgotPassword', async (req, res) => {
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
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/:chatId/messages', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;

    const messagesChat = await pool.query(
      'SELECT user_id, message_text, created_at FROM "Messages" WHERE chat_id = $1 ORDER BY created_at DESC',
      [chatId]
    );

    if (messagesChat.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Чат не найден',
      });
    }

    res.json({
      success: true,
      messages: messagesChat.rows
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('api/servers/:serverId/chats',authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { serverId } = req.params;

    const chatsServer = await pool.query(
      'SELECT chat_id, chat_name FROM "Chats" WHERE server_id = $1',
      [serverId]
    )

    if (chatsServer.rows.length === 0) {
        return res.status(404).json({
        success: false,
        message: 'Сервер не найден',
      });
    }

    res.json({
      success: true,
      messages: chatsServer.rows
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

export default router; 
