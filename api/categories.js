import { getCategories } from "../lib/questions.js";
export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try { res.json(getCategories()); }
  catch(e) { res.status(500).json({ error: e.message }); }
}
