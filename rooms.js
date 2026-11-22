// Собрано tools/build_pages.py из online/navigation.mjs, rules.mjs, worker.mjs. Не правь вручную.
(function () {
"use strict";
let DUEL_MAP = null; const GAME_HTML = "";
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  clear() { this.k.length = 0; this.v.length = 0; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop(); const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) { let c = i * 2 + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const prepared = new WeakMap();

// Reuse the game's eight-direction land pathfinder on its actual walkable terrain.
function createPlanner(map) {
  const NAVN=map.nav.width, NAVC=map.size/NAVN, HALF=map.size/2;
  const cost=Uint8Array.from(atob(map.nav.cost),ch=>ch.charCodeAt(0));
  const DX8=[1,-1,0,0,1,1,-1,-1],DZ8=[0,0,1,-1,1,-1,1,-1];
  const NAV={stamp:0,g:new Float32Array(cost.length),vis:new Uint32Array(cost.length),cl:new Uint32Array(cost.length),from:new Int32Array(cost.length),heap:new MinHeap()};
  const navIdx=(x,z)=>Math.floor((z+HALF)/NAVC)*NAVN+Math.floor((x+HALF)/NAVC);
  const navCX=i=>-HALF+(i%NAVN+.5)*NAVC,navCZ=i=>-HALF+(Math.floor(i/NAVN)+.5)*NAVC;
  const isPass=(x,z)=>Number.isFinite(x)&&Number.isFinite(z)&&Math.abs(x)<HALF&&Math.abs(z)<HALF&&cost[navIdx(x,z)]>0;
  function lineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) { const t = i / n; if (!cost[navIdx(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)]) return false; }
    return true;
  }
  function findPath(sx, sz, tx, tz) {
    if (!isPass(sx,sz) || !isPass(tx,tz)) return null;
    const s = navIdx(sx,sz), t = navIdx(tx,tz);
    const exact = isPass(tx, tz);
    if (s === t) return [[exact ? tx : navCX(t), exact ? tz : navCZ(t)]];
    if (exact && cost[navIdx(sx, sz)] && lineClear(sx, sz, tx, tz)) return [[tx, tz]];
    const st = ++NAV.stamp, g = NAV.g, vis = NAV.vis, cl = NAV.cl, from = NAV.from, heap = NAV.heap; heap.clear();
    const txc = t % NAVN, tzc = (t / NAVN) | 0;
    const hf = c => { const dx = Math.abs(c % NAVN - txc), dz = Math.abs(((c / NAVN) | 0) - tzc); return dx + dz - 0.5858 * Math.min(dx, dz); };
    g[s] = 0; vis[s] = st; from[s] = -1; heap.push(hf(s), s);
    let found = false, iter = 0;
    while (heap.size) {
      const c = heap.pop(); if (cl[c] === st) continue; cl[c] = st; if (c === t) { found = true; break; }
      if (++iter > NAVN * NAVN * 0.7) break;
      const cx = c % NAVN, cz = (c / NAVN) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX8[k], nz = cz + DZ8[k]; if (nx < 0 || nz < 0 || nx >= NAVN || nz >= NAVN) continue;
        const n = nz * NAVN + nx; if (!cost[n] || cl[n] === st) continue;
        if (k >= 4 && (!cost[cz * NAVN + nx] || !cost[nz * NAVN + cx])) continue;
        const ng = g[c] + (k >= 4 ? 1.4142 : 1) * (cost[n] / 16);
        if (vis[n] !== st || ng < g[n]) { g[n] = ng; vis[n] = st; from[n] = c; heap.push(ng + hf(n), n); }
      }
    }
    if (!found) return null;
    const pts = []; for (let c = t; c !== -1; c = from[c]) pts.push([navCX(c), navCZ(c)]); pts.reverse();
    pts[0] = [sx, sz]; if (exact) pts[pts.length - 1] = [tx, tz];
    const out = []; let a = 0;
    while (a < pts.length - 1) {
      let b = Math.min(pts.length - 1, a + 40);
      while (b > a + 1 && !lineClear(pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }
  return {findPath,isPass};
}
function terrainPlanner(map) {
  if(!prepared.has(map))prepared.set(map,createPlanner(map));
  return prepared.get(map);
}

class RoomError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
function rule(ok,message,status){if(!ok)throw new RoomError(message,status);}
function nationOf(map,id){const n=map.nations.find(n=>n.id===id);rule(n,'Выбери страну из списка.');return n;}
function realm(nation,ai=false){
  return {nation:nation.id,name:nation.name,ai,alive:true,gold:15,food:18,people:7,hireAt:0,farmers:[]};
}
const reserved=(s,i)=>!!s.hostOnly&&i===1;
function note(s,text){s.log.push(text);if(s.log.length>20)s.log.shift();}
function province(owner=-1){return {owner,troops:owner<0?0:6,farm:owner>=0,mine:false,build:null,trainAt:0};}
function createWorld(map,nation,seed=1){
  const n=nationOf(map,nation);
  return {v:3,stage:'lobby',era:n.era,seed:seed>>>0,elapsed:0,clockAt:0,winner:null,nextFarmer:1,nextArmy:1,
    players:[realm(n),null],provinces:map.regions.map(()=>province()),armies:[],log:[]};
}
function pickNeighbors(pool,seed){
  const list=pool.slice();let x=seed>>>0;
  for(let j=list.length-1;j>0;j--){x=(Math.imul(x,1664525)+1013904223)>>>0;const k=x%(j+1);[list[j],list[k]]=[list[k],list[j]];}
  return list;
}
function startWorld(s,id,map,now){
  rule(s.stage==='lobby','Оба места уже заняты.',409);
  const n=nationOf(map,id);
  rule(n.era===s.era && id!==s.players[0].nation,'Выбери другую страну той же эпохи.');
  const rest=pickNeighbors(map.nations.filter(v=>v.era===n.era && v.id!==id && v.id!==s.players[0].nation),s.seed);
  s.players[1]=realm(n);
  for(let i=2;i<map.capitals;i++){const p=realm(rest[i-2],true);p.thinkAt=8+i*2;s.players.push(p);}
  for(let i=0;i<s.players.length;i++)s.provinces[i]=province(i);
  s.stage='play';s.clockAt=now;installForces(s,map,now,true);cityInstall(s,map,true);
  note(s,s.players[0].name+' и '+s.players[1].name+' основали столицы. На материке '+s.players.length+' держав.');
}
function pay(p,gold,food,people=0){
  rule(p.gold>=gold && p.food>=food && p.people>=people,'Не хватает запасов или свободных жителей.');
  p.gold-=gold;p.food-=food;p.people-=people;
}
const FIELD_KINDS={inf:{speed:6,range:7,period:2,damage:2},arch:{speed:6.4,range:28,period:3,damage:1.9}};
function spawnField(s,owner,kind,count,site,map,position){
  const rally=position||map.nav.rally[site],ground=terrainPlanner(map);
  let [x,z]=rally;
  if(!position){
    for(let i=0;i<18;i++){
      const r=3*Math.sqrt(i),a=i*2.4,px=rally[0]+Math.cos(a)*r,pz=rally[1]+Math.sin(a)*r;
      if(ground.isPass(px,pz)&&!s.armies.some(q=>Math.hypot(q.x-px,q.z-pz)<5)){x=px;z=pz;break;}
    }
  }
  const home=map.regions[site];
  const q={id:s.nextArmy++,owner,kind,count,hp:count*10,x,z,yaw:Math.atan2(x-home.x,z-home.z),
    speed:FIELD_KINDS[kind].speed,path:[],pi:0,goal:null,fighting:null,fireAt:0};
  s.armies.push(q);return q;
}
// Used by the authoritative clock and the client between snapshots.
function marchPosition(q,distance){
  let x=q.x,z=q.z,yaw=q.yaw,pi=q.pi;
  while(distance>0 && pi<q.path.length){
    const [tx,tz]=q.path[pi],dx=tx-x,dz=tz-z,length=Math.hypot(dx,dz);
    if(length>.001)yaw=Math.atan2(dx,dz);
    if(length>distance){x+=dx*distance/length;z+=dz*distance/length;break;}
    x=tx;z=tz;distance-=length;pi++;
  }
  return {x,z,yaw,pi};
}
function routeTo(q,x,z,map){
  const path=terrainPlanner(map).findPath(q.x,q.z,x,z);
  if(!path)return false;
  q.path=path;q.pi=0;return true;
}
function stand(q){q.path=[];q.pi=0;q.goal=null;q.fighting=null;}
function orderField(s,owner,a,map){
  const ids=a.units||[a.unit];
  rule(Array.isArray(ids)&&ids.length>0&&ids.length<=32&&new Set(ids).size===ids.length,'Выбери отряд.');
  const units=ids.map(id=>s.armies.find(q=>q.id===id&&q.owner===owner));
  rule(units.every(Boolean),'Выбери свой действующий отряд.');
  if(a.type==='stop'){units.forEach(stand);return;}
  if(a.type==='equip'){
    const fresh=units.filter(q=>!q.equipped);rule(fresh.length,'Вооружение уже улучшено.');
    cityPay(s.players[owner],{arms:4*fresh.length});for(const q of fresh)q.equipped=true;return;
  }
  let x,z,goal;
  if(a.type==='attack'){
    const enemy=s.armies.find(q=>q.id===a.enemy&&q.owner!==owner);
    rule(enemy,'Выбери вражеский отряд.');x=enemy.x;z=enemy.z;goal={type:'attack',id:enemy.id};
  }else if(a.type==='capture'){
    const i=a.province;rule(Number.isInteger(i)&&map.regions[i]&&s.provinces[i].owner!==owner&&!reserved(s,i),'Выбери свободную или чужую территорию.');
    [x,z]=map.nav.rally[i];goal={type:'capture',province:i};
  }else{
    x=a.x;z=a.z;rule(terrainPlanner(map).isPass(x,z),'Укажи проходимую сушу.');goal={type:'move'};
  }
  const orders=units.map((q,i)=>{
    let tx=x,tz=z;
    if(goal.type==='move'&&i){const d=4*Math.sqrt(i),a=i*2.4;if(terrainPlanner(map).isPass(x+d*Math.cos(a),z+d*Math.sin(a))){tx=x+d*Math.cos(a);tz=z+d*Math.sin(a);}}
    const path=terrainPlanner(map).findPath(q.x,q.z,tx,tz);
    rule(path,'До этой точки нельзя дойти по суше.');
    return {q,path,goal:{...goal,x:tx,z:tz}};
  });
  for(const {q,path,goal} of orders){q.path=path;q.pi=0;q.goal=goal;q.fighting=null;}
}
function captureSite(s,q,i){
  const r=s.provinces[i],former=r.owner;
  if(former===q.owner){stand(q);return;}
  r.owner=q.owner;r.troops=1;r.build=null;r.trainAt=0;delete r.drill;stand(q);
  const winner=s.players[q.owner],loser=s.players[former];
  if(former>=0&&i===former&&loser.alive){
    loser.alive=false;loser.farmers=[];
    for(const v of s.provinces)if(v.owner===former){v.owner=q.owner;v.trainAt=0;v.build=null;delete v.drill;}
    note(s,winner.name+' занимает столицу державы «'+loser.name+'».');
    const alive=s.players.flatMap((p,k)=>p.alive||p.pending?[k]:[]);
    if(alive.length===1||!s.players[0].alive&&!s.players[1].alive){s.stage='done';s.winner=alive.length===1?alive[0]:null;}
  }else if(q.owner<2||former===0||former===1)note(s,winner.name+' занимает территорию.');
  for(const b of s.sites||[])b.owner=s.provinces[b.province].owner;
}
function stepForces(s,map){
  const damage=new Map();
  for(const q of s.armies){
    if(q.hp<=0||!s.players[q.owner].alive)continue;
    const spec=FIELD_KINDS[q.kind];
    let goal=q.goal, target=goal?.type==='attack'?s.armies.find(v=>v.id===goal.id&&v.hp>0&&s.players[v.owner].alive):null;
    if(goal?.type==='attack'&&!target){stand(q);goal=null;}
    const dist=e=>Math.hypot(e.x-q.x,e.z-q.z);
    if(target&&dist(target)>spec.range&&(q.pi>=q.path.length||Math.hypot(target.x-goal.x,target.z-goal.z)>12)&&s.elapsed%3===q.id%3){
      if(routeTo(q,target.x,target.z,map)){goal.x=target.x;goal.z=target.z;}
    }
    let enemy=target&&dist(target)<=spec.range?target:null;
    if(!enemy&&goal?.type!=='move'){
      let best=spec.range+.001;
      for(const e of s.armies)if(e.owner!==q.owner&&e.hp>0&&s.players[e.owner].alive){
        const d=dist(e);if(d<best){best=d;enemy=e;}
      }
    }
    q.fighting=enemy?.id??null;
    if(enemy){
      q.yaw=Math.atan2(enemy.x-q.x,enemy.z-q.z);
      if(q.fireAt<=s.elapsed){q.fireAt=s.elapsed+spec.period;damage.set(enemy.id,(damage.get(enemy.id)||0)+q.count*spec.damage*(q.equipped?1.25:1));}
      continue;
    }
    if(q.pi<q.path.length)Object.assign(q,marchPosition(q,q.speed));
    if(q.pi<q.path.length)continue;
    q.path=[];q.pi=0;
    if(goal?.type==='move'){
      stand(q);
      const i=map.nav.rally.findIndex(([x,z],i)=>s.provinces[i].owner!==q.owner&&!reserved(s,i)&&Math.hypot(q.x-x,q.z-z)<12);
      if(i>=0)q.goal={type:'capture',province:i};
    }
    if(q.goal?.type==='capture'){
      const i=q.goal.province,r=s.provinces[i],[x,z]=map.nav.rally[i];
      if(r.owner===q.owner){stand(q);continue;}
      if(Math.hypot(q.x-x,q.z-z)>9){routeTo(q,x,z,map);continue;}
      if(r.troops<=0){captureSite(s,q,i);continue;}
      if(q.fireAt<=s.elapsed){
        damage.set(q.id,(damage.get(q.id)||0)+Math.min(8,r.troops));
        r.troops=Math.max(0,r.troops-Math.max(1,Math.ceil(q.count/3)));q.fireAt=s.elapsed+2;
      }
    }
  }
  for(const q of s.armies){q.hp=Math.max(0,q.hp-(damage.get(q.id)||0));q.count=Math.ceil(q.hp/10);}
  s.armies=s.armies.filter(q=>q.count>0&&s.players[q.owner].alive);
}
function recruit(s,seat,r,kind='inf'){
  rule(Object.hasOwn(FIELD_KINDS,kind),'Выбери пехоту или лучников.');
  rule(!r.trainAt,'Здесь уже собирают отряд.');
  pay(s.players[seat],kind==='arch'?7:5,6);
  r.drill={kind,count:8};r.trainAt=s.elapsed+(kind==='arch'?14:12);
}
function think(s,seat,map){
  const p=s.players[seat],base=s.provinces[seat];
  p.thinkAt=s.elapsed+11+(seat*7+s.elapsed)%8;
  if(s.elapsed%3!==0)cityAI(s,map,seat);
  const troops=s.armies.filter(q=>q.owner===seat);
  const idle=troops.find(q=>!q.goal&&!q.fighting);
  if(idle&&s.elapsed-s.fieldSince>30){
    const goals=new Set(troops.filter(q=>q.goal?.type==='capture').map(q=>q.goal.province));
    const candidates=new Set(s.provinces.flatMap((r,i)=>r.owner===seat?map.regions[i].adj:[]));
    let best=-1,score=Infinity;
    for(const i of candidates){
      const r=s.provinces[i];
      if(r.owner===seat||goals.has(i)||reserved(s,i))continue;
      // Neighbours expand into free land while the two players establish their cities.
      if(r.owner>=0&&s.elapsed-s.fieldSince<(r.owner<2?900:480))continue;
      const [x,z]=map.nav.rally[i],d=Math.hypot(idle.x-x,idle.z-z)+(r.owner>=0?420:0);
      if(d<score){best=i;score=d;}
    }
    if(best>=0){orderField(s,seat,{type:'capture',unit:idle.id,province:best},map);return;}
  }
  const fresh=troops.filter(q=>!q.equipped);
  if(fresh.length&&p.arms>=4*fresh.length+2)orderField(s,seat,{type:'equip',units:fresh.slice(0,32).map(q=>q.id)},map);
  const cap=Math.min(7,3+Math.floor(s.provinces.filter(r=>r.owner===seat).length/5));
  if(troops.length<cap&&!base.trainAt&&p.gold>=9&&p.food>=6&&s.sites.some(b=>b.type==='barracks'&&b.owner===seat&&b.ready<=s.elapsed))recruit(s,seat,base,troops.length%2?'arch':'inf');
}
function installForces(s,map,now,fresh){
  const oldArmies=s.armies||[];s.armies=[];s.nextArmy=1;s.fieldSince=s.elapsed;s.v=3;
  if(s.stage!=='play')return s;
  s.clockAt=now;
  for(const a of oldArmies){
    if(!s.players[a.owner]?.alive)continue;
    const n=map.regions.length,pts=map.routes[n+a.from][n+a.to];if(!pts?.length)continue;
    const length=pts.reduce((d,p,i)=>i?d+Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1]):0,0);
    const fraction=Math.max(0,Math.min(1,(s.elapsed-a.start)/Math.max(1,a.until-a.start)));
    const spot=marchPosition({x:pts[0][0],z:pts[0][1],yaw:0,pi:1,path:pts},length*fraction);
    const where=terrainPlanner(map).isPass(spot.x,spot.z)?[spot.x,spot.z]:map.nav.rally[a.from];
    const q=spawnField(s,a.owner,'inf',a.count,a.from,map,where);
    const [x,z]=map.nav.rally[a.to];
    orderField(s,a.owner,s.provinces[a.to].owner===a.owner?{type:'move',unit:q.id,x,z}:{type:'capture',unit:q.id,province:a.to},map);
  }
  for(const [i,p] of s.players.entries()){
    if(!p?.alive||s.provinces[i].owner!==i)continue;
    const base=s.provinces[i],count=fresh?8:Math.max(0,base.troops-1);
    if(count||!s.armies.some(q=>q.owner===i))spawnField(s,i,'inf',count||3,i,map);
    base.troops=Math.min(1,base.troops);
  }
  return s;
}

function simulationSecond(s,map){
  s.elapsed++;
  for(const [i,r] of s.provinces.entries()){
    if(r.build&&r.build.until<=s.elapsed){r[r.build.type]=true;r.build=null;}
    if(r.trainAt&&r.trainAt<=s.elapsed){
      if(r.owner>=0&&s.players[r.owner].alive)spawnField(s,r.owner,r.drill?.kind||'inf',r.drill?.count||3,i,map);
      r.trainAt=0;delete r.drill;
    }
  }
  stepForces(s,map);
  if(s.stage!=='play')return;
  cityTick(s,map);
  for(const [seat,p] of s.players.entries())if(p.alive&&p.ai&&s.elapsed>=p.thinkAt)think(s,seat,map);
}
// While any player is connected the clock advances continuously. A long empty session sleeps.
function wakeRivals(s,map){
  let woke=0;
  for(let i=2;i<s.players.length;i++){
    const p=s.players[i];if(!p?.pending)continue;
    p.pending=false;p.alive=true;p.thinkAt=s.elapsed+8+i*2;woke++;
    if(s.provinces[i].owner<0){s.provinces[i]=province(i);spawnField(s,i,'inf',8,i,map);}
    else p.alive=false;
  }
  if(woke)note(s,'Соседние державы вступают в игру.');
}
function advanceWorld(s,map,now){
  if(s.stage!=='play')return 0;
  if(s.hostOnly)wakeRivals(s,map);
  const raw=Math.floor((now-s.clockAt)/1000),steps=Math.max(0,Math.min(75,raw));if(!steps)return 0;
  for(let i=0;i<steps&&s.stage==='play';i++)simulationSecond(s,map);
  s.clockAt=raw>steps?now: s.clockAt+steps*1000;return steps;
}
const eraNeed=p=>p.cityEra===0?{gold:400,science:300,pop:35}:{gold:800,science:600,pop:60};
function eraReady(p,map){
  const discoveries=map.city.tech.filter(t=>t.era===p.cityEra&&p.tech.includes(t.id)).length;
  return p.cityEra<2&&discoveries>=3&&p.pop>=eraNeed(p).pop;
}
function advanceEra(s,p){const req=eraNeed(p);cityPay(p,{gold:req.gold,science:req.science});p.cityEra++;note(s,p.name+' вступает в новую эпоху.');}
function command(s,seat,a,map){
  rule(s.stage==='play','Партия сейчас не принимает приказы.',409);
  const p=s.players[seat];rule(p && seat<2 && p.alive,'Твоя столица перешла другой державе.',403);
  if(a.type==='build'){cityBuild(s,map,seat,a);return;}
  if(a.type==='hire'){cityHire(s,map,seat,a.role||'farmer');return;}
  if(a.type==='assign'){cityAssign(s,map,seat,a);return;}
  if(a.type==='research'){
    const t=map.city.tech.find(t=>t.id===a.tech&&t.era<=p.cityEra);rule(t&&!p.tech.includes(t.id),'Это исследование недоступно.');
    p.study=t.id;return;
  }
  if(a.type==='advance'){
    rule(eraReady(p,map),'Для новой эпохи нужны три открытия и достаточно жителей.');
    advanceEra(s,p);return;
  }
  if(['move','attack','capture','stop','equip'].includes(a.type)){orderField(s,seat,a,map);return;}
  const i=a.province,r=s.provinces[i];rule(Number.isInteger(i)&&r?.owner===seat,'Выбери собственную территорию.');
  if(a.type==='levy'){
    rule(s.sites.some(b=>b.owner===seat&&b.type==='barracks'&&b.ready<=s.elapsed),'Сначала построй казарму.');
    recruit(s,seat,r,a.kind||'inf');
  }
  else if(a.type==='sortie'){
    rule(r.troops>1,'Здесь осталась только стража.');
    spawnField(s,seat,'inf',r.troops-1,i,map);r.troops=1;
  }
  else throw new RoomError('Неизвестный приказ.');
}
function migrateWorld(old,map,seed,now){
  if(old.stage==='lobby')return openKingdom(map,old.players[0].nation,seed,now);
  if(old.v===3)return cityInstall(old,map,false);
  if(old.v===2)return cityInstall(installForces(old,map,now,false),map,false);
  const next=createWorld(map,old.players[0].nation,seed);
  startWorld(next,old.players[1].nation,map,now);
  const match=map.legacy,oldN=old.provinces.length,n=map.regions.length;
  const node=id=>id>=oldN?n+id-oldN:match[id];
  old.provinces.forEach((r,i)=>{const j=match[i];if(j==null)return;
    Object.assign(next.provinces[j],{owner:r.owner,troops:r.troops,farm:!!r.farm,mine:!!r.mine});});
  for(let i=0;i<2;i++){
    const p=next.players[i],before=old.players[i];
    Object.assign(p,{food:before.food,gold:before.gold,people:before.people});
    p.farmers=before.farmers.map(u=>{
      const f={id:u.id,status:u.status,node:node(u.node)};
      if(f.status==='walk'){
        f.target=node(u.target);const remaining=Math.max(0,Math.ceil((u.until-now)/1000));
        if(!remaining){f.node=f.target;f.status=next.provinces[f.target].owner===i?'work':'idle';delete f.target;}
        else{f.start=-Math.min(86400,Math.max(0,Math.floor((now-u.start)/1000)));f.until=remaining;}
      }
      return f;
    });
  }
  next.nextFarmer=Math.max(old.nextFarmer||1,...next.players.flatMap(p=>p.farmers.map(f=>f.id+1)));
  next.armies=[];
  if(old.stage==='done'){next.stage='done';next.winner=old.winner;if(old.winner===0||old.winner===1)next.players[1-old.winner].alive=false;}
  note(next,'Державы продолжают игру в реальном времени.');
  delete next.cityVersion;return cityInstall(installForces(next,map,now,false),map,false);
}

function openKingdom(map,nation,seed,now){
  const s=createWorld(map,nation,seed),other=map.nations.find(n=>n.era===s.era&&n.id!==nation);
  startWorld(s,other.id,map,now);s.hostOnly=true;
  s.players[1].alive=false;s.players[1].pending=true;s.provinces[1]=province();
  s.armies=s.armies.filter(q=>q.owner!==1);
  s.log=[s.players[0].name+' основывает столицу. Соседние державы уже растут; место для друга ждёт его.'];return s;
}
function enterKingdom(s,nation,map,now){
  if(s.stage==='lobby'){startWorld(s,nation,map,now);return;}
  rule(s.hostOnly&&s.stage==='play','Оба места уже заняты.',409);
  const twin=s.players.find((p,i)=>i>1&&p.nation===nation);
  if(twin){   // страну друга занимал ИИ — тот берёт другую свободную страну той же эпохи
    const used=new Set(s.players.map(p=>p.nation)),spare=map.nations.find(n=>n.era===s.era&&!used.has(n.id)&&n.id!==nation);
    rule(spare,'Эта страна уже есть на материке. Выбери другую.');
    const old=twin.name;twin.nation=spare.id;twin.name=spare.name;note(s,old+' теперь зовётся «'+spare.name+'».');
  }
  const other=createWorld(map,s.players[0].nation,s.seed);startWorld(other,nation,map,now);
  s.players[1]=other.players[1];
  s.provinces[1]=province(1);spawnField(s,1,'inf',8,1,map);
  for(const b of s.sites)if(b.province===1)b.owner=1;
  s.hostOnly=false;s.fieldSince=s.elapsed;note(s,s.players[1].name+' основывает столицу. На материке '+s.players.filter(p=>p.alive).length+' держав.');
}
const cityCache=new WeakMap();
const CITY_RES=['food','wood','stone','metal','arms','gold','science'];
function cityTerrain(map){
  if(cityCache.has(map))return cityCache.get(map);
  const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const heights=new Int16Array(bytes(map.city.height).buffer);
  const grid={heights,regions:bytes(map.city.regions),forest:bytes(map.city.forest),walk:bytes(map.nav.cost)};
  cityCache.set(map,grid);return grid;
}
function cityRegion(map,x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>=map.size/2||Math.abs(z)>=map.size/2)return -1;
  const n=map.city.grid,ix=Math.round((x/map.size+.5)*(n-1)),iz=Math.round((z/map.size+.5)*(n-1));
  return cityTerrain(map).regions[iz*n+ix];
}
function cityHeight(map,x,z){
  const n=map.city.grid,g=cityTerrain(map).heights;
  const u=Math.min(n-1.001,Math.max(0,(x/map.size+.5)*(n-1))),v=Math.min(n-1.001,Math.max(0,(z/map.size+.5)*(n-1)));
  const a=Math.floor(u),b=Math.floor(v),dx=u-a,dz=v-b,o=b*n+a;
  return (dx+dz<=1?g[o]+(g[o+1]-g[o])*dx+(g[o+n]-g[o])*dz:g[o+n+1]+(g[o+n]-g[o+n+1])*(1-dx)+(g[o+1]-g[o+n+1])*(1-dz))/32;
}
function cityCost(map,p,type){
  const def=map.city.buildings[type],k=map.city.cost[p.cityEra]||1;
  return Object.fromEntries(Object.entries(def.cost).map(([r,v])=>[r,Math.round(k*v)]));
}
function cityCanPay(p,cost){return Object.entries(cost).every(([k,v])=>p[k]>=v);}
function cityPlaceIssue(s,map,seat,type,x,z){
  if(!Object.hasOwn(map.city.buildings,type))return 'Выбери здание.';
  const d=map.city.buildings[type],i=cityRegion(map,x,z),r=s.provinces[i];
  if(!r||r.owner!==seat)return 'Строить можно на своей земле.';
  const grid=cityTerrain(map),w=map.nav.width,cell=Math.floor((z/map.size+.5)*w)*w+Math.floor((x/map.size+.5)*w);
  if(!grid.walk[cell])return 'Выбери проходимую сушу.';
  let lo=Infinity,hi=-Infinity;
  for(let k=0;k<9;k++){const a=k*Math.PI/4,dist=k===8?0:d.r*.85,h=cityHeight(map,x+Math.cos(a)*dist,z+Math.sin(a)*dist);lo=Math.min(lo,h);hi=Math.max(hi,h);}
  if(lo<.6)return 'Слишком близко к воде.';
  if(hi-lo>(d.flat||2.6)+d.r*.12)return 'Нужна более ровная площадка.';
  for(const [j,region] of map.regions.entries())if(s.provinces[j].owner>=0&&Math.hypot(region.x-x,region.z-z)<(j<map.capitals?18:7)+d.r+1.2)return 'Оставь место у стен поселения.';
  for(const b of s.sites)if(Math.hypot(b.x-x,b.z-z)<map.city.buildings[b.type].r+d.r+1.2)return 'Слишком близко к другому зданию.';
  const deposits=map.city.deposits;
  if(deposits.some(dp=>Math.hypot(dp.x-x,dp.z-z)<7+d.r*.7))return 'На этом месте залежь. Поставь здание рядом.';
  if(d.need==='trees'&&grid.forest[cell]<8)return 'Лагерь лесорубов ставят рядом с лесом.';
  if((d.need==='iron'||d.need==='stone')&&!deposits.some(dp=>dp.kind===d.need&&Math.hypot(dp.x-x,dp.z-z)<30))return d.need==='iron'?'Рядом нужна залежь железа.':'Рядом нужна залежь камня.';
  return '';
}
function citySiteName(map,p,type){const n=map.city.buildings[type].name;return Array.isArray(n)?n[p.cityEra]||n[0]:n;}
function cityWorkerPose(u,t){
  if(!u.path?.length||u.status!=='walk')return [u.x,u.z,0];
  let distance=u.length*Math.max(0,Math.min(1,(t-u.start)/Math.max(.001,u.until-u.start))),[x,z]=[u.x,u.z],yaw=0;
  for(const [a,b] of u.path){const dx=a-x,dz=b-z,L=Math.hypot(dx,dz);if(L>.001)yaw=Math.atan2(dx,dz);if(L>distance)return [x+dx*distance/L,z+dz*distance/L,yaw];distance-=L;x=a;z=b;}
  return [x,z,yaw];
}
// End of shared placement and movement helpers.
function cityPay(p,cost){rule(cityCanPay(p,cost),'Для этого не хватает ресурсов.');for(const [k,v] of Object.entries(cost))p[k]-=v;}
function cityCreateSite(s,map,owner,type,x,z,rot,finished=false){
  const d=map.city.buildings[type];
  const b={id:s.nextSite++,owner,type,x,z,rot,province:cityRegion(map,x,z),start:s.elapsed,ready:finished?s.elapsed:s.elapsed+d.time};
  s.sites.push(b);return b;
}
function cityBuild(s,map,owner,a){
  const p=s.players[owner],x=Math.round(a.x*10)/10,z=Math.round(a.z*10)/10;
  rule(typeof a.x==='number'&&typeof a.z==='number'&&Number.isFinite(x)&&Number.isFinite(z),'Укажи место на карте.');
  const issue=cityPlaceIssue(s,map,owner,a.building,x,z);rule(!issue,issue);
  cityPay(p,cityCost(map,p,a.building));return cityCreateSite(s,map,owner,a.building,x,z,Number.isFinite(a.rot)?a.rot%(2*Math.PI):0);
}
function cityHire(s,map,seat,role){
  const p=s.players[seat];rule(role==='farmer'||role==='worker','Выбери профессию жителя.');
  rule(p.hireAt<=s.elapsed,'Следующий житель ещё готовится.');rule(p.people>=1,'Нужен свободный житель. Построй жильё, чтобы город рос.');
  const [x,z]=map.nodes[map.regions.length+seat];p.people--;p.hireAt=s.elapsed+20;
  const u={id:s.nextFarmer++,role,status:'idle',x,z,site:null};p.farmers.push(u);return u;
}
function cityAssign(s,map,seat,a){
  const p=s.players[seat],u=p.farmers.find(f=>f.id===a.unit),b=s.sites.find(v=>v.id===a.site);
  rule(u,'Выбери своего жителя.');rule(b&&b.owner===seat&&b.ready<=s.elapsed,'Выбери готовую постройку в своих владениях.');
  const d=map.city.buildings[b.type];rule(d.jobs&&d.prod&&(u.role==='farmer')===(b.type==='farm'),'Выбери место для этой профессии.');
  rule(u.site!==b.id||u.status==='idle','Этот житель уже назначен сюда.');
  rule(p.farmers.filter(w=>w!==u&&w.site===b.id&&w.status!=='idle').length<d.jobs,'Все рабочие места заняты.');
  const [x,z]=cityWorkerPose(u,s.elapsed),planner=terrainPlanner(map);
  let route;for(const offset of [0,.65,-.65,1.4,-1.4,Math.PI]){
    const a=b.rot+offset,r=d.r+.8;route=planner.findPath(x,z,b.x+Math.sin(a)*r,b.z+Math.cos(a)*r);if(route)break;
  }
  if(!route)route=planner.findPath(x,z,b.x,b.z);rule(route,'Житель не может дойти по суше до этого здания.');
  let px=x,pz=z,len=0;for(const [a,b] of route){len+=Math.hypot(a-px,b-pz);px=a;pz=b;}
  Object.assign(u,{x,z,site:b.id,path:route,length:len,start:s.elapsed,until:s.elapsed+Math.max(2,Math.ceil(len/6)),status:'walk'});
}
function cityInstall(s,map,fresh=false){
  if(s.cityVersion)return s;
  s.cityVersion=1;s.sites=[];s.nextSite=1;
  for(const p of s.players){
    if(!p)continue;const k=s.era?1.1+.3*s.era:1;
    if(fresh){p.gold=120*k;p.food=150*k;p.people=8;}
    Object.assign(p,{wood:240*k,stone:100*k,metal:40*k,arms:0,science:0,pop:p.people+p.farmers.length,capacity:12,cityEra:s.era,tech:[],study:null});
  }
  for(const [i,r] of s.provinces.entries()){
    if(!fresh&&r.owner>=0)for(const type of ['farm','mine'])if(r[type]||r.build?.type===type){
      const [x,z]=map.regions[i][type],b=cityCreateSite(s,map,r.owner,type,x,z,0,true);
      if(r.build?.type===type){b.start=r.build.start;b.ready=r.build.until;}
    }
    r.mine=false;r.farm=false;r.build=null;
  }
  for(const [seat,p] of s.players.entries())if(p)for(const u of p.farmers){
    u.role='farmer';
    const b=s.sites.find(v=>v.type==='farm'&&v.province===(u.status==='walk'?u.target:u.node)&&v.owner===seat);
    const [x,z]=map.nodes[u.node]||map.nodes[map.regions.length+seat];u.x=x;u.z=z;u.site=null;
    if(b&&u.status==='work'){u.x=b.x;u.z=b.z;u.site=b.id;}
    else if(b&&u.status==='walk'){u.status='idle';cityAssign(s,map,seat,{unit:u.id,site:b.id});}
    else u.status='idle';
    delete u.node;delete u.target;
  }
  return s;
}
function cityMultiplier(map,p,k){
  const bonus=map.city.bonuses[p.nation];let value=1+(bonus?.[0]===k?bonus[1]:0);
  for(const tech of map.city.tech)if(p.tech.includes(tech.id))value+=Number(tech.fx[k])||0;
  return value;
}
function cityTick(s,map){
  for(const b of s.sites)b.owner=s.provinces[b.province].owner;
  for(const [seat,p] of s.players.entries()){
    if(!p?.alive)continue;
    for(const u of p.farmers){
      if(u.site!=null&&!s.sites.some(b=>b.id===u.site&&b.owner===seat)){
        const [x,z]=cityWorkerPose(u,s.elapsed);Object.assign(u,{x,z,site:null,status:'idle',path:[]});
      }
      if(u.status==='walk'&&u.until<=s.elapsed){const [x,z]=u.path.at(-1);Object.assign(u,{x,z,status:'work',path:[]});}
    }
    const sites=s.sites.filter(b=>b.owner===seat&&b.ready<=s.elapsed),houses=sites.filter(b=>b.type==='house').length;
    const stock=300+400*sites.filter(b=>b.type==='store').length;
    p.capacity=12+houses*map.city.house[p.cityEra];
    const rates={food:.4-.035*p.pop,wood:.35,stone:0,metal:0,arms:0,gold:.3,science:.1};
    const workers=new Map();for(const u of p.farmers)if(u.status==='work')workers.set(u.site,(workers.get(u.site)||0)+1);
    for(const b of sites){
      const d=map.city.buildings[b.type],crew=workers.get(b.id)||0;if(!d.prod||!crew)continue;
      let factor=crew/d.jobs*map.city.prod[p.cityEra];
      for(const [k,n] of Object.entries(d.use||{}))factor=Math.min(factor,p[k]/n);
      for(const [k,n] of Object.entries(d.use||{}))p[k]=Math.max(0,p[k]-factor*n);
      for(const [k,n] of Object.entries(d.prod))rates[k]+=factor*n*cityMultiplier(map,p,k);
    }
    for(const k of CITY_RES){const limit=k==='science'||k==='gold'?99999:Math.max(stock,p[k]);p[k]=Math.round(Math.max(0,Math.min(limit,p[k]+rates[k]))*1000)/1000;}
    const old=Math.floor(p.pop);
    if(p.food>=1&&p.pop<p.capacity)p.pop=Math.min(p.capacity,p.pop+(.13+.012*houses)*cityMultiplier(map,p,'grow'));
    p.people+=Math.floor(p.pop)-old;
    const study=p.study&&map.city.tech.find(t=>t.id===p.study);
    if(study&&p.science>=study.cost){p.science-=study.cost;p.tech.push(study.id);p.study=null;note(s,p.name+' завершает исследование «'+study.n+'».');}
  }
}
function cityAI(s,map,seat){
  const p=s.players[seat],owned=s.sites.filter(b=>b.owner===seat),roles=p.farmers;
  if(!p.study){const open=map.city.tech.filter(t=>t.era<=p.cityEra&&!p.tech.includes(t.id)),t=open.find(t=>t.era===p.cityEra)||open[0];if(t)p.study=t.id;}
  if(eraReady(p,map)&&cityCanPay(p,{gold:eraNeed(p).gold+60,science:eraNeed(p).science})){advanceEra(s,p);return;}
  const queue=['farm','house','lumber','barracks','market','school','forge','quarry','mine','store'];
  const available=owned.find(b=>b.ready<=s.elapsed&&map.city.buildings[b.type].prod&&!roles.some(u=>u.site===b.id));
  if(available&&p.hireAt<=s.elapsed&&p.people>0){
    const role=available.type==='farm'?'farmer':'worker',u=roles.find(u=>u.role===role&&u.status==='idle')||cityHire(s,map,seat,role);
    cityAssign(s,map,seat,{unit:u.id,site:available.id});return;
  }
  const type=queue.find(type=>!owned.some(b=>b.type===type)&&cityCanPay(p,cityCost(map,p,type)));if(!type)return;
  const base=map.regions[seat];for(let k=0;k<125;k++){
    const rad=28+Math.sqrt(k)*7,a=k*2.4+seat*.8,x=Math.round(base.x+Math.cos(a)*rad),z=Math.round(base.z+Math.sin(a)*rad);
    if(!cityPlaceIssue(s,map,seat,type,x,z)){cityBuild(s,map,seat,{building:type,x,z,rot:a});break;}
  }
}

// The portable game and the fixed terrain routes are embedded by build.mjs.
const ROOM_HEX=/^[0-9a-f]{20}$/, KEY_HEX=/^[0-9a-f]{64}$/;
function result(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
function fail(s,status){throw new RoomError(s,status);}
async function fingerprint(token){
  if(!KEY_HEX.test(token||''))return '';
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
async function payload(req){
  if(!req.headers.get('content-type')?.startsWith('application/json'))fail('Нужен запрос JSON.',415);
  if(Number(req.headers.get('content-length'))>2048)fail('Приказ слишком большой.',413);
  const text=await req.text();if(text.length>2048)fail('Приказ слишком большой.',413);
  let obj;try{obj=JSON.parse(text);}catch{fail('Некорректный приказ.',400);}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))fail('Некорректный приказ.',400);return obj;
}
async function handle(req,env){
  const url=new URL(req.url);
  const landing=url.pathname==='/' || url.pathname==='/index.html';
  const invitation=/^\/join\/[a-f0-9]{20}\/[a-f0-9]{64}\/?$/.test(url.pathname);
  if((req.method==='GET'||req.method==='HEAD') && (landing||invitation)){
    return new Response(req.method==='HEAD'?null:GAME_HTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':invitation?'no-store':'no-cache','Referrer-Policy':'no-referrer','X-Robots-Tag':invitation?'noindex, nofollow':'index, follow','X-Content-Type-Options':'nosniff'}});
  }
  if(req.method==='GET' && url.pathname==='/api/health')return result({game:'derzhava',rooms:!!env.BUCKET});
  if(req.method==='GET' && (url.pathname==='/api/map-v4'||url.pathname==='/api/map-v3'||url.pathname==='/api/map-v2'||url.pathname==='/api/map'))return new Response(JSON.stringify(DUEL_MAP),{headers:{'Content-Type':'application/json','Cache-Control':url.pathname==='/api/map-v4'?'public, max-age=3600':'no-store'}});
  if(url.pathname==='/favicon.ico')return new Response(null,{status:204});
  const match=/^\/api\/rooms\/([a-f0-9]{20})(?:\/(create|join|claim|invite|act))?$/.exec(url.pathname);
  if(!match)fail('Страница не найдена.',404);
  const id=match[1],op=match[2]||'read';
  if(!ROOM_HEX.test(id) || (['read','invite'].includes(op)?req.method!=='GET':req.method!=='POST'))fail('Метод не поддерживается.',405);
  return roomEndpoint(req,env,id,op);
}
async function roomEndpoint(req,env,id,op){
  if(!env.BUCKET)fail('Хранилище комнат временно недоступно.',503);
  const key='rooms/v1/'+id+'.json',seed=parseInt(id.slice(0,8),16);
  const [auth,invite,first]=await Promise.all([
    fingerprint((req.headers.get('Authorization')||'').replace(/^Bearer /,'')),
    fingerprint(req.headers.get('X-Invite')),fingerprint(req.headers.get('X-First'))]);
  const body=['create','join','act'].includes(op)?await payload(req):null;
  for(let attempt=0;attempt<8;attempt++){
    const object=await env.BUCKET.get(key),room=object?await object.json():null,now=Date.now();
    const view=(r,seat)=>result({id,seat,rev:r.rev,now,state:r.state});
    if(op==='create'&&!room){
      const inv=await fingerprint(body.invite),claim=body.first===undefined?'':await fingerprint(body.first);
      if(!auth||!inv||auth===inv||body.first!==undefined&&(!claim||claim===inv||claim===auth))fail('Не удалось создать ключ комнаты.',400);
      const created={rev:1,invite:inv,keys:[auth,null],last:[[],[]],state:openKingdom(DUEL_MAP,body.nation,seed,now)};
      if(claim)created.first=claim;
      if(await env.BUCKET.put(key,JSON.stringify(created),{onlyIf:new Headers({'If-None-Match':'*'})}))return view(created,0);
      continue;
    }
    if(!room)fail('Комната не найдена. Проверь ссылку.',404);
    let seat=auth?room.keys.indexOf(auth):-1;
    if(op==='create'&&seat!==0)fail('Этот адрес комнаты занят.',409);
    if(op==='invite'||op==='join'){
      if(seat<0){
        if(!invite||invite!==room.invite)fail('Для входа нужна полная ссылка-приглашение.',403);
        if(room.keys[1])fail('Оба места в этой комнате уже заняты.',409);
        if(op==='invite')return result({host:room.state.players[0].nation});
        if(!auth||auth===invite)fail('Для входа нужен ключ игрока.',401);
      }
    }else if(op==='claim'){
      if(seat===1)fail('Этот браузер уже играет за вторую страну.',409);
      if(seat<0 && (!auth||!first||first!==room.first||auth===first||auth===room.invite))fail('Первое место уже занято или ссылка неполная.',403);
    }else if(seat<0)fail('Этот браузер не занял место в комнате.',403);
    if((op==='read'||op==='act')&&req.headers.get('X-Derzhava-Version')!=='4')fail('Обнови страницу, чтобы увидеть своё войско и отдавать приказы прямо на карте. Твоя партия сохранена.',426);
    let change=room.state.v!==3||!room.state.cityVersion||room.state.stage==='lobby';
    if(change){room.state=migrateWorld(room.state,DUEL_MAP,seed,now);room.last=[[],[]];}
    const steps=advanceWorld(room.state,DUEL_MAP,now);
    if(op==='join'&&seat<0){
      enterKingdom(room.state,body.nation,DUEL_MAP,now);seat=1;room.keys[1]=auth;change=true;
    }else if(op==='claim'&&seat<0){seat=0;room.keys[0]=auth;delete room.first;change=true;}
    else if(op==='act'){
      if(!/^[a-f0-9]{24}$/.test(body.request||''))fail('Неизвестный номер приказа.',400);
      const seen=room.last[seat];
      if(!seen.includes(body.request)){
        command(room.state,seat,body,DUEL_MAP);seen.push(body.request);if(seen.length>40)seen.shift();change=true;
      }
    }
    if(!change && steps<12)return view(room,seat);
    room.rev++;
    if(await env.BUCKET.put(key,JSON.stringify(room),{onlyIf:{etagMatches:object.etag}}))return view(room,seat);
  }
  fail('Сейчас поступило много приказов. Повтори действие.',409);
}

const ROOM_WORKER = {async fetch(req,env){
  try{return await handle(req,env);}catch(e){return result({error:e instanceof RoomError?e.message:'Сервер комнаты временно недоступен.'},e instanceof RoomError?e.status:503);}
}};

window.DerzhavaRooms = { setMap(m) { DUEL_MAP = m; }, fetch: (req, env) => ROOM_WORKER.fetch(req, env) };
})();
