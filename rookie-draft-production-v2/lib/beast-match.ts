import {levenshteinDistance,normalizePlayerName,playerNameSimilarity} from "@/lib/player-name";
export const levenshtein=levenshteinDistance;
export function fuzzyBeastSuggestions(csvName:string,sheetNames:string[],maxResults=5){
  const csv=normalizePlayerName(csvName),csvTokens=csv.split(/\s+/),csvLast=csvTokens.at(-1)||"",csvFirst=csvTokens[0]||"";
  return sheetNames.map(name=>{const s=normalizePlayerName(name),tokens=s.split(/\s+/),last=tokens.at(-1)||"";let score=Math.round(playerNameSimilarity(csv,s)*100);if(csvLast===last)score+=20;if(csvTokens.every(t=>s.includes(t)))score+=15;if(s.startsWith(csvFirst)||csv.startsWith(tokens[0]||""))score+=8;return {name,score:Math.min(score,99)}}).filter(x=>x.score>30).sort((a,b)=>b.score-a.score).slice(0,maxResults)
}
export function convertBeastValue(v:unknown){if(v==null)return "";const s=String(v).trim();if(["","N/A","n/a","—","-","--"].includes(s))return "";const n=Number(s);return Number.isNaN(n)?s:n}
