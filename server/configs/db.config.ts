import dotenv from "dotenv";
dotenv.config();

import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.DB_USER,
  password: process.env.PGPASSWORD,
});