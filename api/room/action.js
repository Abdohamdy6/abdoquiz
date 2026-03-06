import { getRoom, saveRoom } from "../../lib/redis.js";
import { judgeAnswer } from "../../lib/ai.js";

function addEv(room, type, data={}) {
  room.events = [...(room.events||[]), {type,data,id:Date.now()+Math.random()}].slice(-60);
}
function freshP() { return {hole:false,yellow:false,red:false,doubleAns:false}; }

function endQuestion(room, winner, pts) {
  const cq = room.currentQ;
  const ap = room.activePower;
  if (winner && pts > 0) {
    const wk = String(winner);
    room.scores[wk] = (room.scores[wk]||0) + pts;
    if (ap?.type==="hole" && String(ap.team)===wk) {
      const lk = wk==="1"?"2":"1";
      const base = (cq?.basePts||0) * (cq?.isDouble?2:1);
      room.scores[lk] = (room.scores[lk]||0) - base;
    }
  }
  if (cq) {
    const bid = `${cq.catIndex}-${cq.qIndex}`;
    if (!room.doneBtns.includes(bid)) room.doneBtns.push(bid);
  }
  room.turn        = room.turn===1?2:1;
  room.activePower = null;
  room.timerStart  = room.timerSeconds = room.timerPhase = null;
  addEv(room, "question_ended", {
    winner, pts, correctAnswer: cq?.answer||"",
    doneBtns: room.doneBtns, scores: room.scores, turn: room.turn,
  });
  room.currentQ = null;
  const total = (room.gameData||[]).reduce((s,c)=>s+c.questions.length,0)||36;
  if (room.doneBtns.length >= total) {
    room.state = "ended";
    const s = room.scores;
    const w = s["1"]>s["2"]?1:s["2"]>s["1"]?2:0;
    addEv(room,"game_over",{winner:w,scores:s,hostName:room.hostName,guestName:room.guestName});
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code, playerNum, action, payload={} } = req.body;
  if (!code||!playerNum||!action) return res.status(400).json({error:"بيانات ناقصة"});

  const room = await getRoom(code);
  if (!room) return res.status(404).json({error:"الروم مش موجود"});

  const pStr  = String(playerNum);
  const other = pStr==="1"?"2":"1";
  const isMyTurn = room.turn===playerNum;

  // ── use_power_pre ─────────────────────────────
  if (action==="use_power_pre") {
    const {type} = payload;
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    if (room.powersUsed[pStr][type]) return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.activePower) return res.status(400).json({error:"هناك خاصية مفعّلة!"});
    room.powersUsed[pStr][type]=true;
    room.activePower={team:playerNum,type};
    addEv(room,`power_pre_${pStr}`,{type});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── open_question ──────────────────────────────
  if (action==="open_question") {
    const {catIndex,qIndex} = payload;
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    const bid=`${catIndex}-${qIndex}`;
    if (room.doneBtns.includes(bid)) return res.status(400).json({error:"سؤال اتجاوب قبل كده"});
    const q        = room.gameData[catIndex].questions[qIndex];
    const di       = room.doubleInfo;
    const isDouble = di.catIndex===catIndex && di.qIndex===qIndex;
    const pts      = q.points*(isDouble?2:1);
    room.currentQ  = {
      catIndex,qIndex,question:q.q,answer:q.a,
      points:pts,basePts:q.points,isDouble,phase:"pre",owner:playerNum,
      pendingWinner:null,pendingPts:0,
    };
    addEv(room,"question_opened",{catIndex,qIndex,question:q.q,points:pts,isDouble,owner:playerNum});
    if (isDouble) addEv(room,"double_revealed",{});
    addEv(room,`can_use_red_${other}`,{can:!room.powersUsed[other].red});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── use_power_red ─────────────────────────────
  if (action==="use_power_red") {
    if (isMyTurn) return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].red) return res.status(400).json({error:"استخدمتها قبل!"});
    if (room.currentQ?.phase!=="pre") return res.status(400).json({error:"وقتها فات!"});
    room.powersUsed[pStr].red=true;
    room.activePower={team:playerNum,type:"red"};
    room.currentQ.points=Math.floor(room.currentQ.points/2);
    addEv(room,"red_card_played",{by:pStr,newPoints:room.currentQ.points});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── start_timer ───────────────────────────────
  if (action==="start_timer") {
    if (!isMyTurn) return res.status(403).json({error:"مش دورك!"});
    if (room.currentQ?.phase!=="pre") return res.status(400).json({error:"مش وقته!"});
    room.currentQ.phase="playing";
    room.timerStart=Date.now(); room.timerSeconds=60; room.timerPhase="main";
    addEv(room,"timer_started",{seconds:60,team:playerNum});
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── submit_answer ─────────────────────────────
  if (action==="submit_answer") {
    const {answer} = payload;
    const cq = room.currentQ;
    if (!cq) return res.status(400).json({error:"مفيش سؤال مفتوح"});
    const ownerStr = String(cq.owner);
    const phase    = cq.phase;
    if (phase==="playing"    && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});
    if (phase==="pass"       && pStr!==other)    return res.status(403).json({error:"مش دورك!"});
    if (phase==="double_ans" && pStr!==ownerStr) return res.status(403).json({error:"مش دورك!"});
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    addEv(room,"answer_submitted",{by:playerNum});
    await saveRoom(code,room);

    // Judge (async — reload room after)
    const correct = await judgeAnswer(cq.question, cq.answer, answer);
    const pts = correct?cq.points:0;
    const room2 = await getRoom(code);
    if (!room2?.currentQ) return res.json({ok:true});
    const ap = room2.activePower;

    // doubleAns second chance
    if (!correct && phase==="playing" && ap?.type==="doubleAns" && String(ap.team)===ownerStr) {
      room2.currentQ.phase="double_ans";
      addEv(room2,`wrong_try_double_ans_${ownerStr}`,{question:cq.question});
      addEv(room2,`opponent_wrong_double_${other}`,{});
      await saveRoom(code,room2); return res.json({ok:true});
    }

    addEv(room2,"answer_revealed",{correct,correctAnswer:cq.answer,givenAnswer:answer,by:playerNum,pts});

    if (correct) {
      const canY = !room2.powersUsed[other].yellow;
      if (canY) {
        room2.currentQ.phase="yellow_window";
        room2.currentQ.pendingWinner=playerNum;
        room2.currentQ.pendingPts=pts;
        room2.timerStart=Date.now(); room2.timerSeconds=10; room2.timerPhase="yellow_wait";
        addEv(room2,"yellow_window",{seconds:10,pts});
        addEv(room2,`can_use_yellow_${other}`,{can:true,pts});
      } else {
        endQuestion(room2,playerNum,pts);
      }
    } else {
      if (phase==="playing") {
        room2.currentQ.phase="pass";
        room2.timerStart=Date.now(); room2.timerSeconds=10; room2.timerPhase="pass";
        addEv(room2,"time_up_pass",{seconds:10});
        addEv(room2,`your_turn_${other}`,{});
      } else {
        endQuestion(room2,null,0);
      }
    }
    await saveRoom(code,room2);
    return res.json({ok:true});
  }

  // ── use_yellow_card ───────────────────────────
  if (action==="use_yellow_card") {
    if (isMyTurn) return res.status(403).json({error:"مش قادر تستخدمه على نفسك!"});
    if (room.powersUsed[pStr].yellow) return res.status(400).json({error:"استخدمتها قبل!"});
    room.powersUsed[pStr].yellow=true;
    room.activePower={team:playerNum,type:"yellow"};
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    addEv(room,"yellow_card_played",{by:pStr});
    endQuestion(room,null,0);
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── skip_yellow ───────────────────────────────
  if (action==="skip_yellow") {
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    endQuestion(room,room.currentQ?.pendingWinner,room.currentQ?.pendingPts||0);
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  // ── timer_check ───────────────────────────────
  if (action==="timer_check") {
    if (!room.timerPhase || !room.timerStart) return res.json({ok:true});
    const elapsed = Math.floor((Date.now()-room.timerStart)/1000);
    if (elapsed < room.timerSeconds) return res.json({ok:true});
    const phase = room.timerPhase;
    room.timerStart=room.timerSeconds=room.timerPhase=null;
    if (phase==="main") {
      const ownerStr=String(room.currentQ?.owner||room.turn);
      const otherStr=ownerStr==="1"?"2":"1";
      if (room.currentQ) room.currentQ.phase="pass";
      room.timerStart=Date.now(); room.timerSeconds=10; room.timerPhase="pass";
      addEv(room,"time_up_pass",{seconds:10});
      addEv(room,`your_turn_${otherStr}`,{});
    } else if (phase==="pass") {
      endQuestion(room,null,0);
    } else if (phase==="yellow_wait") {
      endQuestion(room,room.currentQ?.pendingWinner,room.currentQ?.pendingPts||0);
    }
    await saveRoom(code,room);
    return res.json({ok:true});
  }

  return res.status(400).json({error:`action مش معروف: ${action}`});
}
