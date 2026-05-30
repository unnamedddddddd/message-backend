import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDISHOST,
  port: 6379,
});

