import { getRoom, saveRoom } from "../../lib/redis.js";
function freshP() { return { hole:false, yellow:false, red:false, doubleAns:false }; }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { hostName } = req.body;
  if (!hostName) return res.status(400).json({ error: "اكتب اسمك" });
  let code, tries=0;
  do { code = String(Math.floor(1000+Math.random()*9000)); tries++; }
  while (await getRoom(code) && tries<10);
  const room = {
    code, hostName, guestName:null, state:"lobby",
    turn:1, scores:{"1":0,"2":0},
    powersUsed:{"1":freshP(),"2":freshP()},
    activePower:null, gameData:null, catsClient:null,
    doubleInfo:null, currentQ:null, doneBtns:[], events:[],
    timerStart:null, timerSeconds:null, timerPhase:null,
  };
  await saveRoom(code, room);
  res.json({ code });
}
