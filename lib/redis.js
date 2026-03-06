import { Redis } from "@upstash/redis";

let _redis = null;
function r() {
  if (!_redis) _redis = new Redis({
    url:   process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

export async function getRoom(code) {
  const d = await r().get(`room:${code}`);
  if (!d) return null;
  return typeof d === "string" ? JSON.parse(d) : d;
}
export async function saveRoom(code, room) {
  await r().set(`room:${code}`, JSON.stringify(room), { ex: 7200 });
}
