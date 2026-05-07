import dotenv from "dotenv";
dotenv.config();

import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: 5432,
  database: 'MessangerDB',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});