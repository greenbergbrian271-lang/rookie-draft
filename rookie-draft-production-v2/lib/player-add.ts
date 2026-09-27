import {SCHOOL_COLORS} from "@/lib/school-colors";

export const POSITIONS=["QB","RB","WR","TE"] as const;
export const ALL_STAR_GAMES=["None","Senior Bowl","Shrine Bowl","Hula Bowl","American Bowl"] as const;
export type Position=(typeof POSITIONS)[number];
export type AllStarGame=(typeof ALL_STAR_GAMES)[number];
export type AddPlayerInput={name:string;college:string;position:Position;allStarGame?:AllStarGame|string};
export type AddPlayerIssue={type:"exact_duplicate"|"possible_duplicate"|"queue_duplicate"|"college_mismatch"|"college_not_found"|"validation_error";message:string;suggestion?:string;existingPlayerId?:number};
export type ExistingPlayer={id?:number|string;name:string;college?:string|null};

export function cleanText(value:unknown){return String(value??"").trim().replace(/\s+/g," ")}
export function stripNameSuffix(name:string){return cleanText(name).replace(/\s+(jr\.?|sr\.?|ii|iii|iv|v)$/i,"").trim()}
export function normalizeName(name:string){return cleanText(name).toLowerCase()}

export function levenshteinDistance(a:string,b:string){
  a=(a||"").toLowerCase();b=(b||"").toLowerCase();
  const matrix:number[][]=[];
  for(let i=0;i<=b.length;i++)matrix[i]=[i];
  for(let j=0;j<=a.length;j++)matrix[0][j]=j;
  for(let i=1;i<=b.length;i++)for(let j=1;j<=a.length;j++)matrix[i][j]=b[i-1]===a[j-1]?matrix[i-1][j-1]:Math.min(matrix[i-1][j-1]+1,matrix[i][j-1]+1,matrix[i-1][j]+1);
  return matrix[b.length][a.length];
}
export function similarityRatio(a:string,b:string){const max=Math.max(a.length,b.length);return max===0?1:1-(levenshteinDistance(a,b)/max)}

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
  const rawPos=cleanText(raw?.position).toUpperCase();
  const position=rawPos as Position;
  const allStarGame=cleanText(raw?.allStarGame)||"None";
  return {name:cleanText(raw?.name),college:cleanText(raw?.college),position,allStarGame};
}

export function basicPlayerError(player:AddPlayerInput){
  if(!player.name)return "Player name is required.";
  if(!player.college)return "College is required.";
  if(!POSITIONS.includes(player.position))return "Position must be QB, RB, WR, or TE.";
  if(!ALL_STAR_GAMES.includes((player.allStarGame||"None") as AllStarGame))return "Invalid All-Star Game selection.";
  return null;
}

export function findPossibleDuplicates(playerName:string,existing:ExistingPlayer[]){
  const input=normalizeName(playerName),strippedInput=stripNameSuffix(input);
  const matches:{type:"exact"|"suffix"|"similar";existing:ExistingPlayer}[]=[];
  const seen=new Set<string>();
  for(const p of existing){
    const name=normalizeName(p.name);if(!name)continue;
    let type:"exact"|"suffix"|"similar"|null=null;
    if(name===input)type="exact";
    else{
      const stripped=stripNameSuffix(name);
      if(stripped&&stripped===strippedInput)type="suffix";
      else if(similarityRatio(strippedInput,stripped)>=.85)type="similar";
    }
    const key=String(p.id??"")+"|"+name+"|"+cleanText(p.college);
    if(type&&!seen.has(key)){seen.add(key);matches.push({type,existing:p})}
  }
  return matches;
}
