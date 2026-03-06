import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QDIR = path.join(__dirname, "..", "public", "questions");

function smartParse(filePath) {
  let c = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  c = c.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  c = c.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(c);
}

export function getCategories() {
  const out = {};
  if (!fs.existsSync(QDIR)) return out;
  for (const folder of fs.readdirSync(QDIR).sort()) {
    const fp = path.join(QDIR, folder);
    if (!fs.statSync(fp).isDirectory()) continue;
    out[folder] = [];
    for (const file of fs.readdirSync(fp).filter(f => f.endsWith(".json")).sort()) {
      try {
        const d  = smartParse(path.join(fp, file));
        const qs = d.questions || [];
        const g  = (pts) => qs.filter(q => q.points === pts).length;
        out[folder].push({
          name: d.category || file.replace(".json",""),
          file: `${folder}/${file}`,
          possible_games: Math.min(Math.floor(g(200)/2), Math.floor(g(400)/2), Math.floor(g(600)/2)),
        });
      } catch(e) { console.error(file, e.message); }
    }
  }
  return out;
}

export function pickQuestions(rel) {
  const d  = smartParse(path.join(QDIR, rel));
  const qs = d.questions || [];
  const pick = (pts) => {
    const a = qs.filter(q => q.points === pts);
    if (a.length < 2) return null;
    return a.sort(() => Math.random()-.5).slice(0,2);
  };
  const p200=pick(200), p400=pick(400), p600=pick(600);
  if (!p200||!p400||!p600) return null;
  return { category: d.category||"", questions: [...p200,...p400,...p600] };
}
