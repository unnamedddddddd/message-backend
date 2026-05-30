import { Router } from 'express';
import { comparePassword, hashPassword } from '../scripts/hashPassword';
import { authMiddleware, authRememberMiddleware, generateToken, generateTokenRemember } from '../scripts/jwtTools';
import { pool } from '../configs/db.config';
import { CustomRequest } from '../types/CustomRequest';
import { uploadServer, uploadUser } from '../configs/multer.config';
import fs from 'fs';
import DEFAULT_USER_AVATAR from '../configs/userAvatar';
import { sendVerificationEmail } from '../configs/mailer.config';
import { decrypt } from '../scripts/encryptionMessages';
import { clientPromise } from '../configs/mongodb.config';
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
    const { userLogin, userPassword, verifiedEmail } = req.body;

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
      'INSERT INTO "Users" (user_login, user_password, user_email) VALUES ($1, $2, $3) RETURNING user_id',
      [userLogin, hashedPassword, verifiedEmail]
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
    const userId = req.userId;
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

router.get('/api/me', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;

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

router.patch('/api/user/profile', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { userDetails } = req.body;
    const userId = req.userId;

    const checkResult = await pool.query(
      'SELECT * FROM "Users" WHERE user_id = $1',
      [userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    await pool.query(
      `INSERT INTO "Profiles" (user_id, github_href, telegram_href, about_me, status, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      github_href = $2, 
      telegram_href = $3, 
      about_me = $4, 
      status = $5, 
      updated_at = NOW()`,
      [userId, userDetails.github_href, userDetails.telegram_href, userDetails.about_me, userDetails.status]
    )

    return res.status(200).json({
      success: true,
      message: 'Профиль успешно изменен'
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

router.get('/api/user/profile', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT 
      github_href, 
      telegram_href, 
      status, 
      about_me 
    FROM "Profiles" WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: true,
        userProfile: null,
      });
    }

    return res.status(200).json({
      success: true,
      profile: result.rows[0],
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
    const { userId, newUserPassword } = req.body;
    
    const userCheck = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_id = $1',
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    const hashedPassword = await hashPassword(newUserPassword);
    await pool.query(
      'UPDATE "Users" SET user_password = $1 WHERE user_id = $2',
      [hashedPassword, userId]
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

router.get('/api/users/find', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { search } = req.query;

    const users = await pool.query(
      `SELECT user_id, user_login, user_avatar FROM "Users" WHERE user_login ILIKE $1 || '%' `,
      [search]
    )

    if (users.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователи не найдены',
      });
    }

    res.json({
      success: true,
      users: users.rows
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
    }).sort({ created_at: 1 }).toArray();

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

router.patch('/api/users/:userId/profile', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { userDetails } = req.body;

    const checkResult = await pool.query(
      'SELECT * FROM "Users" WHERE user_id = $1',
      [userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    await pool.query(
      `INSERT INTO "Profiles" (user_id, github_href, telegram_href, about_me, status, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      github_href = $2, 
      telegram_href = $3, 
      about_me = $4, 
      status = $5, 
      updated_at = NOW()`,
      [userId, userDetails.github_href, userDetails.telegram_href, userDetails.about_me, userDetails.status]
    )

    return res.status(200).json({
      success: true,

    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

router.get('/api/users/:userId/profile', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT 
      github_href, 
      telegram_href, 
      status, 
      about_me 
    FROM "Profiles" WHERE user_id = $1`,
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
      userProfile: result,
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

router.get('/api/users/profile', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const userId = req.userId;

    const result = await pool.query(
      `SELECT 
      github_href, 
      telegram_href, 
      status, 
      about_me 
    FROM "Profiles" WHERE user_id = $1`,
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
      userProfile: result,
    })
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
})

router.patch('/api/user/profile', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { userDetails } = req.body;
    const userId = req.userId;

    const checkResult = await pool.query(
      'SELECT * FROM "Users" WHERE user_id = $1',
      [userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден',
      });
    }

    await pool.query(
      `INSERT INTO "Profiles" (user_id, github_href, telegram_href, about_me, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         github_href = $2, 
         telegram_href = $3, 
         about_me = $4,   
         status = $5, 
         updated_at = NOW()`,
      [userId, userDetails.github_href, userDetails.telegram_href, userDetails.about_me, userDetails.status]
    );

    return res.status(200).json({
      success: true,
      message: 'Профиль успешно обновлён',
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

router.post('/api/users/confirmEmail', async (req: CustomRequest, res) => {
  try {
    const { userEmail } = req.body;

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

    const verifyCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await pool.query(
      'INSERT INTO "VerificationCode" (code_text, user_email) VALUES ($1, $2)',
      [verifyCode, userEmail]
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

router.post('/api/users/confirmCode', async (req: CustomRequest, res) => {
  try {
    const { userCode, userEmail } = req.body;

    const checkCode = await pool.query(
      'SELECT code_text FROM "VerificationCode" WHERE user_email = $1',
      [userEmail]
    );

    if (checkCode.rows[0].code_text !== userCode) {
      return res.json({
        success: false,
        message: 'Код потверждения не корректный',
      });
    }

    await pool.query('DELETE FROM "VerificationCode" WHERE user_email = $1', [userEmail]);

    return res.json({
      success: true,
      message: 'Почта потверждена',
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/auth/send-reset-code', async (req: CustomRequest, res) => {
  try {
    const { userEmail } = req.body;

    const checkEmail = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_email = $1',
      [userEmail]
    );
    
    if (checkEmail.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Почта не привязана',
      });
    }

    const verifyCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    await pool.query(
      'INSERT INTO "VerificationCode" (code_text, user_email) VALUES ($1, $2)',
      [verifyCode, userEmail]
    );

    sendVerificationEmail(userEmail, verifyCode);

    res.json({
      success: true,
      message: 'Код потверждения отправлен',
    });
  } catch (error) {
    console.error(error);
    handleDatabaseError(error, res);
  }
});

router.post('/api/auth/verify-reset-code', async (req: CustomRequest, res) => {
  try {
    const { userCode } = req.body;
    const { userEmail } = req.body;

    const checkEmail = await pool.query(
      'SELECT user_id FROM "Users" WHERE user_email = $1',
      [userEmail]
    );

    const checkCode = await pool.query(
      'SELECT code_text FROM "VerificationCode" WHERE user_email = $1',
      [userEmail]
    );

    if (checkCode.rows[0].code_text !== userCode) {
      return res.json({
        success: false,
        message: 'Код потверждения не корректный',
      });
    }

    await pool.query('DELETE FROM "VerificationCode" WHERE user_email = $1', [userEmail]);

    return res.json({
      success: true,
      message: 'Почта потверждена',
      userId: checkEmail.rows[0].user_id,
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
      members: members.rows
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

    const existingSubscription = await pool.query(
      `SELECT user_id FROM "Subscriptions" WHERE user_id = $1 AND server_id = $2`,
      [userId, serverId]
    );


    if (existingSubscription.rows.length > 0) {
      return res.json({
        success: false,
        message: 'Вы уже присоединены к этому серверу'
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

router.post('/api/users/:receivedId/invites', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { receivedId } = req.params;
    const userId = req.userId;

    if (Number(receivedId) === userId) {
      return res.json({
        success: false,
        message: 'Нельзя отправить приглашение самому себе'
      });
    }

    const existingFriendship = await pool.query(
      `SELECT user_id FROM "Friends" 
      WHERE (user_id = $1 AND friend_id = $2) 
          OR (user_id = $2 AND friend_id = $1)`,
      [userId, receivedId]
    )

    if (existingFriendship.rows.length > 0) {
      return res.json({
        success: false,
        message: 'Вы уже друзья'
      })
    }

    const existingRequest = await pool.query(
      `SELECT request_id FROM "FriendsRequests" 
      WHERE sender_id = $1 AND receiver_id = $2 
      OR sender_id = $2 AND receiver_id = $1
      LIMIT 1`,
      [userId, receivedId]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Заявка уже отправлена',
      });
    }

    await pool.query('BEGIN');
    try {
      const requestId = await pool.query(
        `INSERT INTO "FriendsRequests" (sender_id, receiver_id)
          VALUES($1, $2) RETURNING request_id` ,
        [userId, receivedId]
      );

      await pool.query(
        `INSERT INTO "Notifications" (user_id, type, reference_id)
          VALUES($1, $2, $3)`,
        [receivedId, 'friend_request', requestId.rows[0].request_id]
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
        u.user_id as friend_id,
        u.user_login AS friend_login,
        u.user_avatar AS friend_avatar
      FROM "Notifications" n
      LEFT JOIN "ServersInvites" si ON n.reference_id = si.invite_id AND n.type = 'invite'
      LEFT JOIN "FriendsRequests" fq ON n.reference_id = fq.request_id AND n.type = 'friend_request'
      LEFT JOIN "Servers" s ON si.server_id = s.server_id
      LEFT JOIN "Users" u ON fq.sender_id = u.user_id AND n.type = 'friend_request'
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

router.patch('/api/friendRequests/:requestId/status', authMiddleware, async (req: CustomRequest, res) => {
  try {
    const { requestId } = req.params;
    const { status, senderId } = req.body;
    const userId = req.userId;

    if (status !== 'accepted' && status !== 'declined') {
      return res.status(400).json({
        success: false,
        message: 'Неверный статус'
      });
    }

    await pool.query(
      'UPDATE "FriendsRequests" SET status = $1, updated_at = NOW() WHERE request_id = $2',
      [status, requestId]
    );

    if (status === 'accepted') {

      await pool.query(
        `INSERT INTO "Friends" (user_id, friend_id) VALUES($1, $2)`,
        [userId, senderId]
      );

      await pool.query(
        `INSERT INTO "Friends" (user_id, friend_id) VALUES($1, $2)`,
        [senderId, userId]
      );
    }

    await pool.query(
      `DELETE FROM "Notifications" WHERE reference_id = $1 and type = $2`,
      [requestId, 'friend_request']
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
    const { firstUserId, secondUserId } = req.body;

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
