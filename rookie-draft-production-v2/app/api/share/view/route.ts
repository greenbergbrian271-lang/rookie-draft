import {GET as getBoard} from "@/app/api/final-board/live/route";
import {verifyShareToken} from "@/lib/share-access";

function esc(v:unknown){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}
function fmt(v:any){const n=Number(v);return v==null||v===""||!Number.isFinite(n)?"—":n.toFixed(2)}
async function board(year:number){
  const res=await getBoard(new Request("http://internal/api/final-board/live?view=base&draftClass="+year));
  const data=await res.json();
  if(!res.ok)throw new Error(data?.error||("Could not load "+year+" rankings"));
  return Array.isArray(data?.rows)?data.rows:[];
}
function posClass(pos:string){return "pos pos-"+String(pos||"").toLowerCase()}
function page(title:string,content:string,status=200){
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Rookie Draft</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#06111f;color:#e8f1fb;font:14px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1180px;margin:auto;padding:34px 20px 60px}.ey{color:#5ea9ff;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.12em}h1{margin:4px 0 6px;font-size:34px}.sub{color:#8299b8}.badge{display:inline-flex;margin-top:12px;padding:6px 9px;border:1px solid #236b60;border-radius:999px;background:rgba(32,206,183,.08);color:#72dfcd;font-size:10px;font-weight:900}.years{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.years a{color:#b8cee8;text-decoration:none;border:1px solid #29476e;border-radius:8px;padding:7px 10px;background:#0d2038}.panel{margin-top:18px;border:1px solid #20395f;border-radius:14px;overflow:hidden;background:#081426}.panel h2{margin:0;padding:16px 18px;background:linear-gradient(#10223d,#0b1a30);border-bottom:1px solid #20395f}.table-wrap{overflow:auto}table{width:100%;min-width:820px;border-collapse:collapse}th{position:sticky;top:0;background:#10223d;color:#8fa7c8;font-size:10px;text-transform:uppercase;letter-spacing:.07em;text-align:left;padding:10px 12px}td{padding:10px 12px;border-top:1px solid #172d4d;color:#dce7f6}tr:nth-child(even) td{background:#0a192c}.rank{font-weight:950;font-size:17px}.pos{display:inline-grid;place-items:center;min-width:44px;padding:4px 7px;border-radius:6px;color:#06101e;font-weight:950}.pos-qb{background:#fc2b6d;color:#fff}.pos-rb{background:#20ceb7}.pos-wr{background:#58a7ff}.pos-te{background:#fead58}.grade{font-weight:950;color:#71dfce}.tier{color:#91a8c7}.empty{padding:28px;color:#8399b7}.foot{margin-top:24px;color:#607a9d;font-size:11px}.error{max-width:720px;margin:80px auto;padding:28px;border:1px solid #7a3341;border-radius:14px;background:#24131a;color:#ffc0c8}</style></head><body>${content}</body></html>`,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"private, no-store"}})
}

export async function GET(req:Request){
  const token=new URL(req.url).searchParams.get("token"),scope=verifyShareToken(token);
  if(!scope)return page("Share link unavailable",'<div class="error"><h1>Share link unavailable</h1><p>This link is invalid or has expired.</p></div>',403);
  try{
    const groups=await Promise.all(scope.years.map(async year=>({year,rows:await board(year)})));
    const nav=groups.map(g=>`<a href="#year-${g.year}">${g.year}</a>`).join("");
    const sections=groups.map(g=>{
      const rows=g.rows;
      const body=rows.length?rows.map((r:any)=>`<tr><td class="rank">${r.overallRank??"—"}</td><td>${r.positionRank?esc(r.position+" "+r.positionRank):"—"}</td><td><span class="${posClass(r.position)}">${esc(r.position)}</span></td><td><strong>${esc(r.name)}</strong><div class="sub">${esc(r.college||"")}</div></td><td class="grade">${fmt(r.boardGrade)}</td><td class="tier">${r.tier?"Tier "+r.tier:"—"}</td><td>${esc(r.draftResult||"—")}</td></tr>`).join(""):'<tr><td colspan="7" class="empty">No rankings are available for this class.</td></tr>';
      return `<section class="panel" id="year-${g.year}"><h2>${g.year} Rookie Rankings</h2><div class="table-wrap"><table><thead><tr><th>Rank</th><th>Pos Rank</th><th>Pos</th><th>Prospect</th><th>Grade</th><th>Tier</th><th>NFL Draft Result</th></tr></thead><tbody>${body}</tbody></table></div></section>`;
    }).join("");
    const heading=scope.title||(`${scope.years.join(", ")} Rookie Rankings`);
    return page(heading,`<main class="wrap"><div class="ey">Rookie Draft · Shared View</div><h1>${esc(heading)}</h1><div class="sub">Read-only rankings shared by the owner. Only the draft classes included in this link are available.</div><div class="badge">Read only · Expires ${esc(new Date(scope.expiresAt).toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}))}</div><nav class="years">${nav}</nav>${sections}<div class="foot">This shared view cannot edit data, access scouting tools, or navigate to other draft classes.</div></main>`);
  }catch(e:unknown){return page("Shared rankings unavailable",`<div class="error"><h1>Could not load shared rankings</h1><p>${esc(e instanceof Error?e.message:"Unknown error")}</p></div>`,500)}
}
