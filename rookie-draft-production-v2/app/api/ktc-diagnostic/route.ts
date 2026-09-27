export async function GET(){
  try{
    const res=await fetch("https://keeptradecut.com/dynasty-rankings?filters=QB%7CWR%7CRB%7CTE&page=0",{
      cache:"no-store",
      headers:{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36","accept":"text/html"},
    });
    const html=await res.text();
    const needles=["var playersArray","playersArray","superflexValues","rankings-page-rankings","player-name","Drew Lock","Josh Allen","class=\"value\""];
    const found=Object.fromEntries(needles.map(n=>[n,html.indexOf(n)]));
    const snippets:any={};
    for(const [key,idx] of Object.entries(found)){
      if(Number(idx)>=0)snippets[key]=html.slice(Math.max(0,Number(idx)-300),Number(idx)+1200);
    }
    return Response.json({status:res.status,length:html.length,found,snippets});
  }catch(e:any){return Response.json({error:e?.message},{status:500})}
}
