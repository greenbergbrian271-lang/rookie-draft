import {POST as tradeIdeas} from "../trade-ideas/route";
export const dynamic="force-dynamic";
export async function GET(){
  return tradeIdeas(new Request("http://internal/api/draft-day/trade-ideas",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({slug:"one-league",pickNo:1})
  }));
}