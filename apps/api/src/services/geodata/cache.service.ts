import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export const cache = {
  async get(key: string) {
    return redis.get(key);
  },
  async setex(key: string, ttlSec: number, value: string) {
    return redis.setex(key, ttlSec, value);
  },
  async incrDailyCounter(counterBase: string) {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${counterBase}:${today}`;
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, 60 * 60 * 24);
    const results = await pipeline.exec();
    // results[0][1] הוא הערך החדש אחרי incr
    const callsToday = (results?.[0]?.[1] as number) || 0;
    return { key, callsToday };
  },
};
