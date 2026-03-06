import { getRoom, saveRoom } from "../../lib/redis.js";
function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), { type, data, id: Date.now()+Math.random() }].slice(-60);
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, guestName } = req.body;
  if (!code||!guestName) return res.status(400).json({ error: "بيانات ناقصة" });
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: "الكود غير صحيح!" });
  if (room.guestName) return res.status(400).json({ error: "الروم ممتلئ!" });
  room.guestName = guestName;
  room.state = "selecting";
  addEv(room, "guest_joined", { guestName });
  await saveRoom(code, room);
  res.json({ ok:true, hostName:room.hostName });
}
