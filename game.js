'use strict';
(() => {
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const images={}, END=10000, BASE=120;
let w=0,h=0,dpr=1,last=performance.now(),clock=0,toastTimer,finishTimer;
let state, camera={x:0,y:0,scale:1},drag=null,particles=[],rockets=[],lastLaunch=0;
let greetingSparks=[], lastGreeting=0;
const SHELTER_X=6000, STONE_X=4890;
let audioCtx=null, master=null, soundOn=true, weatherAudio=null, lastBoom=0;
const soundNodes=new Set();
const voices=new HikingVoices(speaker=>{
 const el=$('speaker');el.hidden=!speaker;el.textContent=speaker?'♪ '+speaker:'';
 if(master&&audioCtx)master.gain.setTargetAtTime(soundOn?(speaker?.12:.45):0,audioCtx.currentTime,.08);
},()=>state);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function ground(x){
 if(x<=9400)return -x*.47+22*Math.sin(x/170);
 if(x<=9780)return (-9400*.47+22*Math.sin(9400/170))+(x-9400)/380*(-4540-(-9400*.47+22*Math.sin(9400/170)));
 if(x<=10160)return -4540-(x-9780)*20/380;
 if(x<=10500)return -4560+(x-10160)*70/340;
 return -4490+(x-10500)*.68+12*Math.sin((x-10500)/130);
}
function unlockAudio(){
 voices.unlock();
 try{if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();master=audioCtx.createGain();master.gain.value=soundOn?.45:0;master.connect(audioCtx.destination)}if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{})}catch(e){/* Silent mode if audio is unavailable. */}
 summitMusic.load();
}
// One looping source, using the AudioContext unlocked by the player's first tap.
const summitMusic={buffer:null,loading:null,source:null,gain:null,offset:0,startedAt:0,starts:0,
 load(){
  if(this.loading||!audioCtx)return;
  const bytes=Uint8Array.from(atob(window.SUMMIT_SONG_BASE64),c=>c.charCodeAt(0));
  this.loading=audioCtx.decodeAudioData(bytes.buffer).then(buffer=>{this.buffer=buffer;this.sync();}).catch(()=>{this.loading=null;});
 },
 sync(){
  if(!state?.done||!soundOn){this.stop();return;}
  if(!this.buffer||this.source||!audioCtx)return;
  const source=audioCtx.createBufferSource(),gain=audioCtx.createGain();
  source.buffer=this.buffer;source.loop=true;gain.gain.value=.22;
  source.connect(gain);gain.connect(audioCtx.destination);
  this.source=source;this.gain=gain;this.startedAt=audioCtx.currentTime;this.starts++;
  source.start(0,this.offset%this.buffer.duration);
 },
 stop(reset=false){
  if(this.source){
   this.offset=(this.offset+audioCtx.currentTime-this.startedAt)%this.buffer.duration;
   this.source.stop();this.source.disconnect();this.gain.disconnect();this.source=null;this.gain=null;
  }
  if(reset){this.offset=0;this.starts=0;}
 }
};
window.addEventListener('pagehide',()=>summitMusic.stop());
window.addEventListener('pageshow',()=>summitMusic.sync());
function trackNode(node){soundNodes.add(node);node.onended=()=>{soundNodes.delete(node);node.disconnect()};return node}
function tone(freq,duration=.3,volume=.04,delay=0){
 if(!audioCtx||!soundOn||document.hidden)return;
 const t=audioCtx.currentTime+delay,o=trackNode(audioCtx.createOscillator()),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.025);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(master);o.start(t);o.stop(t+duration+.05);o.onended=()=>{soundNodes.delete(o);o.disconnect();g.disconnect()};
}
function noise(duration,volume,cutoff){
 if(!audioCtx||!soundOn||document.hidden)return null;
 const n=audioCtx.sampleRate*duration,buffer=audioCtx.createBuffer(1,n,audioCtx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<n;i++)data[i]=Math.random()*2-1;
 const source=trackNode(audioCtx.createBufferSource()),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain(),t=audioCtx.currentTime;
 filter.type='lowpass';filter.frequency.value=cutoff;source.buffer=buffer;source.connect(filter);filter.connect(gain);gain.connect(master);gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(volume,t+.08);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);source.start();source.onended=()=>{soundNodes.delete(source);source.disconnect();filter.disconnect();gain.disconnect()};return source;
}
function stopRain(){if(weatherAudio){try{weatherAudio.stop()}catch(e){}weatherAudio=null}}
function startRain(seconds){stopRain();weatherAudio=noise(seconds,.09,2600)}
function stopSounds(){stopRain();for(const n of soundNodes){try{n.stop()}catch(e){}}soundNodes.clear()}
function viewMusic(){[523.25,659.25,783.99,1046.5,987.77,783.99,659.25].forEach((f,i)=>tone(f,1.1,.045,i*.43))}
function campSound(){
 audio.play('camp');
}
// Category dispatch, shared loud-effect gate and per-animal cooldowns.
const audio={busyUntil:0,counts:{},play(category){
 if(!audioCtx||!soundOn||document.hidden)return false;
 const now=performance.now();
 if(now<this.busyUntil||voices.current)return false;
 this.counts[category]=(this.counts[category]||0)+1;
 if(category==='hare'){tone(760,.15,.045);tone(430,.25,.035,.12);this.busyUntil=now+700;}
 else if(category==='thunder'){noise(1.2,.12,160);this.busyUntil=now+1500;}
 else if(category==='firework'){noise(.36,.10,950);this.busyUntil=now+650;}
 else if(category==='wind')noise(2.2,.025,420);
 else if(category==='camp'){noise(.9,.024,1500);tone(784,.35,.026);tone(1047,.4,.023,.3);this.busyUntil=now+650;}
 return true;
}};
function speechBubble(now){
 const el=$('speaker'),key=voices.current;
 if(!key||voices.player.paused||!soundOn||$('event').open||$('restartDialog').open){el.hidden=true;return;}
 const kind=key==='bearProtest'?'bear':key==='goatNoBear'?'goat':key==='calm'||key==='view'?'katya':key;
 const name=window.VOICE_CLIPS[key]?.speaker||'';
 let x=state.visualX,y;
 if(kind==='bear')x-=95;
 if(kind==='goat')x-=155;
 if(kind==='hare')x=Math.abs(x+52-STONE_X)<85?x-48:x+52;
 if(state.story?.type==='choice'&&state.story.id===kind&&!state[kind])x=state.visualX+110;
 y=ground(x)-(kind==='katya'?(state.done?160:124):kind==='hare'?66:82);
 let sx=w/2+(x-camera.x)*camera.scale,sy=h*(state.done?finalAnchor():.63)+(y-camera.y)*camera.scale;
 if(!state.done)sy=Math.min(sy,h*.63+(ground(state.visualX)-150-camera.y)*camera.scale);
 if(state.effect?.kind==='view'&&kind==='katya'){sx=w*.78;sy=h*.88-110;}
 el.textContent=key==='view'?'Катя · Вау!':name+' · '+(key==='katya'?'напевает':key==='calm'?'успокаивает':'говорит');
 el.hidden=false;const bw=el.offsetWidth,bh=el.offsetHeight;
 const left=clamp(sx,bw/2+7,w-bw/2-7),top=clamp(sy-8,bh+8,h-12);
 el.style.left=left+'px';el.style.top=top+'px';
 el.style.setProperty('--tail-x',clamp(sx-left+bw/2,12,bw-12)+'px');
 el.dataset.speaker=kind;
}
function companion(kind,x,now){
 let y=ground(x),angle=0;
 if(state.move&&!reduced)y-=Math.abs(Math.sin(clock*10+(kind==='bear'?0:1)))*(kind==='hare'?9:4);
 if(voices.current===kind||(kind==='bear'&&voices.current==='bearProtest')||(kind==='goat'&&voices.current==='goatNoBear'))angle=Math.sin(clock*17)*.12;
 if(kind==='hare'&&state.effect?.kind==='hareFall'){
  const t=(now-state.effect.start)/1700;
  angle=t<.28?1.3*t/.28:t<.62?1.3:1.3*Math.max(0,(1-t)/.38);
  y=ground(x)-Math.sin(Math.min(1,t/.28)*Math.PI)*8;
 }
 ctx.save();ctx.translate(x,y);ctx.rotate(angle);
 if(kind==='bear')bear(0,0,1.05);else if(kind==='goat')goat(0,0);else hare(0,0);
 ctx.restore();
 
}

document.addEventListener('visibilitychange',()=>{voices.visibility(document.hidden);if(!audioCtx)return;if(document.hidden)audioCtx.suspend().catch(()=>{});else audioCtx.resume().catch(()=>{})});
function reset(){
 summitMusic.stop(true);stopSounds();voices.reset();audio.busyUntil=0;audio.counts={};
 clearTimeout(finishTimer);clearTimeout(toastTimer);$('event').close();$('restartDialog').close();
 state={x:0,visualX:0,steps:0,bear:false,goat:false,hare:false,boost:0,penalty:0,pauseUntil:0,weatherUntil:0,weatherStart:0,done:false,zoom:false,pan:0,ready:false,events:new Set(),ambient:new Set(),choices:[],walking:0,clicks:0,queue:[],move:null,effect:null,sheltering:false,weatherTone:0,hareFell:false,animalNext:0,animalLast:{bear:0,goat:0},animalCue:null,finishedAt:0,campNext:0,story:null,finalWalk:null};
 particles=[];rockets=[];lastLaunch=0;greetingSparks=[];lastGreeting=0;
 ['toast','finishControls','greeting','campTools'].forEach(id=>$(id).hidden=true);
 $('normalControls').hidden=false;$('app').classList.remove('final');$('zoom').textContent='＋ Рассмотреть лагерь';
 state.ready=Object.values(images).length===15;$('step').disabled=!state.ready;
 camera={x:0,y:ground(0),scale:1};ui();
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200)}
function pace(){return (BASE+(state.bear?38.4:0)+(state.goat?24:0)+(state.hare?18:0)+(state.boost>0?72:0))*(state.penalty>0?.5:1)}
function ui(){
 const p=state.x/END*100;$('percent').textContent=Math.floor(p)+'%';$('fill').style.width=p+'%';document.querySelector('.track').setAttribute('aria-valuenow',Math.floor(p));
 $('steps').textContent=state.steps;$('team').textContent='В пути: Катя'+(state.bear?' · Медведь':'')+(state.goat?' · Козёл':'')+(state.hare?' · Заяц':'');
 $('pace').textContent=state.boost>0?`☕ Бонус: ${state.boost} шагов`:state.penalty>0?`Обход: ${state.penalty} шагов`:state.bear||state.goat||state.hare?'С командой быстрее':'Обычный темп';
 $('stage').textContent=p<24?'01 / Хвойный склон':p<50?'02 / Выше облаков':p<76?'03 / Характер горы':p<100?'04 / Уже пахнет тортом':'05 / Семья на вершине';
 $('step').disabled=!state.ready||state.done||$('event').open||performance.now()<state.pauseUntil||!!state.move||state.queue.length>0||!!state.story;
 if(state.story)$('step').innerHTML='Слушаем… <span>♪</span>';else if(performance.now()<state.pauseUntil)$('step').innerHTML=state.sheltering?'Под навесом… <span>☂</span>':state.effect?.kind==='hareFall'?'Подождём зайца… <span>🐇</span>':state.effect?'Смотрим… <span>♡</span>':'Привал… <span>☕</span>';else $('step').innerHTML=state.move?'Шагаем… <span>↗</span>':'Сделать шаг <span>↗</span>';
 if(state.finalWalk)$('pace').textContent=`До праздника: ${10-state.finalWalk.completed} шагов`;
 const buddies=[state.bear?'медведь':null,state.goat?'козёл':null,state.hare?'заяц':null].filter(Boolean);
 $('status').textContent=buddies.length?'С Катей '+buddies.join(', ')+'. Экспедиция всё больше похожа на выездной зоопарк.':state.x<1400?'Торт сам себя на вершину не донесёт. Хотя…':state.x<5000?'Не спешим. У горы сегодня весь день свободен.':state.x<8500?'Каждый шаг приближает к вершине. И к десерту.':'Сверху доносится звон тарелок. Странное природное явление.';
}
function pause(seconds){state.pauseUntil=performance.now()+seconds*1000;ui()}
function weather(seconds=22){audio.play('wind');state.weatherStart=performance.now();state.weatherUntil=state.weatherStart+seconds*1000;state.weatherTone=0;startRain(seconds)}
const events=[
 {id:'bear',at:1700,icon:'🐻',title:'У тропы новый охранник',text:'Медведь проверяет рюкзаки. Особенно тщательно — отделение со сладким.',choices:[
  {label:'Обойти медведя',note:'6 коротких шагов по длинной дороге',act(){state.penalty=6;toast('Медведь остался охранять пустую тропу. Делаем крюк.')}},
  {label:'Угостить мёдом и чаем',note:'Медведь идёт с Катей · +32% к базовому шагу',act(){state.bear=true;toast('Медведь: «Я вообще-то тоже собирался на день рождения».')}}]},
 {id:'hare',at:2950,icon:'🐇',title:'Заяц с очень важным делом',text:'Он опаздывает на морковный банкет. Услышав слово «торт», резко меняет планы.',choices:[
  {label:'Поделиться морковкой',note:'Заяц идёт до вершины · +15% к базовому шагу',act(){state.hare=true;toast('Заяц принят в команду. Назначен главным по быстрым ушам.')}},
  {label:'Пожелать удачи и идти дальше',note:'Пауза 2 секунды, затем 8 ускоренных шагов',act(){state.boost=8;pause(2);toast('Заяц умчался на морковный банкет. Катя прибавила шаг!')}}]},
 {id:'rest',at:4300,icon:'☕',title:'Камень предлагает присесть',text:'Такой удобный камень просто обязан быть включён в маршрут.',choices:[
  {label:'Отдохнуть с термосом',note:'Пауза 3 секунды, затем 12 шагов с бонусом +60%',act(){state.boost=12;pause(3);toast('Три секунды на чай. Потом включится чайный турборежим.')}},
  {label:'Идти дальше',note:'Без паузы, обычный темп',act(){toast('Камень остался без компании. Вершина стала чуть ближе.')}}]},
 {id:'weather',at:5900,icon:'⛈',title:'У погоды творческий кризис',text:'Дождь? Снег? Ветер? «Всё сразу», — решила гора.',before:weather,choices:[
  {label:'Переждать под скалой',note:'Зайти под каменный навес и переждать грозу · 8 секунд',act(){state.sheltering=true;weather(8);pause(8);startMove(SHELTER_X-state.x,'shelter');toast('Под каменным навесом сухо. Гроза пошумит — и можно дальше.')}},
  {label:'Продолжать сквозь ветер',note:'Без остановки, но следующие 8 шагов вдвое короче',act(){weather();state.penalty=8;toast('Ветер дует обратно. Катя с направлением не согласна.')}}]},
 {id:'goat',at:7900,icon:'🐐',title:'Горный отдел контроля',text:'Козёл перегородил тропу. Пароль, кажется, «угощение».',choices:[
  {label:'Поделиться яблоком',note:'Козёл идёт с Катей · до вершины ещё 10 шагов',act(){state.goat=true;toast('Пропуск выдан. Вместе с пропуском выдан козёл.')}},
  {label:'Обойти по камням',note:'5 коротких шагов по обходной тропе',act(){state.penalty=5;toast('Козёл делает вид, что так и было задумано.')}}]}
];
const ambient=[{at:700,text:'📷 Красивый вид! Катя мысленно сделала уже 47 фотографий.'},{at:2200,text:'🥾 Катя споткнулась. Это была проверка гравитации. Работает.'},{at:4850,text:'🪨 Найден странный камень. По форме — почти кусок торта.'},{at:7000,text:'🧢 Ветер покусился на шапку. Шапка осталась в команде.'},{at:8750,text:'♪ С вершины доносится звон тарелок. Кажется, нас уже ждут!'},{at:9450,text:'🎂 Пахнет тортом. Совпадение? Катя так не думает.'}];
function beginEncounter(e){
 state.queue=[];state.events.add(e.id);
 state.story={type:'choice',id:e.id,phase:'waiting'};
 if(e.before)e.before();ui();
}
function updateStory(now){
 const story=state.story;if(!story||$('restartDialog').open||document.hidden)return;
 if(story.phase==='waiting'&&!voices.busy){
  if(story.type==='choice'&&['bear','hare','goat'].includes(story.id)){
   story.phase='choice';showEvent(events.find(e=>e.id===story.id));return;
  }
  story.phase='speaking';
  if(story.type==='view'){
   state.effect={kind:'view',start:now,end:now+4800};state.pauseUntil=now+4800;
   toast('Вау! ♡');viewMusic();
   voices.begin(['view'],()=>{if(state.story===story)story.phase='viewing';});
  }else{
   const keys=story.id==='bear'||story.id==='hare'?[story.id,'calm']:story.id==='goat'?['goat','katya']:['katya'];
   voices.begin(keys,()=>{
    if(state.story!==story)return;
    if(story.type==='joined'){
     state.story=null;
     if(story.id==='goat')beginFinalWalk();
     ui();
    }else{
     story.phase='choice';showEvent(events.find(e=>e.id===story.id));
    }
   });
  }
  ui();
 }
 if(story.type==='view'&&state.effect?.kind==='view'){
  if(story.phase==='speaking')state.effect.end=Math.max(state.effect.end,now+700);
  state.pauseUntil=state.effect.end;
  if(story.phase==='viewing'&&now>=state.effect.end){state.effect=null;state.pauseUntil=0;state.story=null;ui();}
 }
}
function showEvent(e){
 $('eventNumber').textContent=`ВСТРЕЧА ${events.indexOf(e)+1} ИЗ ${events.length}`;$('eventIcon').textContent=e.icon;$('eventTitle').textContent=e.title;$('eventText').textContent=e.text;$('choices').replaceChildren();
 e.choices.forEach((c,i)=>{
  const b=document.createElement('button');b.type='button';b.textContent=c.label;
  const small=document.createElement('small');small.textContent=c.note;b.append(small);
  b.onclick=()=>{
   if(!$('event').open)return;
   state.choices.push({event:e.id,choice:i});unlockAudio();c.act();$('event').close();
   const animal=['bear','hare','goat'].includes(e.id);
   state.story=animal&&state[e.id]?{type:'joined',id:e.id,phase:'waiting'}:null;
   if(state.story)$('toast').hidden=true;
   if(e.id==='goat'&&!state.goat)beginFinalWalk();
   voices.nextAt=performance.now()+6500;ui();$('step').focus();
  };
  $('choices').append(b);
 });
 $('event').showModal();ui();
}
function beginFinalWalk(){
 voices.silence();
 state.finalWalk={start:state.x,completed:0,stepsAtStart:state.steps,
  weights:Array.from({length:10},(_,n)=>n<state.penalty ? .5 : 1)};
}
// A click starts one physical step; bonuses are played as short extra steps.
function nextStop(){if(state.finalWalk)return END;return Math.min(END,state.hare&&!state.hareFell?3650:END,...events.filter(e=>!state.events.has(e.id)).map(e=>e.at),...ambient.filter(e=>!state.ambient.has(e.at)).map(e=>e.at))}
function startMove(distance,kind='walk'){
 const now=performance.now(),target=kind==='shelter'?state.x+distance:Math.min(state.x+distance,nextStop());
 if(target<=state.x)return;
 state.move={from:state.x,to:target,start:now,duration:kind==='shelter'?650:380,kind};state.walking=now+380;
 if(kind==='walk'||kind==='finalWalk')state.steps++;ui();
}
function step(){
 unlockAudio();
 if(!state.ready||state.done||state.move||state.queue.length||state.story||$('event').open||$('restartDialog').open||performance.now()<state.pauseUntil)return;
 state.clicks++;
 if(state.finalWalk){
  const f=state.finalWalk,weights=f.weights||Array(10).fill(1);
  const fraction=weights.slice(0,f.completed+1).reduce((a,b)=>a+b,0)/weights.reduce((a,b)=>a+b,0);
  const target=f.start+(END-f.start)*fraction;
  if(state.penalty)state.penalty--;if(state.boost)state.boost--;
  startMove(target-state.x,'finalWalk');return;
 }
 const multiplier=state.penalty>0?.5:1,bonus=pace()-BASE*multiplier;
 state.queue=[BASE*multiplier];if(bonus>0)state.queue.push(bonus/2,bonus/2);
 if(state.boost)state.boost--;if(state.penalty)state.penalty--;
 startMove(state.queue.shift());
}
function landed(){
 if(state.finalWalk){
  state.queue=[];state.finalWalk.completed++;
  if(state.finalWalk.completed===10){state.x=END;state.visualX=END;finish();}
  ui();return;
 }
 if(state.x>=END){state.queue=[];finish();ui();return}
 if(state.hare&&!state.hareFell&&state.x>=3650){
 state.hareFell=true;state.queue=[];const now=performance.now();state.effect={kind:'hareFall',start:now,end:now+1700};pause(1.7);audio.play('hare');toast('Заяц проверил тропу носом. Всё в порядке — идём дальше!');return;
 }
 const e=events.find(e=>state.x>=e.at&&!state.events.has(e.id));if(e){beginEncounter(e);return}
 const a=ambient.find(a=>state.x>=a.at&&!state.ambient.has(a.at));
 if(a){state.ambient.add(a.at);state.queue=[];toast(a.text);const now=performance.now();
  if(a.at===700){state.story={type:'view',phase:'waiting'};ui();return;}
  if(a.at===2200){state.effect={kind:'stumble',start:now,end:now+1100};pause(1.1)}
  if(a.at===4850){state.effect={kind:'stone',start:now,end:now+2400};pause(2.4);tone(740,.3,.025)}
  if(a.at===8750){state.effect={kind:'noise',start:now,end:now+3200};pause(1.4);tone(880,.16,.025);tone(1175,.22,.02,.22)}
 }
 ui();
}
function finish(){
 if(state.done)return;
 voices.silence();state.story=null;state.queue=[];state.done=true;state.campIntroPending=false;summitMusic.sync();campSound();state.finishedAt=performance.now();state.campNext=state.finishedAt+10000;state.weatherUntil=0;stopRain();lastGreeting=performance.now()-6000;state.zoom=false;state.pan=0;$('normalControls').hidden=true;$('finishControls').hidden=false;$('campTools').hidden=false;$('toast').hidden=true;clearTimeout(toastTimer);$('app').classList.add('final');
 $('sceneNote').textContent='Семья уже здесь. И торт тоже.';$('summary').textContent=`До вершины: ${state.clicks} нажатий, ${state.steps} шагов.`+(state.bear?' Медведь пришёл на праздник.':'')+(state.goat?' Козёл тоже в списке гостей.':'')+(state.hare?' Заяц прибежал за тортом.':'');
 finishTimer=setTimeout(()=>{$('greeting').hidden=false},5000);
}
// The same ground() function drives the terrain, the route and every character's feet.
function path(points,fill,stroke,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke()}}
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill()}
function line(x,y,x2,y2,color,width=2){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function text(t,x,y,size,color,align='center'){ctx.font=`bold ${size}px "Trebuchet MS", sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(t,x,y)}
function character(key,x,y,height){const im=images[key],m=CHARACTERS[key];if(!im)return;const [l,t,r,b]=m.box;let width=height*(r-l)/(b-t);const scale=height/(b-t);ctx.drawImage(im,x-width/2-l*scale,y-b*scale,im.width*scale,im.height*scale)}
function tree(x,size){const y=ground(x);line(x,y,x,y-size*.75,'#4b6557',5);for(let i=0;i<3;i++){const top=y-size+i*size*.21;path([[x,top],[x-size*(.23+i*.04),top+size*.52],[x+size*(.23+i*.04),top+size*.52]],i%2?'#4b7964':'#365e51')}}
function bear(x,y,size=1){ctx.save();ctx.translate(x,y);ctx.scale(size,size);ellipse(0,-24,27,23,'#775d44');ellipse(18,-46,20,19,'#8e7050');ellipse(6,-61,7,7,'#775d44');ellipse(30,-61,7,7,'#775d44');ellipse(29,-42,13,9,'#bea177');ellipse(36,-45,5,4,'#352e27');ellipse(25,-52,2,2,'#1c2926');for(const dx of [-16,14]){line(dx,-14,dx+2,0,'#684f3d',10)}ctx.restore()}
function goat(x,y,size=1){ctx.save();ctx.translate(x,y);ctx.scale(size,size);ellipse(0,-23,22,13,'#ece9db');ellipse(20,-38,11,15,'#f8f1dc');line(15,-47,9,-63,'#8b7962',4);line(23,-48,28,-62,'#8b7962',4);line(15,-28,19,-19,'#b2b3a1',4);for(const dx of [-14,12])line(dx,-19,dx+3,0,'#63756a',4);ellipse(24,-40,2,2,'#253e37');line(-19,-27,-28,-35,'#ece9db',5);ctx.restore()}
function hare(x,y){ctx.save();ctx.translate(x,y);ellipse(0,-15,16,14,'#dacbbc');ellipse(12,-29,11,12,'#e7ddca');ellipse(8,-49,4,14,'#e7ddca');ellipse(17,-48,4,15,'#e7ddca');line(8,-57,8,-45,'#c39683',2);line(17,-57,17,-44,'#c39683',2);ellipse(16,-31,2,2,'#203b35');ellipse(23,-27,3,2,'#ac8570');ellipse(-15,-17,6,6,'#faf4e4');ellipse(9,-2,10,3,'#d1beaa');ctx.restore()}
const familyNames={'б.Нина':'б. Нина','бабане.п':'Бабане','бОля.б':'б. Оля','деде':'Деде','мама':'Таня','папа':'Лёша'};
function finalAnchor(){return h<350?.40:.48}
function familyLabels(){
 const font=w<600?13:16,boxes=[];
 // Individual name cards anchored below each moving person; no remote ribbon legend.
 family.forEach((entry,i)=>{
  const p=familyPose(i),sx=w/2+(p.x-camera.x)*camera.scale;
  const sy=h*finalAnchor()+(ground(p.x)-camera.y)*camera.scale;
  if(sx<0||sx>w)return;
  const label=familyNames[p.name]||p.name;
  const lines=label==='Антанос Петрович'?['Антанос','Петрович']:[label];
  ctx.font=`bold ${font}px "Trebuchet MS",sans-serif`;
  const bw=Math.max(...lines.map(t=>ctx.measureText(t).width))+14,bh=lines.length*(font+2)+12;
  let bx=clamp(sx-bw/2,3,w-bw-3),by=sy+10;
  const baseY=Math.min(sy+10,h-145);let found=false;
  for(let row=0;row<9&&!found;row++){
   for(const shift of [0,-bw*.55,bw*.55,-bw,bw,-bw*1.5,bw*1.5]){
    const x=clamp(sx-bw/2+shift,3,w-bw-3),y=baseY+row*(font+17);
    if(y+bh>h-3)continue;
    if(!boxes.some(b=>x<b.x+b.w+3&&x+bw+3>b.x&&y<b.y+b.h+3&&y+bh+3>b.y)){bx=x;by=y;found=true;break;}
   }
  }
  boxes.push({x:bx,y:by,w:bw,h:bh});
  ctx.fillStyle='#fff9e8f5';ctx.strokeStyle='#527568';ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(bx,by,bw,bh,8);ctx.fill();ctx.stroke();
  lines.forEach((line,j)=>text(line,bx+bw/2,by+font+6+j*(font+2),font,'#284c42'));
 });
}
const family=[
 ['Галя',9450,0,92],['Тоня',9510,0,73],['Маша',9580,0,96],
 ['б.Нина',9650,0,92],['бабане.п',9710,0,98],['Миша',9780,0,94],['Ира',9840,0,84],
 ['Коля',10280,0,82],['мама',10340,0,90],['папа',10410,0,98],['Саша',10470,0,100],
 ['деде',10540,0,92],['бОля.б',10600,0,96],['Антанос Петрович',10665,0,100]
];
function familyPose(i){
 const [name,base,,originalSize]=family[i],size=originalSize*1.18;
 if(!state.done)return {name,x:base,y:ground(base),size,tilt:0,jump:0,flip:0};
 const t=(performance.now()-state.finishedAt)/1000;
 if(reduced){const x=base+12*Math.sin(t+i);return {name,x,y:ground(x),size,tilt:Math.sin(t*2+i)*.035,jump:0,flip:0};}
 // Groups shuttle across the WHOLE camp, gather, then trade sides.
 const group=Math.floor(i/3),phase=t*.55+group*.83;
 const cluster=10030+440*Math.cos(phase);
 const gather=.35+.65*Math.abs(Math.sin(phase));
 const target=cluster+((i%3)-1)*64*gather+Math.sin(t*1.5+i)*22;
 const intro=clamp(t/2,0,1),x=base+(clamp(target,9440,10640)-base)*intro;
 // Repeated high hops, with a complete somersault on every fifth leap.
 const cycle=t*(.78+i%3*.08)+i*.31,step=Math.floor(cycle),p=cycle-step;
 const airborne=p>.12&&p<.88,q=clamp((p-.12)/.76,0,1);
 const flip=airborne&&(step+i)%5===0;
 const jump=airborne?Math.sin(q*Math.PI)*(flip?175:95+i%4*14):0;
 const rotation=flip?Math.PI*2*(q*q*(3-2*q)):(airborne?Math.sin(q*Math.PI*2)*.20:Math.sin(t*15+i)*.06);
 return {name,x,y:ground(x)-jump,size,tilt:rotation,jump,flip:flip?rotation:0};
}
function camp(){
 // A broad rounded crest, with natural groups around a tent, table and fire.
 const tx=9670,ty=ground(tx);path([[tx-94,ty],[tx-10,ty-124],[tx+94,ty]],'#d1a161','#654c38',2);path([[tx-10,ty-124],[tx+8,ty],[tx+94,ty]],'#b2764e');path([[tx-10,ty-96],[tx-45,ty],[tx+22,ty]],'#254b46');line(tx-115,ty+3,tx-10,ty-124,'#faf0cf');line(tx+120,ty+3,tx-10,ty-124,'#faf0cf');
 const bx=10165,by=ground(bx);line(bx-53,by-40,bx-48,by,'#795b42',7);line(bx+52,by-40,bx+46,by,'#795b42',7);ctx.fillStyle='#946949';ctx.fillRect(bx-68,by-46,136,9);ctx.fillStyle='#f7eac5';ctx.fillRect(bx-71,by-49,142,6);
 ctx.fillStyle='#db9781';ctx.fillRect(bx-27,by-71,54,22);ellipse(bx,by-71,27,7,'#fff6da');for(let i=-1;i<=1;i++){line(bx+i*13,by-75,bx+i*13,by-87,'#4e8b87',3);ellipse(bx+i*13,by-91,2.5,4,'#f8c24c')}
 const fx=10810,fy=ground(fx);line(fx-27,fy-2,fx+24,fy-11,'#80573c',9);line(fx-22,fy-13,fx+27,fy,'#684c37',8);const flicker=reduced?0:Math.sin(clock*9)*4;
 path([[fx-24,fy-7],[fx-20,fy-26],[fx-10,fy-21],[fx+flicker,fy-60],[fx+13,fy-33],[fx+21,fy-40],[fx+28,fy-7]],'#e99849');path([[fx-12,fy-6],[fx+3,fy-39],[fx+15,fy-6]],'#ffe491');
 [9705,10045,10450].forEach((x,i)=>{let y=ground(x);ctx.fillStyle=['#b97667','#5b9a94','#d6ab57'][i];ctx.fillRect(x-12,y-23,24,23);line(x,y-23,x,y,'#fff3c7',3);line(x-12,y-13,x+12,y-13,'#fff3c7',3);ellipse(x-4,y-27,4,3,'#f0d08e');ellipse(x+4,y-27,4,3,'#f0d08e')});
 const left=9570,right=10435;let ly=ground(left)-161,ry=ground(right)-173;line(left,ground(left),left,ly-8,'#637665',4);line(right,ground(right),right,ry-8,'#637665',4);
 const lights=[];for(let i=0;i<=28;i++){let t=i/28;lights.push([left+(right-left)*t,ly+(ry-ly)*t+Math.sin(t*Math.PI)*47])}path(lights,null,'#526c5d',2);lights.forEach(([x,y],i)=>{line(x,y,x,y+6,'#526c5d');ellipse(x,y+9,3,5,['#f5cf73','#d98870','#87b7a7'][i%3])});
 // Family artwork is only translated and proportionally scaled, never redrawn.
 // Large foreground cake, on the existing banquet table.
 ctx.fillStyle='#b96f63';ctx.fillRect(bx-40,by-79,80,29);ellipse(bx,by-79,40,10,'#fff3cc');
 ctx.fillStyle='#e4a78e';ctx.fillRect(bx-28,by-104,56,25);ellipse(bx,by-104,28,8,'#fff8e1');
 for(let i=-2;i<=2;i++){line(bx+i*10,by-106,bx+i*10,by-121,'#568f90',3);ellipse(bx+i*10,by-126,3,5+Math.sin(clock*7+i),'#ffc44c');}
 text('КАТЕ ♡',bx,by-61,13,'#fff8e1');
 // The launcher sits beside the waving family member.
 const rx=10580,ry2=ground(rx);line(rx-10,ry2,rx+1,ry2-26,'#6a837c',6);path([[rx-4,ry2-24],[rx+3,ry2-39],[rx+10,ry2-24]],'#c48762');
 const flagX=10095,flagY=ground(flagX);line(flagX,flagY,flagX,flagY-130,'#597264',4);path([[flagX,flagY-130],[flagX+74,flagY-120],[flagX,flagY-99]],'#ce8865');text('КАТЯ!',flagX+27,flagY-114,10,'#fff9e8');
 family.forEach((entry,i)=>{const p=familyPose(i);ctx.save();ctx.translate(p.x,p.y-p.size/2);ctx.rotate(p.tilt);character(p.name,0,p.size/2,p.size);ctx.restore();});
}
function shelter(){
 const x=SHELTER_X,y=ground(x);
 // Back wall and a cantilevered rock ceiling, joined to the uphill slope.
 path([[x-165,y-120],[x+102,y-155],[x+155,ground(x+155)],[x-152,ground(x-152)]],'#586d64');
 path([[x+103,y-156],[x+177,y-120],[x+196,ground(x+196)+30],[x+127,ground(x+127)]],'#778177','#506358',3);
 path([[x-185,y-152],[x-153,y-194],[x-44,y-201],[x+95,y-186],[x+177,y-120],[x+105,y-134],[x-35,y-148],[x-167,y-128]],'#8d9482','#53675d',3);
 path([[x-153,y-194],[x-44,y-201],[x+95,y-186],[x+26,y-175],[x-110,y-163]],'#adb09a');
 line(x-125,y-179,x-50,y-169,'#697d70',2);line(x+25,y-179,x+74,y-157,'#697d70',2);
}
function strangeStone(now){
 const x=STONE_X,y=ground(x);
 path([[x-20,y],[x-29,y-24],[x-9,y-43],[x+16,y-38],[x+27,y-11],[x+18,y]],'#a295ae','#5c6571',2);
 path([[x-29,y-24],[x-9,y-43],[x+4,y-20],[x+27,y-11]],'#c6b3bf');
 line(x-9,y-24,x+4,y-9,'#f5d58e',3);line(x+4,y-9,x+11,y-22,'#f5d58e',3);
 if(state.effect?.kind==='stone'){const phase=(now-state.effect.start)/300;for(let i=0;i<4;i++){let sx=x+Math.cos(phase+i*1.6)*38,sy=y-24+Math.sin(phase+i*1.6)*27;line(sx-4,sy,sx+4,sy,'#fff0ac',2);line(sx,sy-4,sx,sy+4,'#fff0ac',2)}}
}
function heart(x,y,size,color='#e17986'){
 ctx.save();ctx.translate(x,y);ctx.scale(size,size);ctx.beginPath();ctx.moveTo(0,.4);ctx.bezierCurveTo(-1,-.2,-.7,-1,.0,-.45);ctx.bezierCurveTo(.7,-1,1,-.2,0,.4);ctx.fillStyle=color;ctx.fill();ctx.restore();
}
function drawKatya(now,kx,ky){
 let tilt=0,bob=0;
 if(state.move&&(state.move.kind==='walk'||state.move.kind==='finalWalk')){
  const phase=clamp((now-state.move.start)/state.move.duration,0,1);bob=-Math.sin(phase*Math.PI)*(reduced?2:12);tilt=Math.sin(phase*Math.PI*2)*(reduced?.015:.105);
 }
 if(state.effect?.kind==='stumble'){
  const t=clamp((now-state.effect.start)/1100,0,1);tilt=Math.sin(t*Math.PI)*.34;bob=Math.sin(t*Math.PI)*5;
 }
 ctx.save();ctx.translate(kx,ky+bob);ctx.rotate(tilt);character('Катя.п',0,0,state.done?152:116);
 if(state.effect?.kind==='view'){
  const age=(now-state.effect.start)/1000;ctx.globalAlpha=Math.min(1,age*3,(state.effect.end-now)/600);
  // Small overlays only: original pixels are never edited.
  heart(-5,-62,4);heart(5,-62,4);
  for(let i=0;i<5;i++){let t=(age*.45+i*.2)%1;heart((i%2?1:-1)*(28+t*15),-64-t*43,6+t*2)}ctx.globalAlpha=1;
 }ctx.restore();
}
function summitNoise(now){
 if(state.effect?.kind!=='noise')return;
 const pulse=(now-state.effect.start)/500,ox=w*.86,oy=h*.30;
 for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(ox,oy,18+i*13+Math.sin(pulse)*3,24+i*14,0,Math.PI*.6,Math.PI*1.4);ctx.strokeStyle='#fff5b1';ctx.lineWidth=3;ctx.stroke()}
 text('♪',ox-12,oy-35,27,'#385e51');text('♫',ox+12,oy+25,24,'#385e51');
}
function terrain(){
 const left=camera.x-w/(2*camera.scale)-250,right=camera.x+w/(2*camera.scale)+250;
 const pts=[];for(let x=Math.floor(left/12)*12;x<=right+12;x+=12)pts.push([x,ground(x)]);
 const bottom=camera.y+h/camera.scale+400;path([...pts,[right+12,bottom],[left-12,bottom]],'#738b7a');
 for(let i=Math.floor(left/250);i<right/250;i++){let x=i*250+70,y=ground(x);path([[x,y+22],[x+190,y+Math.abs(Math.sin(i))*240+100],[x+250,bottom],[x-70,bottom]],i%2?'#7e927f':'#6e8577')}
 path(pts,null,'#d4c7a1',11);path(pts,null,'#f0e5c4',3);
 for(let i=Math.floor(left/210);i<right/210;i++){const x=i*210;if(x<8550&&x>50){if(i%3===0&&x<4900)tree(x,60+(i%4)*15);else {let y=ground(x);path([[x-13,y],[x-4,y-12],[x+9,y-9],[x+16,y]],'#8c9581')}}}
 if(left<6220&&right>5800)shelter();
 if(left<4930&&right>4850)strangeStone(performance.now());
 if(right>9450)camp();
}
let scenicPhoto=null;
const mountainImage=new Image();
mountainImage.onload=()=>{scenicPhoto=mountainImage};
mountainImage.src='гора.png';
function drawScenicPhoto(now){
 if(!scenicPhoto||state.effect?.kind!=='view')return;
 ctx.save();ctx.fillStyle='#173d39';ctx.fillRect(0,0,w,h);
 const scale=Math.min(w/scenicPhoto.width,h/scenicPhoto.height),pw=scenicPhoto.width*scale,ph=scenicPhoto.height*scale;
 ctx.drawImage(scenicPhoto,(w-pw)/2,(h-ph)/2,pw,ph);
 ctx.translate(w*.78,h*.88);ctx.scale(.85,.85);drawKatya(now,0,0);ctx.restore();
}
function background(){
 const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,'#a8d2d4');gradient.addColorStop(.65,'#e3eadd');gradient.addColorStop(1,'#f0e7cf');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
 const cloudiness=state.done?0:clamp((Math.sin(state.visualX/1050-1.5)+.25)*.8,0,.9);
 ctx.fillStyle=`rgba(78,107,124,${cloudiness*.3})`;ctx.fillRect(0,0,w,h);
 ctx.globalAlpha=1-cloudiness*.8;ellipse(w*.77,h*.2,29,29,'#fff2c7');ctx.globalAlpha=1;
 for(let i=0;i<8;i++){let x=((i*217+clock*9)%(w+250))-125,y=h*(.15+(i%3)*.075);ctx.globalAlpha=cloudiness;ellipse(x,y,110,24,'#a3b9bd');ellipse(x+35,y-17,61,32,'#bacacc');ctx.globalAlpha=1;}
 
 for(let layer=0;layer<3;layer++){
  const pts=[[-100,h]];for(let i=-2;i<=Math.ceil(w/190)+3;i++){let x=i*190-((camera.x*(.045+layer*.025))%190);let yy=h*(.48+layer*.13)+Math.sin(i*2.7+layer)*h*.10;pts.push([x,yy],[x+83,yy-75-layer*16])}pts.push([w+100,h]);path(pts,['#aec8be','#96b5a9','#7d9f92'][layer]);
 }
 for(let i=0;i<5;i++){let x=((i*359-camera.x*.025)%(w+250)+w+250)%(w+250)-120,y=h*(.2+(i%3)*.09);ellipse(x,y,68,12,'#ffffff40');ellipse(x+28,y-8,35,16,'#ffffff40')}
}
function drawWeather(now){
 if(now>=state.weatherUntil)return;
 const fade=Math.min(1,(state.weatherUntil-now)/1000,(now-state.weatherStart)/500);ctx.fillStyle=`rgba(34,56,67,${fade*.24})`;ctx.fillRect(0,0,w,h);ctx.globalAlpha=fade;
 ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);
 const roofY=ground(SHELTER_X)-133,sx=w/2+(SHELTER_X-158-camera.x)*camera.scale,sy=h*.63+(roofY-camera.y)*camera.scale;
 ctx.rect(sx,sy,265*camera.scale,210*camera.scale);ctx.clip('evenodd');
 for(let i=0;i<72;i++){let x=((i*77-clock*240)%(w+100)+w+100)%(w+100)-50,y=((i*193+clock*650)%(h+100))-50;line(x,y,x-12,y+25,'#e8f7f6aa',1.4)}
 for(let i=0;i<36;i++){let x=((i*101-clock*160)%(w+100)+w+100)%(w+100)-50,y=((i*53+clock*120)%(h+70))-35;ellipse(x,y,2.5,2.5,'#fff9ed')}
 for(let i=0;i<6;i++){let x=((clock*300+i*170)%(w+180))-180;line(x,70+i*h/7,x+100,60+i*h/7,'#ffffff55',2)}
 ctx.restore();
 const elapsed=(now-state.weatherStart)/1000;
 if(elapsed>1.5&&state.weatherTone===0){state.weatherTone=1;audio.play('thunder')}
 if(elapsed>4.2&&state.weatherTone===1){state.weatherTone=2;audio.play('thunder')}
 if(!reduced&&((elapsed>1.4&&elapsed<1.53)||(elapsed>4.1&&elapsed<4.23))){path([[w*.8,0],[w*.74,65],[w*.79,65],[w*.69,145]],null,'#fff3b5',4)}ctx.globalAlpha=1;
}
function launch(now){
 if(!state.done)return;
 if(now-lastLaunch>(reduced?1500:360)){lastLaunch=now;const sx=w/2+(10580-camera.x)*camera.scale,sy=h*finalAnchor()+(ground(10580)-camera.y-26)*camera.scale,ty=h*(.12+Math.random()*.23),vy=-260;rockets.push({x:sx,y:sy,ty,vy,vx:(w*(.12+Math.random()*.76)-sx)/((sy-ty)/260),color:['#bd625a','#e3a52f','#459da0','#ae74ae'][Math.floor(Math.random()*4)]})}
}
function fireworks(dt,now){
 launch(now);
 for(let i=rockets.length-1;i>=0;i--){let r=rockets[i];r.y+=r.vy*dt;r.x+=r.vx*dt;line(r.x-r.vx*.065,r.y-r.vy*.065,r.x,r.y,r.color,2);if(r.y<=r.ty){if(now-lastBoom>1100){lastBoom=now;audio.play('firework')}for(let j=0;j<64;j++){let a=j/64*Math.PI*2,sp=(j%2?65:100)+Math.random()*35;particles.push({x:r.x,y:r.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:2.1,total:2.1,c:r.color})}rockets.splice(i,1)}}
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=24*dt;p.vx*=Math.pow(.78,dt);ctx.globalAlpha=p.life/p.total;line(p.x-p.vx*.09,p.y-p.vy*.09,p.x,p.y,p.c,2);if(p.life>1.45)line(p.x,p.y,p.x+2,p.y+2,'#fffbed',2)}ctx.globalAlpha=1;
}
function letterFirework(now){
 if(now-lastGreeting>9000){
  lastGreeting=now;greetingSparks=[];
  const off=document.createElement('canvas');off.width=Math.round(w);off.height=Math.round(h);const c=off.getContext('2d');
  const size=Math.min(48,w/12);c.textAlign='center';c.font=`bold ${size}px "Trebuchet MS",sans-serif`;c.fillStyle='white';
  ['С ДНЁМ РОЖДЕНИЯ,','КАТЯ!'].forEach((t,i)=>c.fillText(t,w/2,h*.16+i*size*1.2));
  const data=c.getImageData(0,0,off.width,off.height).data,grid=w<600?3:4;
  for(let y=0;y<off.height;y+=grid)for(let x=0;x<off.width;x+=grid)if(data[(y*off.width+x)*4+3]>128)greetingSparks.push({x,y});
 }
 const age=(now-lastGreeting)/1000;if(age>6)return;
 const t=clamp(age/1.3,0,1),fade=age>4.5?(6-age)/1.5:1;
 ctx.save();ctx.globalAlpha=fade;ctx.shadowColor='#754320';ctx.shadowBlur=4;
 greetingSparks.forEach((p,i)=>{const x=w/2+(p.x-w/2)*t,y=h*.27+(p.y-h*.27)*t;const twinkle=reduced?1:.7+.3*Math.sin(clock*8+i);line(x,y,x+1.7,y+1.7,i%3?'#ffe9a0':'#fffdf0',2*twinkle)});
 ctx.restore();
}
function resize(){const box=canvas.getBoundingClientRect();w=box.width;h=box.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);if(state?.done)lastGreeting=performance.now()-10000}
function frame(now){
 voices.tick(now,{...state,paused:now<state.pauseUntil},$('event').open||$('restartDialog').open);updateStory(now);if(state.done&&now>state.campNext){state.campNext=now+12000+Math.random()*6000;audio.play('camp')}
 $('scene').classList.toggle('scenic',state.effect?.kind==='view');
 $('scene').classList.toggle('talking',!!voices.current&&!voices.player.paused);
 const dt=Math.min(.05,(now-last)/1000);last=now;clock+=dt;
 if(state.move){const m=state.move,t=clamp((now-m.start)/m.duration,0,1);state.visualX=m.from+(m.to-m.from)*(t*t*(3-2*t));if(t>=1){state.x=m.to;state.visualX=m.to;state.move=null;if(m.kind==='walk'||m.kind==='finalWalk')landed();else ui();}}
 else state.visualX=state.x;
 if(!state.story&&!state.move&&state.queue.length&&!$('event').open&&!$('restartDialog').open&&now>=state.pauseUntil)startMove(state.queue.shift());
 if(state.effect&&now>=state.effect.end)state.effect=null;
 if(state.weatherUntil&&now>=state.weatherUntil){state.weatherUntil=0;stopRain();}

 if(state.pauseUntil&&now>=state.pauseUntil){state.pauseUntil=0;state.sheltering=false;ui()}
 let targetScale=state.done?(state.zoom?Math.min(1.15,w/460):Math.min(1.12,w/1480,h/720)):Math.min(1.22,w/480,h/320);
 if(state.effect?.kind==='view')targetScale*=.76;
 if(state.sheltering||Math.abs(state.visualX-SHELTER_X)<200)targetScale=Math.min(targetScale,h/335,w/440);
 // Keep Katya central while hiking. At the summit, fit both slopes and all guests.
 let tx=state.done?(state.zoom?10040+state.pan:10060):state.visualX;
 let ty=ground(state.done?10000:state.visualX);
 camera.scale+=(targetScale-camera.scale)*(reduced?1:1-Math.exp(-dt*4));camera.x+=(tx-camera.x)*(reduced?1:1-Math.exp(-dt*12));camera.y=ty;
 ctx.setTransform(dpr,0,0,dpr,0,0);background();
 ctx.save();ctx.translate(w*.5,h*(state.done?finalAnchor():.63));ctx.scale(camera.scale,camera.scale);ctx.translate(-camera.x,-camera.y);terrain();
 let kx=state.visualX,ky=ground(kx);drawKatya(now,kx,ky);
 if(state.bear)companion('bear',kx-95,now);if(state.goat)companion('goat',kx-155,now);if(state.hare){const hx=Math.abs(kx+52-STONE_X)<85?kx-48:kx+52;companion('hare',hx,now)}
 if(state.story?.type==='choice'&&['bear','hare','goat'].includes(state.story.id)&&!state[state.story.id])companion(state.story.id,kx+110,now);
 if(!state.events.has('hare')&&state.x>2500&&state.x<3020)hare(3070,ground(3070));
 const visible=events.find(e=>e.id==='bear'&&!state.events.has(e.id)&&state.x>1200&&state.x<1750);if(visible)bear(1810,ground(1810),1.12);
 if(!state.events.has('goat')&&state.x>7400&&state.x<7950)goat(8035,ground(8035));
 if(!state.done){text('КАТЯ',kx,ky-126,16,'#254b46');}
 ctx.restore();drawScenicPhoto(now);speechBubble(now);drawWeather(now);summitNoise(now);if(state.done){fireworks(dt,now);letterFirework(now);familyLabels();}
 requestAnimationFrame(frame);
}
$('step').onclick=step;
$('sound').onclick=()=>{unlockAudio();soundOn=!soundOn;voices.setEnabled(soundOn);summitMusic.sync();if(master)master.gain.setTargetAtTime(soundOn?.45:0,audioCtx.currentTime,.04);$('sound').textContent=soundOn?'Звук: вкл':'Звук: выкл';$('sound').setAttribute('aria-pressed',String(soundOn));if(soundOn&&state.weatherUntil>performance.now()&&!weatherAudio)startRain((state.weatherUntil-performance.now())/1000)};
$('event').addEventListener('cancel',e=>e.preventDefault());
$('restart').onclick=()=>$('restartDialog').showModal();$('cancelRestart').onclick=()=>$('restartDialog').close();$('confirmRestart').onclick=()=>{reset();$('sceneNote').textContent='Вверх, к приключениям'};
$('closeGreeting').onclick=()=>{$('greeting').hidden=true;clearTimeout(finishTimer)};$('openGreeting').onclick=()=>{$('greeting').hidden=false;clearTimeout(finishTimer)};
$('zoom').onclick=()=>{state.zoom=!state.zoom;state.pan=0;$('zoom').textContent=state.zoom?'− Весь лагерь':'＋ Рассмотреть лагерь';$('sceneNote').textContent=state.zoom?'Потяни сцену, чтобы рассмотреть всех':'Семья уже здесь. И торт тоже.'};
canvas.addEventListener('pointerdown',e=>{if(!state.done||!state.zoom)return;drag={x:e.clientX,pan:state.pan};canvas.setPointerCapture(e.pointerId)});canvas.addEventListener('pointermove',e=>{if(drag)state.pan=clamp(drag.pan-(e.clientX-drag.x)/camera.scale,-520,570)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>canvas.addEventListener(ev,()=>drag=null));
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!$('event').open&&!$('restartDialog').open&&e.target.tagName!=='BUTTON'){e.preventDefault();step()}});
new ResizeObserver(resize).observe($('scene'));
reset();resize();requestAnimationFrame(frame);
Promise.all(Object.entries(CHARACTERS).map(([key,m])=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{images[key]=im;resolve()};im.onerror=()=>reject(new Error(m.src));im.src=m.src}))).then(()=>{state.ready=true;$('loading').hidden=true;ui()}).catch(e=>{$('loading').textContent='Не удалось загрузить персонажей. Распакуй все файлы архива в одну папку. '+e.message});
// Read-only diagnostics for checking camera/terrain alignment, also useful when customizing.
window.gameDiagnostics=()=>({summitMusic:{loaded:!!summitMusic.buffer,playing:!!summitMusic.source,loop:!!summitMusic.source?.loop,starts:summitMusic.starts,offset:summitMusic.offset,duration:summitMusic.buffer?.duration||0},story:state.story?{...state.story}:null,finalWalk:state.finalWalk?{...state.finalWalk}:null,voice:{silent:voices.silent,scripted:!!voices.script,bubbleVisible:!$('speaker').hidden,bubbleSpeaker:$('speaker').dataset.speaker,current:voices.current,queue:[...voices.queue],history:[...voices.history],failed:[...voices.failed],paused:voices.player.paused,time:voices.player.currentTime},hareFell:state.hareFell,audioCounts:{...audio.counts},scenicLoaded:!!scenicPhoto,celebrating:state.done,familyPoses:family.map((_,i)=>familyPose(i)),progress:state.x/END,steps:state.steps,clicks:state.clicks,moving:!!state.move,queued:state.queue.length,effect:state.effect?.kind||null,sheltering:state.sheltering,shelterX:SHELTER_X,stoneX:STONE_X,audioState:audioCtx?.state||null,soundOn,done:state.done,bear:state.bear,goat:state.goat,hare:state.hare,boost:state.boost,penalty:state.penalty,paused:performance.now()<state.pauseUntil,events:[...state.events],choices:state.choices,katya:{x:state.visualX,feetY:ground(state.visualX),surfaceY:ground(state.visualX),screenX:w/2+(state.visualX-camera.x)*camera.scale},camera:{...camera},weatherActive:performance.now()<state.weatherUntil,weatherRemaining:Math.max(0,state.weatherUntil-performance.now()),familyCount:family.length,letterSparks:greetingSparks.length,assets:Object.keys(images).length,dimensions:{w,h},summit:{peakY:ground(10160),leftY:ground(9400),rightY:ground(10800)}});
})();
