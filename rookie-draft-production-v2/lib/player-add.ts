import {SCHOOL_COLORS} from "@/lib/school-colors";
import {levenshteinDistance,normalizePlayerName,normalizePlayerNameWithSuffix,playerNameSimilarity} from "@/lib/player-name";

export const POSITIONS=["QB","RB","WR","TE"] as const;
export const ALL_STAR_GAMES=["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"] as const;
export type Position=(typeof POSITIONS)[number];
export type AllStarGame=(typeof ALL_STAR_GAMES)[number];
export type AddPlayerInput={name:string;college:string;position:Position;allStarGame?:AllStarGame|string};
export type AddPlayerIssue={type:"exact_duplicate"|"possible_duplicate"|"queue_duplicate"|"college_mismatch"|"college_not_found"|"validation_error";message:string;suggestion?:string;existingPlayerId?:number};
export type ExistingPlayer={id?:number|string;name:string;college?:string|null;position?:string|null};

export function cleanText(value:unknown){return String(value??"").trim().replace(/\s+/g," ")}
export function stripNameSuffix(name:string){return normalizePlayerName(name)}
export function normalizeName(name:string){return normalizePlayerName(name)}
export {levenshteinDistance};
export function similarityRatio(a:string,b:string){return playerNameSimilarity(a,b)}

const SCHOOL_NAMES=Object.keys(SCHOOL_COLORS);
export function resolveSchoolName(value:string){
  const input=cleanText(value),lower=input.toLowerCase();
  if(!input)return {found:false as const,canonical:null,suggestion:null,ratio:0};
  const exact=SCHOOL_NAMES.find(name=>name.toLowerCase()===lower);
  if(exact)return {found:true as const,canonical:exact,suggestion:null,ratio:1};
  let best:string|null=null,bestRatio=0;
  for(const name of SCHOOL_NAMES){
    const target=name.toLowerCase();
    let ratio=similarityRatio(lower,target);
    if(target.startsWith(lower)||lower.startsWith(target))ratio=Math.max(ratio,.9);
    if(ratio>bestRatio){best=name;bestRatio=ratio}
  }
  return {found:false as const,canonical:null,suggestion:best&&bestRatio>=.7?best:null,ratio:bestRatio};
}

export function sanitizePlayerInput(raw:any):AddPlayerInput{
  const rawPos=cleanText(raw?.position).toUpperCase(),position=rawPos as Position,allStarGame=cleanText(raw?.allStarGame)||"None";
  return {name:cleanText(raw?.name),college:cleanText(raw?.college),position,allStarGame};
}
export function basicPlayerError(player:AddPlayerInput){
  if(!player.name)return "Player name is required.";
  if(!player.college)return "College is required.";
  if(!POSITIONS.includes(player.position))return "Position must be QB, RB, WR, or TE.";
  if(!ALL_STAR_GAMES.includes((player.allStarGame||"None") as AllStarGame))return "Invalid All-Star Game selection.";
  return null;
}
function ctx(v:unknown){return String(v??"").trim().toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"")}
export function findPossibleDuplicates(playerName:string,existing:ExistingPlayer[],context?:{college?:string;position?:string}){
  const rawInput=normalizePlayerNameWithSuffix(playerName),canonicalInput=normalizePlayerName(playerName),matches:{type:"exact"|"suffix"|"similar";existing:ExistingPlayer}[]=[],seen=new Set<string>();
  for(const p of existing){
    const raw=normalizePlayerNameWithSuffix(p.name),canonical=normalizePlayerName(p.name);if(!canonical)continue;
    let type:"exact"|"suffix"|"similar"|null=null;
    if(raw===rawInput)type="exact";
    else if(canonical===canonicalInput)type="suffix";
    else{
      const sameCollege=!context?.college||!p.college||ctx(context.college)===ctx(p.college);
      const samePosition=!context?.position||!p.position||String(context.position).toUpperCase()===String(p.position).toUpperCase();
      if(sameCollege&&samePosition&&playerNameSimilarity(canonicalInput,canonical)>=.85)type="similar";
    }
    const key=String(p.id??"")+"|"+canonical+"|"+ctx(p.college);
    if(type&&!seen.has(key)){seen.add(key);matches.push({type,existing:p})}
  }
  return matches;
}
