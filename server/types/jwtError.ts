export interface JWTError extends Error {
  name: 'TokenExpiredError' | 'JsonWebTokenError' | 'NotBeforeError';
  message: string;
  expiredAt?: Date;
  date?: Date;
}
