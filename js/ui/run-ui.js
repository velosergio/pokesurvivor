/* ============ run-ui.js — cartas de nivel, pausa y fin de run ============ */
G.RunUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let offers = null, offerCb = null, coopMode = false, rerollCb = null;

  /**
   * @param coop      en grupo: tras elegir, se queda esperando a los demás
   * @param onReroll  en grupo: las cartas nuevas las saca el servidor (llega otro showLevelUp)
   */
  function showLevelUp(level, list, cb, coop = false, onReroll = null) {
    offerCb = cb; coopMode = coop; rerollCb = onReroll;
    $('lvl-num').textContent = level;
    $('lvl-wait').textContent = '';
    $('lvl-wait').classList.toggle('hidden', !coop);
    $('cards').classList.remove('done');
    renderCards(list);
    $('lvl-reroll').onclick = reroll;
    G.UI.show('scr-levelup');
  }

  /**
   * Cambiar las cartas: 1 vez gratis por partida y 1 más por cada jefe
   * derrotado (en grupo cuentan los jefes del equipo; cada uno tiene los suyos).
   */
  function rerollsLeft() {
    const p = G.Game.player;
    // 1 gratis + los comprados en Mejoras (antes, 1 más por cada jefe).
    return p ? Math.max(0, 1 + (p.rerollBonus || 0) - (p.rerolls || 0)) : 0;
  }

  function reroll() {
    if (!offers || rerollsLeft() <= 0 || offers.some(c => c.type === 'unlearn')) return;
    const p = G.Game.player;
    p.rerolls = (p.rerolls || 0) + 1;
    G.Audio.sfx('select');
    if (rerollCb) { offers = null; $('lvl-reroll').classList.add('hidden'); rerollCb(); return; }
    renderCards(G.LevelUp.offer(p));
  }

  function renderCards(list) {
    offers = list;
    // La segunda elección de «Olvidar» (qué movimiento) no se cambia.
    const unlearn = list.length > 0 && list.every(c => c.type === 'unlearn');
    const left = rerollsLeft();
    $('lvl-rr-n').textContent = left;
    $('lvl-reroll').classList.toggle('hidden', left <= 0 || unlearn);
    $('lvl-sub').innerHTML = (unlearn ? '¿Qué movimiento olvidas? · ' : 'Elige una recompensa · ')
      + list.map((c, i) => `<kbd>${i + 1}</kbd>`).join(' ');
    const box = $('cards');
    box.innerHTML = '';
    list.forEach((c, i) => {
      const el = document.createElement('div');
      el.className = 'card';
      const tag = c.type === 'new'
        ? `<span class="tag-chip" style="background:${c.color}">Nuevo · ${c.tag}</span>`
        : c.type === 'up' || c.type === 'evo' || c.type === 'forget' || c.type === 'unlearn'
          ? `<span class="tag-chip" style="background:${c.color}">${c.tag}</span>`
          : `<span class="tag-chip" style="background:${c.color === '#ffd23f' ? '#ffd23f' : '#9fb1c9'}">${c.tag}</span>`;
      if (c.type === 'evo') el.classList.add('evo');
      el.innerHTML =
        `<div class="ico" style="background:${c.color}33">${G.Icons.html(c.icon, 32)}</div>
         <div class="txt"><div class="nm">${c.title} ${tag}</div><div class="ds">${c.desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';             // el juego pone su propio sonido al elegir
      el.onclick = () => pick(i);
      box.appendChild(el);
    });
  }

  function pick(i) {
    if (!offers || !offers[i]) return;
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    if (coopMode) {
      // Se queda la carta elegida a la vista mientras eligen los demás.
      $('cards').querySelectorAll('.card').forEach((el, j) => el.classList.toggle('picked', j === i));
      $('cards').classList.add('done');
    } else G.UI.hide('scr-levelup');
    cb(c);
  }

  /** Cooperativo: quién falta por elegir. */
  function setWaiting(names) {
    const me = G.Social.me ? G.Social.me.name : '';
    const others = names.filter(n => n !== me);
    const list = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0];
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? 'Elige tu carta'
      : names.includes(me) ? 'Faltan por elegir: ' + list([...others, 'tú'])
      : 'Esperando a ' + list(others) + '…';
  }

  function closeLevelUp() {
    offers = null; offerCb = null;
    $('cards').classList.remove('done');
    G.UI.hide('scr-levelup');
  }

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  function askSupport(r) {
    if (!G.Funding || !G.Funding.url) return false;
    const runs = (G.DB.save && G.DB.save.stats && G.DB.save.stats.runs) || 0;
    if (runs < 2 || !(r.record || runs % 10 === 0)) return false;
    const today = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem('ps.ask') === today) return false; localStorage.setItem('ps.ask', today); } catch (e) { return false; }
    return true;
  }

  // ---------------- resumen por personaje ----------------

  /** 12345 → "12,3k"; 2500000 → "2,5M". */
  const big = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace('.', ',') + 'k' : String(Math.round(n));

  /** Lo que se compara (k = campo de crew). En solitario no hay a quién levantar. */
  const CREW_COLS = [
    { k: 'dmg', label: 'Daño hecho', award: 'Más daño' },
    { k: 'hit', label: 'Daño recibido', award: 'Más daño recibido' },
    { k: 'ch', label: 'Cofres', award: 'Más cofres' },
    { k: 'rv', label: 'Reanimaciones', award: 'Más reanimaciones', group: true }
  ];

  /**
   * MVP: cuánto aporta cada uno al total del grupo, sobre todo en daño
   * (el daño recibido no suma: aguantar no es lo mismo que ayudar).
   */
  function mvpOf(crew) {
    const W = { dmg: 0.5, ki: 0.2, rv: 0.2, ch: 0.1 };
    const tot = {};
    for (const k in W) tot[k] = crew.reduce((a, c) => a + (c[k] || 0), 0);
    let best = null, bestS = 0;
    for (const c of crew) {
      let sc = 0;
      for (const k in W) if (tot[k]) sc += W[k] * (c[k] || 0) / tot[k];
      if (sc > bestS) { best = c; bestS = sc; }
    }
    return best;
  }

  /** El bloque del resumen: solo, tus números; en grupo, MVP, premios y la tabla. */
  function crewHtml(crew) {
    if (!crew || !crew.length) return '';
    if (crew.length === 1) {
      const c = crew[0];
      return `<div class="crew-solo" style="grid-column:1/-1">
        ${CREW_COLS.filter(col => !col.group).map(col => `<div><span>${col.label}</span><b>${big(c[col.k] || 0)}</b></div>`).join('')}
      </div>`;
    }
    const mvp = mvpOf(crew);
    const awards = CREW_COLS.map(col => {
      const top = crew.reduce((a, c) => (c[col.k] || 0) > (a ? a[col.k] || 0 : 0) ? c : a, null);
      return top ? `<li><span>${col.award}</span><b translate="no">${esc(top.name)}</b><em>${big(top[col.k])}</em></li>` : '';
    }).join('');
    const maxOf = k => Math.max(0, ...crew.map(c => c[k] || 0));
    const cols = [{ k: 'ki', label: 'Derrotados' }].concat(CREW_COLS);
    const rows = crew.map(c => `<tr class="${c.me ? 'me' : ''}">
        <th translate="no">${c === mvp ? G.Icons.html('crown', 14) + ' ' : ''}${esc(c.name)}</th>
        ${cols.map(col => { const v = c[col.k] || 0; return `<td class="${v && v === maxOf(col.k) ? 'top' : ''}">${big(v)}</td>`; }).join('')}
      </tr>`).join('');
    return `<div class="crew" style="grid-column:1/-1">
      ${mvp ? `<div class="crew-mvp"><div id="over-mvp"></div><div><span>${G.Icons.html('crown', 14)} MVP de la partida</span>
        <b translate="no">${esc(mvp.name)}</b><small>${G.DEX_BY[mvp.dex] ? G.DEX_BY[mvp.dex].name : ''}</small></div></div>` : ''}
      ${awards ? `<ul class="crew-awards">${awards}</ul>` : ''}
      <div class="crew-scroll"><table class="crew-table">
        <thead><tr><th></th>${cols.map(col => `<th>${col.label}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
  }

  function showOver(r, onBack) {
    $('over-title').textContent = r.dead ? 'Has caído…' : 'Run terminada';
    $('over-stats').innerHTML = `
      <div><span>Tiempo</span><b>${G.U.mmss(r.time)}</b></div>
      <div><span>Nivel</span><b>${r.level}</b></div>
      <div><span>Derrotados</span><b>${r.kills}</b></div>
      <div><span>Jefes</span><b>${r.bosses}</b></div>
      ${r.judge ? `<div style="grid-column:1/-1"><span>Ante Arceus</span><b class="gold">${G.U.mmss(r.judge.time)} · ${r.judge.bosses} ${r.judge.bosses === 1 ? 'legendario' : 'legendarios'}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Pokémonedas ganadas</span>
        <b class="gold"><span class="coin"></span> +${r.coins}</b>
        <div style="font-size:12px;color:var(--muted)">${r.breakdown}</div></div>
      ${r.t1 || r.t10 ? `<div style="grid-column:1/-1"><span>Tickets del gacha</span><b>
        ${r.t1 ? G.Icons.html('ticket', 22) + ' +' + r.t1 + ' ' : ''}${r.t10 ? G.Icons.html('ticket10', 22) + ' +' + r.t10 + ' ×10' : ''}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Movimientos</span><b style="font-size:15px">
        ${r.moves.map(m => `${G.Icons.html('move:' + m.id, 16)} ${m.name} Nv.${m.lvl}`).join(' · ') || '—'}</b></div>
      ${crewHtml(r.crew)}
      ${r.caught && r.caught.length ? `<div style="grid-column:1/-1" class="caught"><span>${G.Icons.html('shiny', 12)} Shinies conseguidos</span>
        <div class="caught-row" id="over-caught"></div></div>` : ''}
      ${r.record ? '<div style="grid-column:1/-1;text-align:center" class="gold">¡Nuevo récord de tiempo!</div>' : ''}
      ${askSupport(r) ? `<div class="support-ask" id="over-ask" style="grid-column:1/-1">
        <button class="x" type="button" aria-label="Cerrar">×</button>
        <p>¿Te está gustando PokéSurvivor? Lo hago yo solo y los servidores cuestan dinero. Si quieres, puedes ayudarme a mantenerlo en línea.</p>
        <a class="btn small gold" href="${G.Funding.url}" target="_blank" rel="noopener">${G.Icons.html('heart', 14)} Apoyar en Ko-fi</a>
      </div>` : ''}`;
    const ask = $('over-ask');
    if (ask) ask.querySelector('.x').onclick = () => ask.remove();
    $('btn-again').onclick = onBack;
    const mvpBox = $('over-mvp');
    if (mvpBox) {
      const mvp = mvpOf(r.crew);
      if (G.DEX_BY[mvp.dex]) mvpBox.appendChild(G.UI.spriteCanvas(mvp.dex, 72, 60, { shiny: mvp.shiny, lively: true, scale: 2 }));
    }
    if (r.caught && r.caught.length) {
      const row = $('over-caught');
      for (const c of r.caught) {
        const w = document.createElement('div');
        w.appendChild(G.UI.spriteCanvas(c.dex, 90, 72, { shiny: true, lively: true, scale: 2 }));
        w.insertAdjacentHTML('beforeend', `<small>${G.DEX_BY[c.dex].name}${c.isNew ? ' · ¡nuevo!' : ''}</small>`);
        row.appendChild(w);
      }
    }
    G.UI.show('scr-over');
  }

  /** Has encontrado un objeto llevando ya otro: ¿con cuál te quedas? */
  function showItemChoice(cur, next, cb) {
    const box = $('item-cards');
    box.innerHTML = '';
    [[cur, 'Quedarme con'], [next, 'Cambiar a']].forEach(([id, verb], i) => {
      const it = G.Items.BY[id];
      const el = document.createElement('div');
      el.className = 'card' + (i === 1 ? ' evo' : '');
      el.innerHTML = `<div class="ico">${G.Icons.html(id, 36)}</div>
        <div class="txt"><div class="nm">${verb} ${it.name}</div><div class="ds">${it.desc}</div></div>
        <div class="key">${i + 1}</div>`;
      el.onclick = () => { G.UI.hide('scr-item'); cb(id); };
      box.appendChild(el);
    });
    G.UI.show('scr-item');
  }

  // ---------------- vínculo: qué movimientos se fusionan ----------------

  let bond = null;          // { opt, cb, first, list }

  /**
   * @param opt  pl.bondOptions(): 'add' (uno suelto al grupo) o 'pair' (dos sueltos, en dos pasos)
   * @param cb   recibe la lista de movimientos que se juntan
   */
  function showBond(opt, cb) {
    bond = { opt, cb, first: null, list: [] };
    $('bond-back').onclick = bondBack;
    renderBond();
    G.UI.show('scr-bond');
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = ms => ms.map(m => m.name).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + first.name + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter(m => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m, i) => {
      const col = G.U.TYPE_COLOR[m.type];
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + first.name + '. Queda un hueco libre.'
        : m.desc || '';
      const el = document.createElement('div');
      el.className = 'card' + (opt.mode === 'add' || step2 ? ' bond' : '');
      el.innerHTML =
        `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 32)}</div>
         <div class="txt"><div class="nm">${m.name} <span class="tag-chip" style="background:${col}">Nv.${m.lvl}</span></div><div class="ds">${desc}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pickBond(i);
      box.appendChild(el);
    });
  }

  /**
   * Grupo: el servidor manda las fusiones posibles ya hechas
   * ([{ id, name: 'A + B', lv: [niveles] }]); cb recibe el índice elegido.
   */
  function showBondList(options, cb) {
    bond = { list: options, cb, server: true };
    $('bond-sub').textContent = 'Elige qué movimientos se unen: se lanzarán a la vez';
    $('bond-back').classList.add('hidden');
    const box = $('bond-cards');
    box.innerHTML = '';
    options.forEach((o, i) => {
      const ids = String(o.id).split('+');
      const el = document.createElement('div');
      el.className = 'card bond';
      el.innerHTML =
        `<div class="ico">${ids.map(id => G.Icons.html('move:' + id, ids.length > 1 ? 22 : 32)).join('')}</div>
         <div class="txt"><div class="nm">${o.name}</div><div class="ds">Nv. ${(o.lv || []).join(' + ')}</div></div>
         <div class="key">${i + 1}</div>`;
      el.dataset.sfx = 'none';
      el.onclick = () => pickBond(i);
      box.appendChild(el);
    });
    G.UI.show('scr-bond');
  }

  function pickBond(i) {
    if (!bond || !bond.list[i]) return;
    if (bond.server) {
      const cb = bond.cb;
      bond = null;
      G.UI.hide('scr-bond');
      cb(i);
      return;
    }
    const m = bond.list[i];
    if (bond.opt.mode === 'pair' && !bond.first) {
      bond.first = m;
      G.Audio.sfx('select');
      renderBond();
      return;
    }
    const picked = bond.opt.mode === 'add' ? [m] : [bond.first, m];
    const cb = bond.cb;
    bond = null;
    G.UI.hide('scr-bond');
    cb(picked);
  }

  function bondBack() {
    if (!bond) return;
    bond.first = null;
    renderBond();
  }

  function showPause(coop = false) {
    G.UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').textContent = coop ? 'Salir de la partida' : 'Abandonar run';
    G.UI.show('scr-pause');
  }

  function wirePause(onResume, onQuit) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
  }

  return { showLevelUp, reroll, showItemChoice, showBond, showBondList, pickBond, bondBack, pick, setWaiting, closeLevelUp, showOver, wirePause, showPause };
})();
