import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {browserSession,sleep} from './browser-session.mjs';
const b=await browserSession('endless-empty-gacha');
try{
 const p=await b.page(process.env.GAME_TEST_URL||'http://127.0.0.1:8787/web/',{source:`localStorage.setItem('ai-girls-dungeon-v1',JSON.stringify({tutorialSeen:true,sound:false,music:false}))`});
 await p.wait(`!!document.querySelector('.lb-hero')`);
 const initial=await p.evaluate(`(async()=>{
  const {app}=await import('./js/main.js'),{makeKit}=await import('./js/save.js'),D=await import('./js/data.js'),UI=await import('./js/ui.js'),{Renderer}=await import('./js/render.js');
  const check=(v,m)=>{if(!v)throw Error(m)};app.begin({mode:'solo',seed:17,pvp:false,players:[{id:1,cid:'gpt',local:true,name:'回归',kit:makeKit('gpt')}],myId:1,opt:{endless:true,map:'ice'}});app.paused=true;
  const g=app.game,q=app.me;g.loadRoom(37,{kind:'shop',waves:[],items:0});g.banner=null;g.chest.opened=true;q.coins=1000;q.kit.cards=[];
  const maxAll=p=>{for(const c of [...D.CARDS,...D.fusionCards(p.cid)])p.cards[c.id]=c.max;};maxAll(q);
  const c=document.createElement('canvas');c.width=D.VIEW_W*D.RS;c.height=D.VIEW_H*D.RS;const r=new Renderer(c,g.fx);r.follow(g,q,0,true);const drawn=()=>{const ids=[],old=r.drawShopItem;r.drawShopItem=function(ctx,it,...args){ids.push(it.id);return old.call(this,ctx,it,...args)};r.draw(g,q,.016);r.drawShopItem=old;return ids;};
  const machine=g.shop.find(it=>it.id==='gacha'),coins=q.coins,price=machine.price;check(!g.cardPool(q).length,'Fixture has no drawable cards');check(!drawn().includes('gacha')&&drawn().includes('heal'),'Only exhausted machine disappears');
  g.buy(q,machine);check(q.coins===coins&&machine.price===price&&!g.cardOffers[q.id]&&!app.cardOpen,'Empty purchase does not charge or freeze');q.x=machine.x;q.y=machine.y+16;q.input.atk=true;q.buyLock=false;q.nearShop=null;g.updatePlayer(q,0);q.input.atk=false;check(!q.nearShop&&q.coins===coins,'Hidden machine cannot interact');
  q.cards.atk_up=D.CARDS.find(c=>c.id==='atk_up').max-1;check(drawn().includes('gacha'),'Remaining card keeps machine visible');g.buy(q,machine);check(q.coins===coins-price&&g.cardOffers[q.id]?.join()==='atk_up'&&document.querySelectorAll('.cards-modal .card2').length===1,'Final available card can be bought');const paid=q.coins;g.buy(q,machine);check(q.coins===paid,'Pending choice cannot charge twice');
  window.emptyGacha={g,q,machine,drawn,maxAll,D,UI,app,check};return{floor:38,noChargeWhenEmpty:true,hiddenMachineNonInteractive:true,finalCard:'atk_up',pendingPurchaseProtected:true};
 })()`);
 await p.evaluate(`document.querySelector('.cards-modal .card2').click()`);await sleep(650);
 const result=await p.evaluate(`(()=>{const {g,q,drawn,maxAll,D,UI,app,check}=emptyGacha;check(!g.cardPool(q).length&&!app.cardOpen&&!document.querySelector('.cards-modal')&&!drawn().includes('gacha'),'Last choice removes machine and closes overlay');
  g.loadRoom(44,{kind:'shop',waves:[],items:0});check(!drawn().includes('gacha'),'Later stations also hide exhausted machine');
  g.room.kind='combat';g.phase='fight';g.chest=null;g.roomCleared();check(g.phase==='portal'&&!g.chest&&!Object.keys(g.cardOffers).length,'Exhausted combat room opens portal without spawning chest');
  const other=g.addPlayer({id:2,cid:'grok',local:false,kit:{tal:{},eq:{},cards:[]}});g.phase='fight';g.roomCleared();check(g.chest&&!g.chest.opened,'Mixed party still gets chest');g.openChest(q);check(g.phase==='cards'&&!g.cardOffers[q.id]&&g.cardOffers[other.id].length===3,'Exhausted player does not block teammate choice');g.pickCard(other.id,g.cardOffers[other.id][0]);check(g.phase==='portal','Teammate choice still gates portal');
  maxAll(other);g.endless=false;g.phase='fight';g.roomCleared();check(g.chest&&!g.chest.opened,'Story combat chest unchanged');g.endless=true;
  other.cards.atk_up=D.CARDS.find(c=>c.id==='atk_up').max-1;g.room.kind='shop';g.setupShop();const it=g.shop.find(x=>x.id==='gacha');check(!g.shopAvailable(q,it)&&g.shopAvailable(other,it),'Pool availability is per player, shop price slots remain stable');
  UI.showCards(g,q,[],()=>{throw Error('Empty card callback')});check(!document.body.classList.contains('cards-open')&&!document.querySelector('.cards-modal'),'UI rejects empty payload');
  g.cardOffers[q.id]=[];app.cardOpen=true;g.phase='cards';app.onGameUi('cards',q.id);check(!app.cardOpen&&g.phase==='shop'&&!g.cardOffers[q.id],'Legacy empty event cannot freeze app');
  return{lastCardRemovesMachine:true,laterStationsHidden:true,emptyChestContinues:true,mixedPartyContinues:true,perPlayerAvailability:true,emptyUiRejected:true,legacyEventRecovered:true};})()`);
 assert.deepEqual(b.errors,[]);await writeFile(path.join(b.out,'report.json'),JSON.stringify({...initial,...result,pageErrors:b.errors},null,2));console.log(JSON.stringify({...initial,...result,pageErrors:b.errors}));
}finally{await b.close();}
