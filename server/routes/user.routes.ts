import { Router } from 'express';
import { comparePassword, hashPassword } from '../scripts/hashPassword.ts';
import { authMiddleware, authRememberMiddleware, generateToken, generateTokenRemember } from '../scripts/jwtTools.ts';
import { pool } from '../configs/db.config.ts';
import { CustomRequest } from '../types/CustomRequest.ts';
import { uploadServer, uploadUser } from '../configs/multer.config.ts';
import fs from 'fs';
import DEFAULT_USER_AVATAR from '../configs/userAvatar.ts';
import { sendVerificationEmail } from '../configs/mailer.config.ts';
import { decrypt } from '../scripts/encryptionMessages.ts';
import { clientPromise } from '../configs/mongodb.config.ts';
import { MongoClient } from 'mongodb';
import { count } from 'console';

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
    'SELECT user_login, user_avatar, user_email, is_verified FROM "Users" WHERE user_id = $1', 
    [userId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'Пользователь не найден',
    });
  }

  return res.status(200).json({
    success: true,
    user_login: result.rows[0].user_login,
    user_avatar: result.rows[0].user_avatar,
    user_email: result.rows[0].user_email,
    is_verified: result.rows[0].is_verified,
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

router.get('/api/servers/', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;

    const servers = await pool.query(
      `SELECT 
        s.server_id, 
        s.server_name, 
        s.server_avatar 
      FROM "Subscriptions" sub
      JOIN "Servers" s ON sub.server_id = s.server_id
      WHERE sub.user_id = $1 
      ORDER BY sub.created_at DESC`,
      [userId]
    )
        
    if (servers.rows.length === 0) {
        return res.status(404).json({
        success: false,
        message: 'Сервера не найдены',
      });
    }
    
    res.json({
      success: true,
      servers: servers.rows
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/servers/find', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { search } = req.query;
    
    const servers = await pool.query(
      `SELECT server_id, server_name, server_avatar FROM "Servers" WHERE server_name ILIKE $1 || '%' `,
      [search]
    )
        console.log(servers.rows);
        
    if (servers.rows.length === 0) {
        return res.status(404).json({
        success: false,
        message: 'Сервера не найден',
      });
    }
    
    res.json({
      success: true,
      servers: servers.rows
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/servers/:serverId/chats', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { serverId } = req.params;
    
    const chatsServer = await pool.query(
      'SELECT chat_id, chat_name, chat_type FROM "Chats" WHERE server_id = $1',
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
      chats: chatsServer.rows
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/chats/:chatType/:chatId/messages', async (req, res) => {
  try {
    const ENCRYPT_SECRET = process.env.ENCRYPT_SECRET;

    if (!ENCRYPT_SECRET) {
      throw new Error("ENCRYPT_SECRET is missing");
    }

    const { chatType, chatId } = req.params;
    
    const client: MongoClient = await clientPromise;
    const messagesColl = client.db('MessangerDB').collection('Messages');

    const messages = await messagesColl.find({
      chat_id: Number(chatId),
      chat_type: chatType
    }).sort({created_at: 1}).toArray();
    
    if (messages.length === 0) {
      return res.json({
        success: true,
        messages: [],
        count: 0,
      });
    }
    
    const userIds = [...new Set(messages.map(msg => msg.user_id))];

    const userQuery = await pool.query(
      `SELECT
        user_id,
        user_login,
        user_avatar  
      FROM "Users"
      WHERE user_id = ANY($1::int[])`,
      [userIds]
    );

    const usersMap = new Map();
    userQuery.rows.forEach(user => {
      usersMap.set(user.user_id, {
        user_login: user.user_login,
        user_avatar: user.user_avatar
      })
    })

    const combinedMessages = messages.map(msg => {
      const user = usersMap.get(msg.user_id) 
      
      return {
        _id: msg._id,
        user_id: msg.user_id,
        chat_id: msg.chat_id,
        chat_type: msg.chat_type,
        message_type: msg.message_type,
        created_at: msg.created_at,
        message_text: msg.message_text, 
        iv: msg.iv,
        auth_tag: msg.auth_tag,
        user_login: user.user_login,
        user_avatar: user.user_avatar
      }
    });

    const decryptedMessages = combinedMessages.map(message => {
      let decryptedText;
      
      try {
        decryptedText = decrypt({
          content: message.message_text,
          iv: message.iv,
          tag: message.auth_tag
        }, ENCRYPT_SECRET);
      } catch (error) {
        console.error(`Failed to decrypt message ${message._id}:`, error);
        decryptedText = '[Ошибка расшифровки сообщения]';
      }

      return {
        ...message,
        message_text: decryptedText,
        iv: undefined,
        auth_tag: undefined
      };
    });
            
    res.json({
      success: true,
      messages: decryptedMessages,
      count: decryptedMessages.length,
    });
  
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/users/:userId/avatar', authMiddleware, uploadUser.single('avatar'), async (req: CustomRequest, res) => {
   try {
    if (!req.file) return res.status(400).json({ error: 'Файл не пришел' });
    const userId = req.userId;

    const prevAvatarPath = await pool.query(
      'SELECT user_avatar FROM "Users" WHERE user_id = $1',
      [userId]
    );
    if (prevAvatarPath.rows[0].user_avatar !== 0 && prevAvatarPath.rows[0].user_avatar !== DEFAULT_USER_AVATAR) {
      fs.rmSync(`./${prevAvatarPath.rows[0].user_avatar}`);
    }

    const pathAvatar = `/uploads/UsersAvatars/${req.file.filename}`;

    await pool.query(
      'UPDATE "Users" SET user_avatar = $1 WHERE user_id = $2',
      [pathAvatar, userId]
    )
   res.json({ success: true, avatar: pathAvatar });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

router.post('/api/users/:userId/confirmEmail', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;
    const { userEmail } = req.body;

    const checkUser = await pool.query(
      'SELECT user_login FROM "Users" WHERE user_id = $1', 
      [userId]
    );

    if (checkUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    const checkEmail = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_email = $1', 
      [userEmail]
    );

    if (checkEmail.rows.length !== 0) {
      return res.status(404).json({
        success: false,
        message: 'Эта почта привязана к другому аккаунту',
      });
    }

    await pool.query('DELETE FROM "VerificationCode" WHERE user_id = $1', [userId]);

    const verifyCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await pool.query(
      'INSERT INTO "VerificationCode" (code_text, user_id) VALUES ($1, $2)',
      [verifyCode, userId]
    );

    await pool.query(
      'UPDATE "Users" SET user_email = $1 WHERE user_id = $2',
      [userEmail, userId]
    );

    sendVerificationEmail(userEmail, verifyCode);

    res.json({ 
      userEmail,
      success: true,  
      message: 'Код потверждения отправлен',
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});  

router.post('/api/users/:userId/confirmCode', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;
    const { userCode } = req.body;
    
    const result = await pool.query(
      'SELECT user_login, user_avatar FROM "Users" WHERE user_id = $1', 
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }
  
    const checkCode = await pool.query(
      'SELECT code_text FROM "VerificationCode" WHERE user_id = $1', 
      [userId]
    );

  
    if (checkCode.rows[0].code_text !== userCode) {
      return res.json({ 
      success: false,  
      message: 'Код потверждения не корректный',
    });
    }

    await pool.query(
      'UPDATE "Users" SET is_verified = true WHERE user_id = $1',
      [userId]
    )

    await pool.query('DELETE FROM "VerificationCode" WHERE user_id = $1', [userId]);    

    return res.json({ 
      success: true,  
      message: 'Почта потверждена',
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/servers/createServer', uploadServer.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не пришел' });
    const { user_id, server_name } = req.body;
    const pathAvatar = `/uploads/ServersAvatars/${req.file.filename}`;    
    
    const resultServer = await pool.query(
      'INSERT INTO "Servers" (server_name, server_avatar, admin_id) VALUES($1, $2, $3) RETURNING server_id',
      [server_name, pathAvatar, user_id]
    )
    await pool.query(
      'INSERT INTO "Subscriptions" (server_id, user_id) VALUES($1, $2)',
      [resultServer.rows[0].server_id, user_id]
    )

    res.json({ 
      success: true, 
      message: 'Сервер успешно создан'
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }  
})

router.post('/api/servers/:serverId/chats/:chatName', authMiddleware, async (req, res) => {
  try {
    const { chatType } = req.body;
    const { serverId, chatName } = req.params;
    console.log(chatType, serverId, chatName);
    
    await pool.query(
      'INSERT INTO "Chats" (chat_name, chat_type, server_id) VALUES($1, $2, $3)',
      [chatName, chatType, serverId]
    )
  
    res.json({ 
      success: true, 
      message: 'Чат успешно создан'
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }  
})

router.get('/api/me/friends', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId
    const friends = await pool.query(
        `SELECT 
        f.id,
        f.friend_id,
        u.user_login, 
        u.user_avatar, 
        f.created_at 
      FROM "Friends" f
      JOIN "Users" u ON f.friend_id = u.user_id
      WHERE f.user_id = $1 
      ORDER BY f.created_at DESC`,
      [userId]
    )
    
    if (friends.rows.length === 0) {
        return res.status(404).json({
        success: false,
        message: 'Друг не найден',
      });
    }
    
    res.json({
      success: true,
      friends: friends.rows
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/servers/:serverId/members', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { serverId } = req.params;
    
    const members = await pool.query(
        `SELECT 
        u.user_id,
        u.user_login, 
        u.user_avatar
      FROM "Subscriptions" s
      JOIN "Users" u ON s.user_id = u.user_id
      WHERE s.server_id = $1`,
      [serverId]
    )
    if (members.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Участники не найдены',
      });
    }
    
    res.json({
      success: true,
      members : members.rows
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/servers/:serverId/invites', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { serverId } = req.params;
    const userId = req.userId;
    
    const includesServer = await pool.query(
      `SELECT user_id FROM "Subscriptions" WHERE user_id = $1 AND server_id = $2`,
      [userId, serverId]
    );
    
console.log('rows:', includesServer.rows);
console.log('length:', includesServer.rows.length);
console.log('rowCount:', includesServer.rowCount);
    
    if (includesServer.rows.length > 0) {
      return res.json({
        success: false,
        message: 'Вы уже присоединины к этому серверу'
      })
    }
    
    const adminId = await pool.query(
      `SELECT admin_id FROM "Servers" WHERE server_id = $1`,
      [serverId]
    );
  
    if (adminId.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Админ не найден',
      });
    }
    await pool.query('BEGIN');
    try {
      const invitesId = await pool.query(
        `INSERT INTO "ServersInvites" (server_id, admin_id, sender_id)
          VALUES($1, $2, $3) RETURNING invite_id` ,
        [serverId, adminId.rows[0].admin_id, userId]
      );
      console.log(adminId.rows[0].admin_id);
      
      await pool.query(
        `INSERT INTO "Notifications" (user_id, type, reference_id)
          VALUES($1, $2, $3)`,
        [adminId.rows[0].admin_id, 'invite', invitesId.rows[0].invite_id]
      );
      await pool.query('COMMIT');
    } catch (e) {
      await pool.query('ROLLBACK');
      throw e;
    }
    res.json({
      success: true,
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.get('/api/notifications', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;

    const notifications = await pool.query(
      `SELECT 
        n.notification_id,
        n.type AS notification_type,
        n.created_at,
        n.reference_id,
        s.server_id,
        s.server_name,
        s.server_avatar,
        si.sender_id,
        sender.user_id as sender_id, 
        sender.user_login as sender_login,
        u.user_login AS friend_login,
        u.user_avatar AS friend_avatar
      FROM "Notifications" n
      LEFT JOIN "ServersInvites" si ON n.reference_id = si.invite_id AND n.type = 'invite'
      LEFT JOIN "Servers" s ON si.server_id = s.server_id
      LEFT JOIN "Users" u ON n.reference_id = u.user_id AND n.type = 'friend_request'
      LEFT JOIN "Users" sender ON si.sender_id = sender.user_id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC`,
      [userId]
    );
    
    res.json({
      success: true,
      notifications: notifications.rows
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.patch('/api/invites/:inviteId/status', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { inviteId } = req.params;
    const { status, serverId, senderId } = req.body;

    if (status !== 'accepted' && status !== 'declined') {
      return res.status(400).json({
        success: false,
        message: 'Неверный статус'
      });
    }
    
    await pool.query(
     'UPDATE "ServersInvites" SET status = $1 WHERE invite_id = $2',
     [status, inviteId]
    );
    
    if (status === 'accepted') {
      await pool.query(
        `INSERT INTO "Subscriptions" (server_id, user_id) VALUES($1, $2)`,
        [serverId, senderId]
      );  
    }
    
    await pool.query(
      `DELETE FROM "Notifications" WHERE reference_id = $1 and type = $2`,
      [inviteId, 'invite']
    );
    
    res.json({
      success: true,
    })
  } catch (error) { 
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/personal-chat/get-or-create', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const {firstUserId, secondUserId} = req.body;

    const result = await pool.query(
      `INSERT INTO "PersonalChats" (user_id_first, user_id_second)
       VALUES ($1, $2)
       ON CONFLICT (user_id_first, user_id_second)
       DO UPDATE SET user_id_first = EXCLUDED.user_id_first
       RETURNING personal_chat_id`,
      [firstUserId, secondUserId]
    );

    const chatId = result.rows[0].personal_chat_id;

    res.json({ chatId, success: true });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

export default router; 
