import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { CustomRequest } from '../Interfaces/CustomRequest.ts';
import type { JWTError } from '../Interfaces/jwtError.ts';
import type { DecodedToken } from '../Interfaces/DecodedToken.ts';

const JWT_SECRET ='lrIHwRP@9#WYzj2_ejYZHFcHNX_uD+JW'; // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ
const JWT_SECRET_REMEMBER ='lrFHwRP@)xfgn(b3_ejYFFFcsfW_gf+ghh'; // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ

//ГЕНЕРАЦИЯ ТОКЕНА
export const generateToken = (userId: number) => {
 return jwt.sign(
    {userId},
    JWT_SECRET, // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ
    {expiresIn: '24h'}
  )
}
// ГЕНЕРАЦИЯ ТОКЕНА ДЛЯ ЗАПОМНИТЬ ПОЛЬЗОВАТЕЛЯ (ПОТОМ ТОЖЕ ЧЕРЕЗ cookies)
export const generateTokenRemember = (userId: number) => {
 return jwt.sign(
    {userId},
    JWT_SECRET_REMEMBER, // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ
    {expiresIn: '360h'}
  )
}
// ПРОВЕРКА ТИПА ОШИБКИ
const isJWTError = (error: unknown): error is JWTError => {
  return error instanceof Error && (
    error.name === 'TokenExpiredError' ||
    error.name === 'JsonWebTokenError' || 
    error.name === 'NotBeforeError'
  );
};

//ПРОВЕРКА ТОКЕНА
export const verifyToken = (token: string): DecodedToken => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    return decoded;
  } catch (error) {
    throw error; 
  }
};

// ПРОМЕЖУТОЧНАЯ ПРОВЕРКА ТОКЕНА
export const authMiddleware = (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.auth_token;
    if (!token) {
      return res.status(401).json({
        success: false, 
        message: 'Токен авторизации не предоставлен'
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as DecodedToken;

    req.userId = decoded.userId;
    next();
  } catch (error: unknown)  {
      if (isJWTError(error)) {
        if (error.name === 'TokenExpiredError') {
          console.error('Ошибка authMiddleware:', error);
          res.clearCookie('auth_token');
          res.status(401).json({
            success: false, 
            message: `Токен истёк ${error.expiredAt ? error.expiredAt.toLocaleString() : ''}`
          });
          return;
      }
      if (error.name === 'JsonWebTokenError') {
        console.error('Ошибка authMiddleware:', error);
        res.clearCookie('auth_token');
        res.status(403).json({
          success: false,
          message: `Недействительный токен: ${error.message}`
        });
        return;
      }
    }
  
    console.error('Ошибка authMiddleware:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
}


