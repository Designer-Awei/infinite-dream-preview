import { PETS, PET_ORDER, PET_STAGES, PET_COST, PET_EVOLVE, petPortrait } from "./petdata.js";
import { petState, exchangePet, equipPet, evolvePet } from "./petsave.js";
import { load, mineState } from "./save.js";
import { uiRoot, btn, toast } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";
import { petPreview } from "./petpreview.js";

export function showPets(onClose) {
  document.querySelector('.pet-modal')?.remove();
  const state = petState(); let selected = state.equipped || PET_ORDER[0], previewStage=state.owned[selected]?.stage||1, previewClip="idle";
  const md = el('div', 'modal pet-modal');
  md.innerHTML = `<section class="panel pet-panel" role="dialog" aria-modal="true" aria-labelledby="pet-title"><header><h2 id="pet-title">梦境伙伴</h2><div class="pet-wallet o1"></div></header><div class="pet-body"><nav class="pet-nav"></nav><div class="pet-detail"></div></div><footer><span class="pet-scope">闯关 / 无尽 / 合作出战 · 竞技场与矿场不出战</span><div class="pet-trial"></div></footer></section>`;
  const close = () => { md.remove(); onClose?.(); };
  md.querySelector('header').appendChild(btn('关闭', 'gray small', close));
  md.onclick = e => { if (e.target === md) close(); };
  md.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const refresh = (evolved = false) => {
    const state = petState(), meta = load(), ms = mineState(), own = state.owned[selected], def = PETS[selected];
    md.querySelector('.pet-wallet').textContent = `积攒 ${meta.stash || 0} · 星砂 ${ms.stars}`;
    const nav = md.querySelector('.pet-nav'); nav.replaceChildren();
    for (const id of PET_ORDER) {
      const o=state.owned[id],displayStage=selected===id?previewStage:o?.stage||1;
      const b=el('button',`pet-choice${selected===id?' chosen':''}${evolved&&selected===id?' evolved':''}`,`<div class="pet-card-animation"></div><span>${PETS[id].name}</span><small>${state.equipped===id?'已携带':o?PET_STAGES[o.stage-1]:'未拥有'}</small>`);
      b.onclick=()=>{selected=id;previewStage=state.owned[id]?.stage||1;previewClip='idle';sfx('click');refresh();};nav.appendChild(b);
      petPreview(b.querySelector('.pet-card-animation'),id,displayStage,selected===id?previewClip:'idle',true,true);
    }
    const stage = own?.stage || 1, next = PET_EVOLVE[stage + 1];
    const detail = md.querySelector('.pet-detail');
    detail.innerHTML = `<div class="pet-summary"><div class="pet-identity"><h3 style="color:${def.color}">${def.name}<small>${previewStage===3?'HUR':'UR'} · ${PET_STAGES[previewStage-1]}</small></h3><p class="pet-passive">携带：${def.passive} +${Math.round(def.bonus[previewStage-1]*100)}%</p></div>
      <div class="pet-preview-tools"><div class="pet-stage-tabs">${[1,2,3].map(s=>`<button data-stage="${s}" class="${s===previewStage?'chosen':''}" aria-pressed="${s===previewStage}">${PET_STAGES[s-1]}</button>`).join('')}</div><div class="pet-animation-tabs">${[['idle','待机'],['move','行走'],['cast','技能']].map(([id,text])=>`<button data-clip="${id}" class="${id===previewClip?'chosen':''}" aria-pressed="${id===previewClip}">${text}</button>`).join('')}</div></div><small class="pet-preview-note">${PET_STAGES[previewStage-1]}预览${own?.stage>=previewStage?' · 已解锁':' · 未解锁'}</small>
      <div class="pet-skill-lines"><p><b>助战</b><span>${def.attack} / ${def.skill}</span></p><p><b>特性</b><span>${def.trait}</span></p><p><b>骑乘</b><span>${def.rideAttack} / ${def.rideUlt}</span></p><p class="pet-ride-desc"><b>效果</b><span>${def.rideDesc}</span></p></div>
      ${own?`<div class="pet-progress"><span>${PET_STAGES[stage-1]}</span><div><i style="width:${stage===3?100:Math.min(100,own.xp/next.xp*100)}%"></i><b>${stage===3?'已达终极':own.xp+' / '+next.xp}</b></div></div>`:'<p class="pet-hint">首次兑换解锁首页入口；一次携带一只。</p>'}
      <div class="pet-actions"></div></div>`;
    detail.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{previewStage=Number(b.dataset.stage);refresh();});
    detail.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>{previewClip=b.dataset.clip;refresh();});
    const actions = detail.querySelector('.pet-actions');
    if (own) {
      actions.appendChild(btn(state.equipped === selected ? '取消携带' : '携带出战', 'small blue pet-equip', () => { equipPet(state.equipped === selected ? null : selected); refresh(); }));
      if (stage < 3) {
        const b = btn('进化', 'small pet-evolve', () => { const result = evolvePet(selected); if (!result.ok) toast(result.reason); else { sfx('ssr'); toast(`${def.name}进化为${PET_STAGES[result.stage-1]}！`); } if(result.ok)previewStage=result.stage;refresh(result.ok); });
        b.title=`累计经验${next.xp} + ${next.stars}星砂`;
        b.disabled = own.xp < next.xp || ms.stars < next.stars; actions.appendChild(b);
      }
    }
    if (!own) {
      const b = btn(`UR兑换 · ${PET_COST.UR} 积攒`, 'small', () => {
        const result = exchangePet(selected, 'UR'); if (!result.ok) toast(result.reason); else { sfx('ssr'); toast(`获得${def.name}，已解锁伙伴出战！`); } if(result.ok)previewStage=result.stage;refresh(result.ok);
      });
      b.disabled = (meta.stash || 0) < PET_COST.UR; actions.appendChild(b);
    }
    const trial = md.querySelector('.pet-trial');trial.replaceChildren(btn('免费试用 · 终极骑乘', 'small green', () => { md.remove(); import('./main.js').then(({ app }) => app.startPetTrial(selected)); }));
  };
  uiRoot().appendChild(md);refresh();md.querySelector('header button').focus();
}
