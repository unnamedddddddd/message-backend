import express from "express";

export interface CustomRequest extends express.Request {
  userId?: string | number;
}