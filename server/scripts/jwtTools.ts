import dotenv from "dotenv";
dotenv.config();

import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { CustomRequest } from '../types/CustomRequest.ts';
import type { JWTError } from '../types/jwtError.ts';
import type { DecodedToken } from '../types/DecodedToken.ts';

const JWT_SECRET = process.env.JWT_SECRET; // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ
const JWT_SECRET_REMEMBER = process.env.JWT_SECRET_REMEMBER; // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ

//ГЕНЕРАЦИЯ ТОКЕНА
export const generateToken = (userId: number) => {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in .env");
  }

  return jwt.sign(
    {userId},
    JWT_SECRET, // СДЕЛАТЬ proccess.env ПРИ ДЕПЛОЕ
    {expiresIn: '24h'}
  )
}
// ГЕНЕРАЦИЯ ТОКЕНА ДЛЯ ЗАПОМНИТЬ ПОЛЬЗОВАТЕЛЯ
export const generateTokenRemember = (userId: number) => {
  if (!JWT_SECRET_REMEMBER) {
    throw new Error("JWT_SECRET is not defined in .env");
  }
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
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in .env");
    }
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;
    return decoded;
  } catch (error) {
    throw error; 
  }
};

// ПРОМЕЖУТОЧНАЯ ПРОВЕРКА ТОКЕНА
export const authMiddleware = (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET is not defined in .env");
    }
    const token = req.cookies?.auth_token;
    
    if (!token) {
      return res.status(401).json({
        success: false, 
        message: 'Токен авторизации не предоставлен'
      });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as DecodedToken;

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

export const authRememberMiddleware = (req: CustomRequest, res: Response, next: NextFunction) => {
  try {
    if (!JWT_SECRET_REMEMBER) {
      throw new Error("JWT_SECRET is not defined in .env");
    }
    const tokenRemember = req.cookies?.remember_token;
    
    if (!tokenRemember) {
      return res.status(401).json({
        success: false, 
        message: 'Токен авторизации не предоставлен'
      });
    }
    
    const decoded = jwt.verify(tokenRemember, JWT_SECRET_REMEMBER) as DecodedToken;

    req.userId = decoded.userId;
    next();
  } catch (error: unknown)  {
      if (isJWTError(error)) {
        if (error.name === 'TokenExpiredError') {
          console.error('Ошибка authRememberMiddleware:', error);
          res.clearCookie('auth_token');
          res.status(401).json({
            success: false, 
            message: `Токен истёк ${error.expiredAt ? error.expiredAt.toLocaleString() : ''}`
          });
          return;
      }
      if (error.name === 'JsonWebTokenError') {
        console.error('Ошибка authRememberMiddleware:', error);
        res.clearCookie('auth_token');
        res.status(403).json({
          success: false,
          message: `Недействительный токен: ${error.message}`
        });
        return;
      }
    }
  
    console.error('Ошибка authRememberMiddleware:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
    });
  }
}

