import { getRoom } from "../../lib/redis.js";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { code, lastEventId } = req.query;
  if (!code) return res.status(400).json({ error: "كود مطلوب" });
  const room = await getRoom(code);
  if (!room) return res.status(404).json({ error: "الروم انتهى" });
  const lastId = parseFloat(lastEventId||"0");
  const newEvents = (room.events||[]).filter(e => e.id > lastId);
  let timerLeft = null;
  if (room.timerStart && room.timerSeconds) {
    timerLeft = Math.max(0, room.timerSeconds - Math.floor((Date.now()-room.timerStart)/1000));
  }
  const cq = room.currentQ;
  res.json({
    state: room.state, hostName: room.hostName, guestName: room.guestName,
    scores: room.scores, turn: room.turn,
    powersUsed: room.powersUsed, activePower: room.activePower,
    doneBtns: room.doneBtns, catsClient: room.catsClient,
    doubleInfo: room.doubleInfo, timerLeft, timerPhase: room.timerPhase,
    currentQ: cq ? { catIndex:cq.catIndex, qIndex:cq.qIndex, question:cq.question,
      points:cq.points, isDouble:cq.isDouble, phase:cq.phase, owner:cq.owner } : null,
    newEvents,
  });
}
