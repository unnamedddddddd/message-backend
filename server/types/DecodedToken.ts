import jwt from "jsonwebtoken";

export interface DecodedToken extends jwt.JwtPayload {
  userId: string | number;
}