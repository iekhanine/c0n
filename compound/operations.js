"use strict";
// Compound field operations. Origin-limited, credentialed requests go to the
// existing C0N game API. All actions remain authorized server-side.
const OPS_API="https://cultofnixon.com/api/social?action=game_";
let opsState=null,opsPending=false;
async function opsRequest(action,data){
 const r=await fetch(OPS_API+encodeURIComponent(action),{
  method:data?"POST":"GET",credentials:"include",cache:"no-store",
  headers:data?{"Content-Type":"application/json"}:undefined,
  body:data?JSON.stringify(data):undefined});
 const payload=await r.json().catch(()=>({error:"The Compound cannot be reached."}));
 if(!r.ok)throw Error(payload.error||"The operation could not be completed.");
 return payload;
}
const opsMoney=n=>"$"+Number(n||0).toLocaleString("en-US");
const opsTxt=s=>esc(String(s??""));
function opsCard(label,value,description,link){
 return '<div class="ops-card"><div class="eyebrow">'+opsTxt(label)+'</div><strong class="ops-value">'+opsTxt(value)+'</strong><p>'+opsTxt(description||"")+'</p>'+(link?'<a class="btn" href="'+opsTxt(link)+'">Open section</a>':"")+'</div>';
}
function opsEmpty(message){return '<div class="ops-empty">'+opsTxt(message)+'</div>';}
function opsSection(label,title,description,content){
 return '<section class="ops-section"><div class="ops-section-title"><small>'+opsTxt(label)+'</small><h2>'+opsTxt(title)+'</h2><p>'+opsTxt(description)+'</p></div>'+content+'</section>';
}
function opsField(label,name,kind,value,options,attrs=""){
 const title=opsTxt(label),safe=opsTxt(name);
 if(kind==="select")return '<label class="ops-field"><span>'+title+'</span><select name="'+safe+'" '+attrs+'>'+options.map(([val,text])=>'<option value="'+opsTxt(val)+'"'+(val===String(value)?' selected':'')+'>'+opsTxt(text)+'</option>').join("")+'</select></label>';
 if(kind==="textarea")return '<label class="ops-field"><span>'+title+'</span><textarea name="'+safe+'" rows="4" '+attrs+'>'+opsTxt(value||"")+'</textarea></label>';
 return '<label class="ops-field"><span>'+title+'</span><input name="'+safe+'" type="'+opsTxt(kind||"text")+'" value="'+opsTxt(value??"")+'" '+attrs+'></label>';
}
const opsAttributes=["strength","intelligence","charisma","agility","endurance","perception"];
const opsProfessions=[["carpenter","Carpentry"],["metalworker","Metalworking"],["medic","Medical"],["farmer","Agriculture"],["engineer","Engineering"],["scavenger","Scavenging"]];
const opsCompletion=[["timer","Timed work"],["quiz","Field verification"],["dice","Skill check"],["collaborative","Collaborative task"],["dm_approval","Overseer approval"]];
async function opsLoad(){opsState=await opsRequest("state");return opsState;}
function opsRoleGate(g){
 if(g.character||g.overseer)return "";
 return '<div class="ops-alert"><strong>Personnel registration required</strong><p>Your membership is active, but your personnel record is not complete.</p><a class="btn primary" href="/operations/registration">Complete registration</a></div>';
}
async function opsHome(){
 const g=await opsLoad();
 const gate=opsRoleGate(g);
 return head("Compound operations","Active assignments, restoration progress, supplies, and personnel records. Every operation has a dedicated section.")+
 '<div class="ops-overview">'+opsCard("IDENTITY",g.character?.name||g.assignedName||"Not registered",g.character?"Level "+g.character.level:"Complete your personnel intake","/operations/registration")+
 opsCard("AVAILABLE FUNDS",opsMoney(g.wallet),"Your current Reclamation account","/operations/finance")+
 opsCard("CURRENT WORK ORDERS",g.orders.filter(o=>o.status==="in_progress").length,"Assignments currently underway","/operations/work-orders")+
 opsCard("RESTORATION",g.projects.filter(p=>p.state==="active").length+" ACTIVE","Live restoration phases","/operations/restoration")+'</div>'+
 gate+
 opsSection("FIELD OPERATIONS","Where do you need to go?","All Compound systems are grouped by responsibility.",
 '<div class="ops-link-grid">'+[
 ["/operations/work-orders","Work orders","Available contracts, active duties, field reports"],
 ["/operations/restoration","Restoration milestones","Bunker reconstruction and material deliveries"],
 ["/operations/inventory","Stockroom & crafting","Stored materials, tools, recovery and production"],
 ["/supplies","Supply requisitions","Request equipment and submit field reports"],
 ["/operations/campaigns","Campaigns & expeditions","Crew expeditions, sessions and field checks"],
 ["/operations/finance","Resident finances","Personal balance and transfers"],
 ["/guide","Newcomer field guide","Registration, roles, shifts and payroll"]
 ].map(([url,title,description])=>'<a class="ops-link" href="'+url+'"><strong>'+title+'</strong><span>'+description+'</span></a>').join("")+'</div>')+
 (g.overseer?opsSection("OVERSEER ACCESS","Command responsibilities","Restricted controls remain separate from resident operations.",
 '<div class="ops-link-grid">'+[
 ["/overseer/work-orders","Work-order administration","Create, edit, suspend and review contracts"],
 ["/overseer/finance","Financial administration","Treasury, wages, taxes and payroll"],
 ["/overseer/supplies","Facility oversight","Requisitions, supply grants and recovery reports"],
 ["/overseer/campaigns","Expedition oversight","Create operations, grant roles, approve rewards"],
 ["/admin/residents","Personnel administration","Resident directory, apartments and progression"],
 ["https://cultofnixon.com/membership","Invitation codes","Issue and revoke newcomer invitations"],
 ["https://cultofnixon.com/admin","Community administration","Website, staff, publishing and Discord bot"]
 ].map(([url,title,description])=>'<a class="ops-link" href="'+url+'"><strong>'+title+'</strong><span>'+description+'</span></a>').join("")+'</div>'):"");
}
async function opsRegistration(){
 const g=await opsLoad();
 if(g.character)return head("Personnel record","Your registration is already complete.")+
 opsCard("ASSIGNED IDENTITY",g.character.name,"Profession: "+g.character.profession_id,"/operations");
 const rules=g.settings?.rules||{},base=Number(rules.starting_attribute??5),max=Number(rules.starting_max??10),points=Number(rules.allocation_points??20);
 const values=Object.fromEntries(opsAttributes.map(k=>[k,base]));
 window.opsRegistration={base,max,points,values};
 return head("Personnel intake","Your codename was issued with your C0N membership. Choose a trade and distribute your starting abilities.")+
 '<form class="ops-form ops-intake" data-ops-action="character.create"><div class="ops-section-title"><small>01 / VERIFIED IDENTITY</small><h2>'+opsTxt(g.assignedName||"No assigned codename")+'</h2><p>Names are generated by the Compound. This field cannot be changed during intake.</p></div>'+
 opsSection("02 / SPECIALIZATION","Choose a profession","This determines your initial field expertise.",opsField("STARTING TRADE","profession","select","carpenter",opsProfessions,"required"))+
 '<div class="ops-section-title"><small>03 / PERSONNEL ATTRIBUTES</small><h2>Distribute your points</h2><p>All available points must be assigned before you can register.</p></div>'+
 '<div class="ops-points"><strong id="ops-points-left">'+points+'</strong><span>POINTS REMAINING</span><button type="button" class="btn" data-ops-reset>Reset</button></div>'+
 '<div class="ops-attribute-grid">'+opsAttributes.map(a=>'<div class="ops-attribute"><div><strong>'+a[0].toUpperCase()+a.slice(1)+'</strong><small>Starting score: '+base+' · Maximum: '+max+'</small></div><div class="ops-stepper"><button type="button" data-ops-attr="'+a+'" data-delta="-1" aria-label="Decrease '+a+'">−</button><output id="ops-stat-'+a+'">'+base+'</output><button type="button" data-ops-attr="'+a+'" data-delta="1" aria-label="Increase '+a+'">+</button></div></div>').join("")+'</div>'+
 '<div class="ops-actions"><button class="btn primary" type="submit" id="ops-create-personnel" disabled>Complete personnel intake</button>'+
 (g.overseer?'<a href="/" class="btn">Skip for now · Overseer</a>':"")+'</div></form>';
}
async function opsWorkOrders(){
 const g=await opsLoad();return head("Work orders","Every assignment has its own duration, payment, and verification method.")+
 opsRoleGate(g)+
 opsSection("AVAILABLE CONTRACTS","Open work","Join a field assignment only when your registration is complete.",
 '<div class="ops-list">'+g.tasks.filter(t=>!t.profession_id||t.profession_id===g.character?.profession_id).map(t=>
 '<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(t.title)+'</strong><span>'+opsMoney(t.pay_credits)+'</span></div><p>'+opsTxt(t.description)+'</p><div class="ops-meta">'+t.duration_minutes+' minutes · '+t.character_xp+' XP · '+t.profession_xp+' profession XP</div>'+
 (g.character?'<button class="btn primary" data-ops-submit="task.accept" data-id="'+opsTxt(t.id)+'">Accept assignment</button>':'<a class="btn" href="/operations/registration">Register to participate</a>')+'</article>').join("")+'</div>')+
 opsSection("MY ASSIGNMENTS","Active and historical work","Reports and completion are recorded against your personnel record.",
 (g.orders.length?'<div class="ops-list">'+g.orders.map(o=>'<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(o.title)+'</strong><span>'+opsTxt(o.status)+'</span></div><p>'+ (o.due_at?'Scheduled completion: '+opsTxt(new Date(o.due_at).toLocaleString()):'Awaiting assignment') +'</p>'+
 (o.status==="in_progress"?'<button type="button" class="btn" data-ops-submit="'+(o.completion_type==="timer"?"task.complete":"task.review.request")+'" data-id="'+opsTxt(o.id)+'">'+(o.completion_type==="timer"?"Mark completed":"Submit for Overseer review")+'</button>':"")+'</article>').join("")+'</div>':opsEmpty("No work orders assigned.")));
}
async function opsRestoration(){
 const g=await opsLoad();
 return head("Restoration milestones","Rebuild the Compound sector by sector. Materials and completed work are preserved in the settlement ledger.")+
 opsRoleGate(g)+
 '<div class="ops-list">'+g.projects.map(p=>opsSection("PHASE "+p.phase+" / "+p.state,p.title,"Current restoration requirements",
 Object.entries(p.requirements||{}).map(([item,needed])=>{
 const current=Number(p.progress?.[item]||0),remaining=Math.max(0,Number(needed)-current);
 return '<div class="ops-material"><div><strong>'+opsTxt(item.replaceAll("_"," "))+'</strong><span>'+current+' / '+Number(needed)+'</span></div><progress value="'+current+'" max="'+(Number(needed)||1)+'"></progress>'+
 (g.character&&p.state==="active"&&remaining>0&&item!=="work_units"?'<form data-ops-action="project.contribute" class="ops-inline"><input type="hidden" name="projectId" value="'+opsTxt(p.id)+'"><input type="hidden" name="item" value="'+opsTxt(item)+'">'+opsField("QUANTITY","quantity","number",1,[],'min="1" max="'+remaining+'" required')+'<button class="btn" type="submit">Deliver</button></form>':"")+'</div>'}).join("")+
 (g.overseer&&p.state==="active"&&Object.entries(p.requirements||{}).every(([item,needed])=>Number(p.progress?.[item]||0)>=Number(needed))?'<button class="btn primary" data-ops-submit="project.finalize" data-id="'+opsTxt(p.id)+'">Finalize restoration phase</button>':"")
 )).join("")+'</div>';
}
async function opsInventory(){
 const g=await opsLoad();return head("Stockroom & supplies","Accountable storage, reusable equipment, and authorized fabrication.")+
 opsRoleGate(g)+opsSection("CURRENT STOCK","Available storage","The warehouse is shared. Personal supplies and apartment stores are separate.",
 '<div class="ops-overview">'+["warehouse","carry","apartment"].map(type=>'<div class="ops-card"><div class="eyebrow">'+type.toUpperCase()+'</div>'+
 ((g.storage||[]).filter(x=>x.storage_type===type&&x.item_id).map(x=>'<div class="ops-asset"><strong>'+opsTxt(x.item_name||x.item_id)+'</strong><span>'+Number(x.quantity||0)+'</span></div>').join("")||opsEmpty("Nothing currently recorded."))+'</div>').join("")+'</div>')+
 (g.character?opsSection("STOCK TRANSFER","Move recorded materials","Every transfer is validated and saved.",
 '<form class="ops-form ops-form-grid" data-ops-action="inventory.transfer">'+opsField("SOURCE","from","select","carry",[["carry","Personal carry"],["apartment","Apartment"],["warehouse","Warehouse"]])+
 opsField("DESTINATION","to","select","apartment",[["apartment","Apartment"],["carry","Personal carry"],["warehouse","Warehouse"]])+opsField("ITEM ID","item","text","",[],'required')+
 opsField("QUANTITY","quantity","number",1,[],'min="1" max="1000" required')+'<button type="submit" class="btn primary">Transfer materials</button></form>'):"")+
 opsSection("FABRICATION","Available recipes","Consume collected ingredients to produce new supplies.",
 '<div class="ops-list">'+(g.recipes||[]).filter(x=>!x.profession_id||x.profession_id===g.character?.profession_id).map(r=>
 '<article class="ops-job"><strong>'+opsTxt(r.title)+'</strong><p>Requires: '+opsTxt(Object.entries(r.ingredients||{}).map(([k,v])=>k+" ×"+v).join(", "))+'</p><p>'+r.duration_minutes+' minutes · '+r.xp+' XP</p>'+(g.character?'<button class="btn" data-ops-submit="craft.start" data-id="'+opsTxt(r.id)+'">Start fabrication</button>':"")+'</article>').join("")+'</div>'+
 '<div class="ops-list">'+(g.crafting||[]).map(c=>'<article class="ops-job">'+opsTxt(c.title)+' · '+opsTxt(c.state)+(c.state==="ready"?'<button class="btn" data-ops-submit="craft.complete" data-id="'+opsTxt(c.id)+'">Collect</button>':"")+'</article>').join("")+'</div>');
}
async function opsCampaigns(){
 const g=await opsLoad();return head("Campaigns & expeditions","Coordinate exploration parties and survey the territory beyond the Compound.")+
 opsRoleGate(g)+opsSection("FIELD EXPEDITIONS","Current campaigns","Active assignments and expedition teams.",
 '<div class="ops-list">'+(g.campaigns||[]).map(c=>'<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(c.title)+'</strong><span>'+opsTxt(c.state)+'</span></div><p>'+opsTxt(c.synopsis)+'</p>'+
 (g.character&&c.state==="active"?'<button class="btn" data-ops-submit="campaign.join" data-id="'+opsTxt(c.id)+'">Join expedition</button>':"")+
 (g.dungeonMaster&&c.state==="active"?'<button class="btn" data-ops-submit="session.start" data-id="'+opsTxt(c.id)+'">Start session</button>':"")+'</article>').join("")+'</div>')+
 opsSection("ACTIVE SESSIONS","Field coordination","Each session has its own persistent operation record.",
 '<div class="ops-list">'+(g.sessions||[]).map(c=>'<article class="ops-job"><strong>Session '+opsTxt(c.id.slice(0,8))+'</strong><button class="btn" data-ops-submit="session.join" data-id="'+opsTxt(c.id)+'">Join session</button></article>').join("")+'</div>');
}
async function opsFinance(){
 const g=await opsLoad();return head("Resident finances","Track your holdings and approved transfers.")+
 opsCard("PERSONAL BALANCE",opsMoney(g.wallet),"Cash on file in your Compound account","/operations/work-orders")+
 (g.character?opsSection("RESIDENT TRANSFERS","Transfer funds","Transfers are subject to the settlement transaction tax.",
 '<form data-ops-action="credits.transfer" class="ops-form ops-form-grid">'+opsField("RECIPIENT DISCORD ID","recipient","text","",[],'required pattern="[0-9]{17,20}"')+opsField("AMOUNT ($)","amount","number",100,[],'min="1" max="100000000" required')+'<button class="btn primary" type="submit">Send funds</button></form>'):"")+
 opsSection("ACCOUNT SERVICES","Other balances","The communal treasury and personal holdings are separate.",'<p>Use <code>/wallet</code> on Discord for your resident account. Mention the bot with <code>@cultofnixon wallet</code> to inspect the communal treasury.</p>');
}
async function opsOverseerWork(){
 const g=await opsLoad();if(!g.overseer)throw Error("Overseer access required.");
 return head("Work-order administration","Issue, update, suspend and retire official Compound contracts.")+
 opsCard("PUBLISHED TEMPLATES",(g.overseer.taskTemplates||[]).length,"Current work-order definitions","/operations/work-orders")+
 opsSection("CONTRACT EDITOR","Create or revise a work order","This form writes directly to the authorized work-order record.",
 '<form class="ops-form ops-form-grid" data-ops-action="task.publish" id="ops-task-editor">'+
 opsField("EXISTING CONTRACT","template","select","",[["","New contract"],...(g.overseer.taskTemplates||[]).map(t=>[t.id,t.title])])+
 opsField("TITLE","title","text","",[],'required maxlength="200"')+
 opsField("PROFESSION","profession","select","carpenter",[["","Any trade"],...opsProfessions])+
 opsField("DESCRIPTION","description","textarea","")+
 opsField("COMPLETION MODE","completionType","select","timer",opsCompletion)+
 opsField("DURATION / MINUTES","minutes","number",15,[],'min="0" max="10080" required')+
 opsField("CHARACTER XP","xp","number",35,[],'min="0" max="100000" required')+
 opsField("PROFESSION XP","skillXp","number",25,[],'min="0" max="100000" required')+
 opsField("PAYMENT ($)","pay","number",350,[],'min="0" max="1000000000" required')+
 opsField("CONTRACT STATUS","status","select","published",[["draft","Draft"],["published","Published"],["paused","Paused"],["retired","Retired"]])+
 '<input type="hidden" name="id"><input type="hidden" name="version"><div class="ops-actions"><button class="btn primary" type="submit">Save contract</button><button class="btn" type="reset" id="ops-reset-task">Clear editor</button></div></form>')+
 opsSection("PUBLISHED CONTRACTS","All templates","Select any contract to edit.",'<div class="ops-list">'+(g.overseer.taskTemplates||[]).map(t=>'<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(t.title)+'</strong><span>'+opsTxt(t.status)+'</span></div><p>'+opsTxt(t.description||"")+'</p><p>'+opsMoney(t.pay_credits)+' · '+t.character_xp+' XP</p><button class="btn" data-ops-edit-template="'+opsTxt(t.id)+'">Edit contract</button></article>').join("")+'</div>');
}
async function opsOverseerFinance(){
 const g=await opsLoad();if(!g.overseer)throw Error("Overseer access required.");
 const settings=g.settings?.rules||{};
 return head("Financial administration","Treasury policy, salaries, taxes, and authorized payroll operations.")+
 '<div class="ops-overview">'+opsCard("COMPOUND TREASURY",opsMoney(g.overseer.treasury),"Shared settlement funds")+
 opsCard("ACTIVE EMPLOYMENT",(g.overseer.employment||[]).length,"Current salaried assignments")+'</div>'+
 opsSection("EMPLOYMENT","Set compensation","Create or revise a resident's approved employment record.",
 '<form data-ops-action="employment.set" class="ops-form ops-form-grid">'+
 opsField("RESIDENT","discordId","select","",[["","Select resident"],...(g.overseer.members||[]).map(m=>[m.discord_id,m.name+" · "+m.profession_id])],"required")+
 opsField("WEEKLY SALARY ($)","weekly","number",1000,[],'min="0" max="100000000" required')+
 opsField("MINIMUM WORK UNITS","requiredUnits","number",2,[],'min="0" required')+
 '<input type="hidden" name="type" value="salary"><input type="hidden" name="profession" value="carpenter">'+
 '<button class="btn primary">Save compensation</button></form>')+
 opsSection("FINANCIAL RULES","Taxes and policy","Changes affect future transactions, not historical entries.",
 '<form class="ops-form ops-form-grid" data-ops-action="taxes.update">'+
 opsField("INCOME TAX (%)","income","number",settings.income_tax_percent??5,[],'min="0" max="100" required')+
 opsField("TRANSFER TAX (%)","sales","number",settings.sales_tax_percent??5,[],'min="0" max="100" required')+
 '<button class="btn primary">Apply tax policy</button></form>')+
 opsSection("TREASURY ACTIONS","Payroll & Overseer stipend","High-impact actions require your account's Overseer authorization.",
 '<form class="ops-form ops-form-grid" data-ops-action="payroll.run">'+opsField("PAY PERIOD START (MONDAY)","monday","date","",[],'required')+
 '<button class="btn primary">Run payroll</button></form>'+
 '<form class="ops-form ops-form-grid ops-space" data-ops-action="overseer.stipend">'+opsField("OVERSEER STIPEND ($)","amount","number",1000,[],'min="1" max="1000000" required')+
 '<button class="btn">Pay approved stipend</button></form>');
}
async function opsOverseerCampaigns(){
 const g=await opsLoad();if(!g.overseer)throw Error("Overseer access required.");
 return head("Expedition oversight","Commission expeditions, manage field sessions and approve rewards.")+
 opsSection("CREATE MISSION","Campaign directives","Publish an expedition for field crews.",
 '<form class="ops-form ops-form-grid" data-ops-action="campaign.create">'+opsField("CAMPAIGN TITLE","title","text","",[],'required')+
 opsField("MISSION BRIEF","synopsis","textarea","")+'<button class="btn primary">Create expedition</button></form>')+
 opsSection("AWARDS","Overseer verification","Review submitted field awards before granting pay and experience.",
 '<div class="ops-list">'+(g.overseer.pendingAwards||[]).map(a=>'<article class="ops-job"><strong>'+opsTxt(a.recipient)+'</strong><p>'+a.xp+' XP · '+opsMoney(a.credits)+'</p><button class="btn primary" data-ops-submit="award.approve" data-id="'+opsTxt(a.id)+'">Approve award</button></article>').join("")+'</div>')+
 opsSection("FIELD COMMAND","Current campaigns","Campaign lifecycle is controlled by authorized expedition staff.",
 '<div class="ops-list">'+(g.campaigns||[]).map(c=>'<article class="ops-job"><strong>'+opsTxt(c.title)+'</strong><p>'+opsTxt(c.synopsis)+'</p><span class="tag">'+opsTxt(c.state)+'</span><div class="ops-actions">'+
 [["active","Activate"],["paused","Pause"],["complete","Complete"]].filter(([k])=>k!==c.state).map(([state,label])=>'<button class="btn" data-ops-campaign-state="'+state+'" data-id="'+opsTxt(c.id)+'">'+label+'</button>').join("")+'</div></article>').join("")+'</div>');
}
async function opsFacilityRequest(action,data){
 const r=await fetch("https://cultofnixon.com/api/social?action=facility_"+encodeURIComponent(action),{
  method:data?"POST":"GET",credentials:"include",cache:"no-store",
  headers:data?{"Content-Type":"application/json"}:undefined,
  body:data?JSON.stringify(data):undefined});
 const result=await r.json().catch(()=>({error:"Supply service is not available"}));
 if(!r.ok)throw Error(result.error||"Supply request failed");
 return result;
}
async function opsSupplies(){
 const data=await opsFacilityRequest("state");
 return head("Supply requisitions","Request equipment from the stockroom, inspect assigned recovery work and submit field reports.")+
 '<div class="ops-overview">'+opsCard("AVAILABLE FUNDS",opsMoney(data.wallet?.credits),"Facility requisition balance")+
 opsCard("ACTIVE REQUESTS",data.requests.filter(r=>["pending","assigned"].includes(r.status)).length,"Awaiting approval or field duty")+'</div>'+
 opsSection("REQUISITION","Request supplies","Requests are reviewed by the Overseer. Some supplies may require a field duty.",
 '<form class="ops-form ops-form-grid" data-facility-action="request">'+
 opsField("SUPPLY ITEM","sku","select",data.catalog[0]?.id||"",data.catalog.map(c=>[c.id,c.label+" · "+opsMoney(c.cost)]),"required")+
 opsField("REQUEST NOTES","note","textarea","","")+
 '<button class="btn primary">Submit requisition</button></form>')+
 opsSection("MY FIELD DUTIES","Assigned recovery work","Complete the verification sequence and report your field activity.",
 '<div class="ops-list">'+(data.assignments.length?data.assignments.map(a=>{
 const duty=data.duties.find(x=>x.id===a.duty);
 return '<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(duty?.title||"Work order")+'</strong><span>'+opsTxt(a.status)+'</span></div><p>'+opsTxt(duty?.question||"")+'</p>'+
 (a.status==="assigned"?'<form class="ops-form" data-facility-action="submit">'+
 '<input type="hidden" name="id" value="'+opsTxt(a.id)+'">'+
 opsField("VERIFICATION SEQUENCE","answer","text","",[],'required maxlength="40"')+
 opsField("COMPLETION REPORT","report","textarea","",[],'required maxlength="1500"')+
 '<button class="btn primary">Submit field report</button></form>':"")+'</article>'
 }).join(""):opsEmpty("No active duties."))+'</div>')+
 opsSection("REQUEST HISTORY","Previous requests","Review your requisitions and fulfillment status.",
 table(["Supply","Status","Review"],data.requests.map(r=>'<tr><td>'+opsTxt(data.catalog.find(c=>c.id===r.sku)?.label||r.sku)+'</td><td>'+opsTxt(r.status)+'</td><td>'+opsTxt(r.review||"")+'</td></tr>')));
}
async function opsOverseerSupplies(){
 if(!me?.is_overseer)throw Error("Overseer access required");
 const [data,admin]=await Promise.all([opsFacilityRequest("state"),opsFacilityRequest("control")]);
 return head("Supply administration","Oversee requisitions, issue materials, review field reports and maintain facility directives.")+
 '<div class="ops-overview">'+opsCard("PENDING REQUESTS",admin.requests.filter(r=>r.status==="pending").length,"Unreviewed equipment requests")+
 opsCard("REPORTS WAITING",admin.assignments.filter(a=>a.status==="submitted").length,"Work reports requiring verification")+
 opsCard("RECENT GRANTS",admin.grants.length,"Logged supply issues")+'</div>'+
 opsSection("REQUISITION QUEUE","Equipment requests","Approve an affordable request, deny it, or assign a recovery duty.",
 '<div class="ops-list">'+(admin.requests.filter(r=>r.status==="pending").map(r=>
 '<article class="ops-job"><div class="ops-job-top"><strong>'+opsTxt(r.member_name||r.member_id)+'</strong><span>'+opsMoney(r.cost)+'</span></div><p>'+opsTxt(data.catalog.find(i=>i.id===r.sku)?.label||r.sku)+' · '+opsTxt(r.note||"No notes")+'</p>'+
 '<div class="ops-actions"><button class="btn primary" data-facility-submit="decide" data-id="'+opsTxt(r.id)+'" data-approve="true">Approve</button>'+
 '<button class="btn" data-facility-submit="decide" data-id="'+opsTxt(r.id)+'" data-approve="false">Deny</button>'+
 '</div><form class="ops-form ops-form-grid" data-facility-action="assign"><input type="hidden" name="id" value="'+opsTxt(r.id)+'">'+
 opsField("REQUIRED FIELD DUTY","duty","select",data.duties[0]?.id||"",data.duties.map(d=>[d.id,d.title]))+
 '<button class="btn">Assign recovery duty</button></form></article>').join("")||opsEmpty("No requisitions await review."))+'</div>')+
 opsSection("FIELD REVIEW","Submitted reports","Verify completion or return the report for correction.",
 '<div class="ops-list">'+(admin.assignments.filter(a=>a.status==="submitted").map(a=>'<article class="ops-job"><strong>'+opsTxt(a.member_name||a.member_id)+'</strong><p>'+opsTxt(a.report||"No field report")+'</p>'+
 '<div class="ops-actions"><button class="btn primary" data-facility-submit="review" data-id="'+opsTxt(a.id)+'" data-approve="true">Verify & reward</button>'+
 '<button class="btn" data-facility-submit="review" data-id="'+opsTxt(a.id)+'" data-approve="false">Return report</button></div></article>').join("")||opsEmpty("No submitted reports await verification."))+'</div>')+
 opsSection("DIRECT ISSUANCE","Issue supplies","Grant approved equipment to an active member; every issuance is recorded.",
 '<form class="ops-form ops-form-grid" data-facility-action="grant">'+
 opsField("RECIPIENT","member_id","select","",[["","Select resident"],...admin.members.map(m=>[m.user_id,m.codename])],"required")+
 opsField("SUPPLY ITEM","sku","select",data.catalog[0]?.id||"",data.catalog.map(c=>[c.id,c.label]))+
 opsField("QUANTITY","quantity","number",1,[],'min="1" max="100" required')+
 opsField("ISSUANCE NOTE","note","textarea","","")+
 '<button class="btn primary">Issue supplies</button></form>')+
 opsSection("FACILITY DIRECTIVE","Overseer bulletin","Update the standing direction visible to resident teams.",
 '<form class="ops-form" data-facility-action="directive">'+opsField("CURRENT DIRECTIVE","directive","textarea",data.directive,[],'required maxlength="1200"')+
 '<button class="btn primary">Publish directive</button></form>');
}
function opsFormPayload(form){
 const data=Object.fromEntries(new FormData(form).entries());
 for(const key of ["amount","quantity","minutes","xp","skillXp","pay","weekly","requiredUnits","income","sales"])if(key in data)data[key]=Number(data[key]);
 return data;
}
async function opsAction(action,data){
 if(opsPending)return;opsPending=true;
 try{
  const response=await opsRequest(action,data);
  flash="Command recorded successfully.";err="";
  if(action==="dice.roll")flash="Field roll recorded: "+JSON.stringify(response.result);
  await render();
 }catch(e){err=e.message;flash="";await render();}
 finally{opsPending=false;}
}
function bindOperations(){
 document.querySelectorAll("form[data-facility-action]").forEach(form=>form.addEventListener("submit",async e=>{
  e.preventDefault();if(opsPending)return;
  const action=form.dataset.facilityAction,values=opsFormPayload(form);
  if("quantity" in values)values.quantity=Number(values.quantity);
  opsPending=true;try{await opsFacilityRequest(action,values);flash="Facility record updated.";err="";await render();}
  catch(e){err=e.message;flash="";await render();}
  finally{opsPending=false;}
 }));
 document.querySelectorAll("[data-facility-submit]").forEach(b=>b.addEventListener("click",async()=>{
  if(!confirm("Confirm this Overseer decision?"))return;
  opsPending=true;try{await opsFacilityRequest(b.dataset.facilitySubmit,{id:b.dataset.id,approve:b.dataset.approve==="true"});flash="Decision recorded.";err="";await render();}
  catch(e){err=e.message;flash="";await render();}
  finally{opsPending=false;}
 }));
 const registration=window.opsRegistration;
 if(registration){
  const update=()=>{
   const remaining=registration.points-Object.values(registration.values).reduce((total,v)=>total+v-registration.base,0);
   const display=document.getElementById("ops-points-left");if(display)display.textContent=remaining;
   const submit=document.getElementById("ops-create-personnel");if(submit)submit.disabled=remaining!==0||!opsState?.assignedName;
   for(const [k,v] of Object.entries(registration.values)){
    const output=document.getElementById("ops-stat-"+k);if(output)output.textContent=v;
   }
  };
  document.querySelectorAll("[data-ops-attr]").forEach(b=>b.addEventListener("click",()=>{
   const key=b.dataset.opsAttr,delta=Number(b.dataset.delta),current=registration.values[key];
   const available=registration.points-Object.values(registration.values).reduce((total,v)=>total+v-registration.base,0);
   if(current+delta<registration.base||current+delta>registration.max||(delta>0&&available<=0))return;
   registration.values[key]+=delta;update();
  }));
  const reset=document.querySelector("[data-ops-reset]");if(reset)reset.addEventListener("click",()=>{
   for(const key of opsAttributes)registration.values[key]=registration.base;update();
  });
  update();
 }
 document.querySelectorAll("form[data-ops-action]").forEach(form=>form.addEventListener("submit",async e=>{
  e.preventDefault();
  if(opsPending)return;
  let action=form.dataset.opsAction;
  let data=opsFormPayload(form);
  if(action==="character.create"){data={profession:data.profession,attributes:window.opsRegistration?.values||{}};}
  if(action==="project.contribute")data={projectId:data.projectId,item:data.item,quantity:Number(data.quantity)};
  if(action==="credits.transfer")data.key=crypto.randomUUID();
  if(action==="overseer.stipend")data.key=crypto.randomUUID();
  if(action==="taxes.update")data={income:data.income,sales:data.sales};
  if(action==="task.publish" && data.id){action="task.update";data.version=Number(data.version);}
  else if(action==="task.publish")delete data.status;
  if(action==="employment.set")data.profession=(opsState?.overseer?.members||[]).find(x=>x.discord_id===data.discordId)?.profession_id||"carpenter";
  await opsAction(action,data);
 }));
 document.querySelectorAll("[data-ops-submit]").forEach(button=>button.addEventListener("click",async()=>{
  const action=button.dataset.opsSubmit,id=button.dataset.id;
  if(["project.finalize","award.approve"].includes(action)&&!confirm("Confirm this Overseer operation?"))return;
  const data=action==="session.start"?{campaignId:id}:action==="task.review.request"?{id,note:"Field report submitted for review."}:{id};
  await opsAction(action,data);
 }));
 document.querySelectorAll("[data-ops-campaign-state]").forEach(button=>button.addEventListener("click",async()=>{
  await opsAction("campaign.state",{id:button.dataset.id,state:button.dataset.opsCampaignState});
 }));
 function fillTemplate(id){
  const template=(opsState?.overseer?.taskTemplates||[]).find(t=>t.id===id);
  const form=document.getElementById("ops-task-editor");if(!form)return;
  const values=template?{id:template.id,version:template.version,title:template.title,description:template.description,
   profession:template.profession_id||"",completionType:template.completion_type,minutes:template.duration_minutes,
   xp:template.character_xp,skillXp:template.profession_xp,pay:template.pay_credits,status:template.status}:{id:"",version:"",title:"",description:"",profession:"carpenter",completionType:"timer",minutes:15,xp:35,skillXp:25,pay:350,status:"published"};
  for(const [k,v] of Object.entries(values)){const el=form.elements.namedItem(k);if(el)el.value=v??"";}
 }
 const select=document.querySelector('[name="template"]');if(select)select.addEventListener("change",()=>fillTemplate(select.value));
 document.querySelectorAll("[data-ops-edit-template]").forEach(b=>b.addEventListener("click",()=>{
  fillTemplate(b.dataset.opsEditTemplate);
  document.getElementById("ops-task-editor")?.scrollIntoView({behavior:"smooth",block:"start"});
 }));
 const reset=document.getElementById("ops-reset-task");if(reset)reset.addEventListener("click",()=>fillTemplate(""));
}
