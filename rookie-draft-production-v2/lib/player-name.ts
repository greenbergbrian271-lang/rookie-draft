const SUFFIX=/\s+(?:jr\.?|sr\.?|ii|iii|iv|v)$/i;

function ascii(value:unknown){
  return String(value??"")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’‘]/g,"'")
    .replace(/[‐‑‒–—]/g,"-");
}
export function normalizePlayerNameWithSuffix(value:unknown){
  return ascii(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}
export function normalizePlayerName(value:unknown){
  return normalizePlayerNameWithSuffix(value).replace(SUFFIX,"").trim();
}
export function playerNameKey(value:unknown){return normalizePlayerName(value).replace(/\s+/g,"")}
export function samePlayerName(a:unknown,b:unknown){const x=playerNameKey(a),y=playerNameKey(b);return Boolean(x&&y&&x===y)}
export function levenshteinDistance(a:string,b:string){
  const x=playerNameKey(a),y=playerNameKey(b),m=x.length,n=y.length,dp=Array.from({length:m+1},(_,i)=>[i]);
  for(let j=0;j<=n;j++)dp[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=x[i-1]===y[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1]);
  return dp[m][n];
}
export function playerNameSimilarity(a:unknown,b:unknown){
  const x=playerNameKey(a),y=playerNameKey(b),max=Math.max(x.length,y.length);
  return max===0?1:1-(levenshteinDistance(x,y)/max);
}
function contextKey(v:unknown){return ascii(v).toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"").trim()}
export function likelySamePlayer(a:unknown,b:unknown,context?:{collegeA?:unknown;collegeB?:unknown;positionA?:unknown;positionB?:unknown;threshold?:number}){
  if(samePlayerName(a,b))return true;
  const ca=contextKey(context?.collegeA),cb=contextKey(context?.collegeB),pa=String(context?.positionA??"").trim().toUpperCase(),pb=String(context?.positionB??"").trim().toUpperCase();
  if(ca&&cb&&ca!==cb)return false;
  if(pa&&pb&&pa!==pb)return false;
  return playerNameSimilarity(a,b)>=(context?.threshold??0.88);
}
