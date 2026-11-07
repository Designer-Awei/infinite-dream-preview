import { PETS, PET_ORDER, PET_STAGES, PET_COST, PET_EVOLVE, petPortrait } from "./petdata.js";
import { petState, exchangePet, equipPet, evolvePet } from "./petsave.js";
import { load, mineState } from "./save.js";
import { uiRoot, btn, toast } from "./ui.js";
import { el } from "./util.js";
import { sfx } from "./audio.js";

export function showPets(onClose) {
  document.querySelector('.pet-modal')?.remove();
  const state = petState(); let selected = state.equipped || PET_ORDER[0];
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
      const o = state.owned[id], b = el('button', `pet-choice${selected === id ? ' chosen' : ''}`, `<img src="${petPortrait(id, o?.stage || 1)}" alt=""><span>${PETS[id].name}</span><small>${state.equipped === id ? '已携带' : o ? PET_STAGES[o.stage - 1] : '未拥有'}</small>`);
      b.onclick = () => { selected = id; sfx('click'); refresh(); }; nav.appendChild(b);
    }
    const stage = own?.stage || 1, next = PET_EVOLVE[stage + 1];
    const detail = md.querySelector('.pet-detail');
    detail.innerHTML = `<div class="pet-identity${evolved ? ' evolved' : ''}"><img src="${petPortrait(selected, stage)}" alt="${def.name}"><div><h3 style="color:${def.color}">${def.name} <small>${stage === 3 ? 'HUR' : 'UR'} · ${PET_STAGES[stage - 1]}</small></h3><p>${def.desc}</p><p class="pet-passive">携带：${def.passive} +${Math.round(def.bonus[stage - 1] * 100)}%</p></div></div>
      <div class="pet-evolution">${[1,2,3].map(s => `<div class="${s <= stage && own ? 'reached' : ''}"><img src="${petPortrait(selected, s)}" alt=""><b>${PET_STAGES[s - 1]}</b><small>${s === 1 ? '自动助战' : s === 2 ? '技能强化' : '解锁骑乘'}</small></div>`).join('')}</div>
      <div class="pet-skill-lines"><p><b>普攻</b><span>${def.attack}</span><b>技能</b><span>${def.skill}</span></p><p><b>骑乘</b><span>${def.rideAttack}</span><b>大招</b><span>${def.rideUlt}</span></p></div>
      ${own ? `<div class="pet-progress"><span>${stage === 3 ? '终极伙伴' : '伙伴经验'}</span><div><i style="width:${stage === 3 ? 100 : Math.min(100, own.xp / next.xp * 100)}%"></i><b>${stage === 3 ? '已达终极' : own.xp + ' / ' + next.xp}</b></div></div>` : '<p class="pet-hint">拥有首只伙伴后解锁出战，一次携带一只。可先免费试用。</p>'}
      <div class="pet-actions"></div><p class="pet-hint">${own && stage < 3 ? `进化到${PET_STAGES[stage]}：经验 ${next.xp}，星砂 ${next.stars}。出战结算获得伙伴经验。` : stage === 3 && own ? '骑乘后移速 +25%，普攻和大招变为坐骑技能；小技能仍为角色技能。' : 'UR 兑换幼年；HUR 直接获得终极，可立即骑乘。'}<br>伙伴不承伤，不占传送门人数；加成下次进入战斗生效。</p>`;
    const actions = detail.querySelector('.pet-actions');
    if (own) {
      actions.appendChild(btn(state.equipped === selected ? '取消携带' : '携带出战', 'small blue', () => { equipPet(state.equipped === selected ? null : selected); refresh(); }));
      if (stage < 3) {
        const b = btn('进化', 'small', () => { const result = evolvePet(selected); if (!result.ok) toast(result.reason); else { sfx('ssr'); toast(`${def.name}进化为${PET_STAGES[result.stage-1]}！`); } refresh(result.ok); });
        b.disabled = own.xp < next.xp || ms.stars < next.stars; actions.appendChild(b);
      }
    }
    for (const rarity of ['UR','HUR']) {
      const target = rarity === 'HUR' ? 3 : 1;
      if (own?.stage >= target) continue;
      const b = btn(`${own ? '直升终极' : rarity + '兑换'} · ${PET_COST[rarity]} 积攒`, 'small', () => {
        const result = exchangePet(selected, rarity); if (!result.ok) toast(result.reason); else { sfx('ssr'); toast(`获得${def.name}，已解锁伙伴出战！`); } refresh(result.ok);
      });
      b.disabled = (meta.stash || 0) < PET_COST[rarity]; actions.appendChild(b);
    }
    const trial = md.querySelector('.pet-trial');trial.replaceChildren(btn('免费试用 · 终极骑乘', 'small green', () => { md.remove(); import('./main.js').then(({ app }) => app.startPetTrial(selected)); }));
  };
  uiRoot().appendChild(md);refresh();md.querySelector('header button').focus();
}
