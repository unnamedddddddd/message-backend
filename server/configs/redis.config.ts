import Redis from 'ioredis';

export const redis = new Redis({
  host: process.env.REDIS_URL,
  port: 6379,
});

