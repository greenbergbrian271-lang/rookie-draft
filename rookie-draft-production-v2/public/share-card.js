(function(){
  var token=new URLSearchParams(window.location.search).get("token")||"";
  var backdrop=document.getElementById("sharedPlayerBackdrop"),card=document.getElementById("sharedPlayerCard"),close=document.getElementById("sharedPlayerClose");
  if(!backdrop||!card)return;
  function h(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function fmt(v){var n=Number(v);return v==null||v===""||!isFinite(n)?"—":n.toFixed(2)}
  function factorVal(v){var n=Number(v);return v==null||v===""?"—":isFinite(n)?String(Math.round(n*100)/100):String(v)}
  function meter(v){var n=Number(v);return isFinite(n)?Math.max(0,Math.min(100,n)):0}
  function grade(label,value,key){return '<div class="shared-grade '+key+'"><span>'+h(label)+'</span><strong>'+fmt(value)+'</strong><i><b style="width:'+meter(value)+'%"></b></i></div>'}
  function hero(d){
    var p=d.player||{},g=d.grades||{},img=p.headshot_url||d.teamLogo||"";
    var media=img?'<img src="'+h(img)+'" alt="">':'<div class="shared-photo-fallback">'+h(String(p.name||"").split(/\s+/).map(function(x){return x[0]||""}).slice(0,2).join(""))+'</div>';
    return '<div class="shared-profile-hero"><div class="shared-photo">'+media+'</div><div class="shared-profile-copy"><div class="shared-ey">'+h(p.positionRank||p.position)+' · '+h(p.college||"")+(p.jersey_number?' · #'+h(p.jersey_number):"")+'</div><h2>'+h(p.name)+'</h2><div class="shared-muted">'+h(p.draft_class)+' Prospect · Read only</div></div><div class="shared-final"><span>Final Grade</span><strong>'+fmt(g.final)+'</strong></div></div>'
  }
  function summary(d){
    var g=d.grades||{};
    return '<div class="shared-pane"><h3>Grades</h3><div class="shared-grade-grid">'+grade("Scouting",g.scouting,"scouting")+grade("Production",g.production,"production")+grade("Analytical",g.analytical,"analytical")+grade("Pre-Draft",g.pre,"predraft")+grade("Final",g.final,"final")+'</div><div class="shared-two"><section><h3>NFL Draft Result</h3><div class="shared-draft-result"><strong>'+h(g.draftResult||"Not drafted yet")+'</strong>'+(g.draftTeam?'<span>'+h(g.draftTeam)+'</span>':"")+'</div></section><section><h3>AI Summary of Notes</h3><p>'+h(d.notesSummary||"No scouting summary available.")+'</p></section></div></div>'
  }
  function factorSection(title,ey,items,pct){
    items=Array.isArray(items)?items:[];
    var body=items.length?items.map(function(x){var width=pct?x.percentile:x.value;return '<div class="shared-factor"><div><span>'+h(x.label)+'</span>'+(pct&&x.percentile!=null?'<small>'+h(x.percentile)+'th percentile</small>':"")+'</div><strong>'+h(factorVal(x.value))+'</strong><i><b style="width:'+meter(width)+'%"></b></i></div>'}).join(""):'<div class="shared-empty">No factors available.</div>';
    return '<section class="shared-factor-section"><div class="shared-factor-head"><div><span>'+h(ey)+'</span><h3>'+h(title)+'</h3></div><b>'+items.length+' factors</b></div><div class="shared-factor-grid">'+body+'</div></section>'
  }
  function grades(d){var f=d.gradeFactors||{};return '<div class="shared-pane"><div class="shared-intro"><span>GRADE INPUTS</span><h3>What builds the grades</h3><p>Film, production and analytical inputs for this prospect.</p></div>'+factorSection("Film","SCOUTED TRAITS",f.film,false)+factorSection("Production","PRODUCTION INPUTS",f.production,true)+factorSection("Analytics","ANALYTICAL INPUTS",f.analytical,true)+'</div>'}
  function stats(d){
    var s=d.stats||{},cats=Array.isArray(s.categories)?s.categories:[];
    if(!cats.length)return '<div class="shared-pane"><div class="shared-empty">No career statistics were found for this player.</div></div>';
    return '<div class="shared-pane"><h3>College Career Stats</h3>'+cats.map(function(c){var labels=Array.isArray(c.labels)?c.labels:[],rs=Array.isArray(c.rows)?c.rows:[];return '<section class="shared-stat-section"><h4>'+h(c.displayName||c.name)+'</h4><div class="shared-table-wrap"><table><thead><tr><th>Season</th><th>Team</th>'+labels.map(function(x){return '<th>'+h(x)+'</th>'}).join("")+'</tr></thead><tbody>'+rs.map(function(r){return '<tr><td>'+h(r.season||"—")+'</td><td>'+h(r.teamAbbr||r.team||"—")+'</td>'+labels.map(function(_,i){return '<td>'+h((r.stats||[])[i]??"—")+'</td>'}).join("")+'</tr>'}).join("")+(Array.isArray(c.totals)&&c.totals.length?'<tr class="career"><td>Career</td><td>—</td>'+labels.map(function(_,i){return '<td>'+h(c.totals[i]??"—")+'</td>'}).join("")+'</tr>':"")+'</tbody></table></div></section>'}).join("")+'</div>'
  }
  function team(d){
    var mates=Array.isArray(d.teamPlayers)?d.teamPlayers:[],history=Array.isArray(d.transferHistory)?d.transferHistory:[],schedule=Array.isArray(d.schedule)?d.schedule:[];
    var mateHtml=mates.length?'<div class="shared-team-prospects">'+mates.map(function(x){return '<button data-player-id="'+h(x.id)+'" class="shared-team-prospect pos-'+h(String(x.position||"").toLowerCase())+'"><b>'+h(x.positionRank||x.position)+'</b><span>'+h(x.name)+'</span></button>'}).join("")+'</div>':'<div class="shared-empty">No other shared prospects at this school.</div>';
    var hist=history.length?'<h3>Transfer History</h3><div class="shared-history">'+history.map(function(x){return '<div><span>'+h(x.effective_season||"—")+'</span><strong>'+h(x.from_college||"Unknown")+' → '+h(x.to_college||"")+'</strong></div>'}).join("")+'</div>':"";
    var games=schedule.length?'<div class="shared-schedule">'+schedule.map(function(e){var date=e.date?new Date(e.date).toLocaleDateString([],{month:"short",day:"numeric"}):"—";return '<div><span>'+h(date)+'</span><section><strong>'+h(e.resultLine||e.shortName||e.name||"")+'</strong>'+(e.playerStats?'<small>'+h(e.playerStats)+'</small>':"")+'</section></div>'}).join("")+'</div>':'<div class="shared-empty">No schedule data available.</div>';
    return '<div class="shared-pane"><h3>'+h((d.player||{}).college||"Team")+' · Draft Eligible Players</h3>'+mateHtml+hist+'<h3>'+h(d.scheduleSeason?d.scheduleSeason+" ":"")+'Team Schedule & Results</h3>'+games+'</div>'
  }
  function render(d){
    var tabs=["Summary","Grades","Stats","Team"];
    card.innerHTML=hero(d)+'<div class="shared-tabs">'+tabs.map(function(x,i){return '<button data-tab="'+x+'" class="'+(i===0?"active":"")+'">'+x+'</button>'}).join("")+'</div><div id="sharedPane"></div>';
    var pane=document.getElementById("sharedPane");
    function setTab(name){Array.prototype.forEach.call(card.querySelectorAll("[data-tab]"),function(b){b.classList.toggle("active",b.getAttribute("data-tab")===name)});pane.innerHTML=name==="Grades"?grades(d):name==="Stats"?stats(d):name==="Team"?team(d):summary(d)}
    Array.prototype.forEach.call(card.querySelectorAll("[data-tab]"),function(b){b.addEventListener("click",function(){setTab(b.getAttribute("data-tab"))})});
    setTab("Summary")
  }
  async function openPlayer(id){
    backdrop.hidden=false;document.body.classList.add("shared-modal-open");card.innerHTML='<div class="shared-loading">Loading player card…</div>';
    try{var r=await fetch("/api/share/player?token="+encodeURIComponent(token)+"&id="+encodeURIComponent(id),{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error||"Could not load player card");render(j)}
    catch(e){card.innerHTML='<div class="shared-loading error">'+h(e&&e.message?e.message:"Could not load player card")+'</div>'}
  }
  function shut(){backdrop.hidden=true;document.body.classList.remove("shared-modal-open")}
  document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-player-id]");if(b){e.preventDefault();openPlayer(b.getAttribute("data-player-id"))}});
  if(close)close.addEventListener("click",shut);
  backdrop.addEventListener("mousedown",function(e){if(e.target===backdrop)shut()});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!backdrop.hidden)shut()});
})();