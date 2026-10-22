'use strict';
// Real supplied recordings only. All paths are relative to index.html.
// wow.mp3 and goat_no_bear.mp3 are converted from the supplied recordings.
window.VOICE_CLIPS={
 calm:{src:'katya_calm.mp3',speaker:'Катя',volume:.80},
 katya:{src:'katya.mp3',speaker:'Катя',volume:.80},
 bear:{src:'bear.mp3',speaker:'Медведь',volume:.72},
 hare:{src:'hare.mp3',speaker:'Заяц',volume:.72},
 goat:{src:'goat.mp3',speaker:'Козёл',volume:.76},
 goatNoBear:{src:'goat_no_bear.mp3',speaker:'Козёл',volume:.76},
 bearProtest:{src:'bear.mp3',speaker:'Медведь',volume:.95},
 view:{src:'wow.mp3',speaker:'Катя',volume:.85}
};
window.HikingVoices=class {
 constructor(onSpeaker,getState){
  this.getState=getState;
  this.player=new Audio();this.player.preload='auto';this.player.setAttribute('playsinline','');
  this.onSpeaker=onSpeaker;this.enabled=true;this.unlocked=false;this.current=null;
  this.queue=[];this.pending=[];this.failed=new Set();this.history=[];this.nextAt=0;this.turn=0;this.token=0;
  this.script=null;this.silent=false;this.modalPaused=false;
  this.player.addEventListener('ended',()=>this.complete());
  this.player.addEventListener('error',()=>{if(this.current){this.failed.add(this.current);this.complete()}});
 }
 unlock(){
  if(this.unlocked)return;
  this.unlocked=true;
  // A brief silent buffer primes this same media element on mobile Safari.
  const token=this.token;this.player.muted=true;
  this.player.src='data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  this.player.play().then(()=>{if(token===this.token&&!this.current){this.player.pause();this.player.muted=false;}}).catch(()=>{if(token===this.token)this.player.muted=false;});
 }
 setEnabled(on){
  this.enabled=on;
  if(!on){const callback=this.script;this.stop();if(callback)callback();}
  else this.nextAt=performance.now()+1500;
 }
 stop(){this.token++;this.player.pause();this.current=null;this.queue=[];this.pending=[];this.script=null;this.modalPaused=false;this.nextAt=performance.now()+6000;this.onSpeaker(null);}
 reset(){this.stop();this.silent=false;this.turn=0;this.history=[];this.failed.clear();this.nextAt=0;}
 silence(){this.stop();this.silent=true;}
 get busy(){return !!(this.current||this.queue.length||this.script);}
 // Story sequences start only after the previous conversation has fully ended.
 begin(keys,onDone){
  if(this.busy)throw new Error('A dialogue is already playing');
  this.script=onDone;this.queue=keys.filter(k=>window.VOICE_CLIPS[k]&&!this.failed.has(k));
  this.nextAt=performance.now();
  if(!this.enabled||this.silent||!this.queue.length){this.queue=[];this.script=null;onDone();}
 }
 complete(){if(!this.current)return;this.token++;this.player.pause();this.current=null;this.onSpeaker(null);this.nextAt=performance.now()+(this.queue.length?650:this.pending.length?1400:6500+Math.random()*2500);}
 joined(kind){if(!this.pending.includes(kind))this.pending.push(kind);}
 sequence(kind,state){return kind==='goat'?[state.bear?'goat':'goatNoBear','katya']:kind==='katya'?['katya']:[kind,'calm'];}
 scenic(){this.stop();if(window.VOICE_CLIPS.view)this.queue=['view'];this.nextAt=performance.now();}
 resolve(key){
  const s=this.getState();
  if(!s||s.done||s.finalWalk||s.story?.phase==='choice')return null;
  if((key==='bear'||key==='bearProtest')&&!s.bear)return null;
  if(key==='hare'&&!s.hare)return null;
  if(key==='calm'&&!s.bear&&!s.hare)return null;
  if(key==='goat'||key==='goatNoBear')return s.goat?(s.bear?'goat':'goatNoBear'):null;
  if(key==='view'&&s.effect?.kind!=='view')return null;
  return key;
 }
 play(key){
  key=this.resolve(key);if(!key)return;
  const clip=window.VOICE_CLIPS[key];if(this.silent||!this.enabled||!clip||this.failed.has(key))return;
  const token=++this.token;this.current=key;this.startedAt=performance.now();this.progressAt=this.startedAt;this.lastTime=0;
  this.player.src=clip.src;this.player.muted=false;this.player.volume=clip.volume;this.player.load();
  this.onSpeaker(clip.speaker);this.history.push(key);this.history=this.history.slice(-40);
  this.player.play().catch(error=>{if(token===this.token&&error.name!=='AbortError'){this.failed.add(key);this.complete()}});
 }
 visibility(hidden){
  if(!this.current)return;
  if(hidden)this.player.pause();else if(this.enabled&&!this.modalPaused){this.progressAt=performance.now();const token=this.token;this.player.play().catch(()=>{if(token===this.token)this.complete()});}
 }
 tick(now,state,modal){
  if(state.done||this.silent){if(this.busy)this.silence();return;}
  if(document.hidden||!this.enabled||!this.unlocked)return;
  if(modal){if(this.current&&!this.player.paused){this.player.pause();this.modalPaused=true}return;}
  if(this.modalPaused){this.modalPaused=false;this.visibility(false);}
  if(this.current){
   // A failed/stalled file must never freeze the game or the conversation.
   // Watch lack of playback progress, not wall time: pauses must not cut a clip.
   if(this.player.currentTime!==this.lastTime){this.lastTime=this.player.currentTime;this.progressAt=now;}
   if(now-(this.progressAt??this.startedAt)>15000)this.complete();return;
  }
  if(this.script&&!this.queue.length){const done=this.script;this.script=null;done();return;}
  if(now<this.nextAt)return;
  if(!this.script&&state.effect&&state.effect.kind!=='view')return;
  if(!this.script&&state.effect?.kind==='view'&&this.queue[0]!=='view')return;
  if(!this.queue.length){
   if(state.story||state.finalWalk)return;
   if(!state.move||state.paused)return;
   const candidates=['bear','hare','goat'].filter(k=>state[k]);
   const kind=this.pending.shift()|| (candidates.length?candidates[this.turn++%candidates.length]:'katya');
   this.queue=this.sequence(kind,state);
  }
  const key=this.queue.shift();this.play(key);
  if(!this.current)this.nextAt=now+650;
 }
};
