import express from "express";

export interface CustomRequest extends express.Request {
  userId?: string | number;
  cookies: {
    [key: string]: string | undefined;
    auth_token?: string;
  };
}