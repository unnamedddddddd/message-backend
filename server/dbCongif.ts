import { Pool } from 'pg';

export const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'Message',
  user: 'postgres',
  password: 'Denis48916080'
});