/* ============ run-ui.js — cartas de nivel, pausa y fin de run ============ */
G.RunUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let offers = null, offerCb = null, coopMode = false, rerollCb = null;

  /*
   * Al aparecer unas cartas (nivel, vínculo, objeto) no se pueden elegir
   * durante GUARD s y se ven apagadas: en plena pelea se pulsa 1-4 (o se toca
   * la pantalla) para cambiar de ataque y se elegía una carta sin querer.
   * Cambiar las cartas o el 2.º paso del vínculo no lo vuelven a poner: ahí ya
   * estás eligiendo a propósito.
   */
  const GUARD = 0.6;
  let guardUntil = 0, guardT = 0;
  function guard(box) {
    guardUntil = performance.now() + GUARD * 1000;
    box.classList.add('guard');
    clearTimeout(guardT);
    guardT = setTimeout(() => document.querySelectorAll('.cards.guard').forEach(b => b.classList.remove('guard')), GUARD * 1000);
  }
  const guarded = () => performance.now() < guardUntil;

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
    guard($('cards'));
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
        ? `<span class="tag-chip" style="background:${c.color}">Nuevo · ${c.tag}</span>${c.cat ? `<span class="tag-chip cat">${c.cat}</span>` : ''}`
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
    if (!offers || !offers[i] || guarded()) return;
    const c = offers[i], cb = offerCb;
    offers = null; offerCb = null;
    $('lvl-reroll').classList.add('hidden');
    stopTimer();
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
    const list = a => new Intl.ListFormat(G.I18n.locale, { style: 'long', type: 'conjunction' }).format(a);
    $('lvl-wait').setAttribute('translate', 'no');
    $('lvl-wait').textContent = !names.length ? ''
      : !others.length ? G.T('Elige tu carta')
      : names.includes(me) ? G.I18n.f('Faltan por elegir: {x}', list([...others, G.T('tú')]))
      : G.I18n.f('Esperando a {x}…', list(others));
  }

  function closeLevelUp() {
    offers = null; offerCb = null;
    $('cards').classList.remove('done');
    G.UI.hide('scr-levelup');
    stopTimer();
  }

  /*
   * Grupo: barra verde abajo con el tiempo que te queda para elegir (el
   * servidor elige por ti al acabar). Se vacía sola con una transición CSS;
   * los últimos 5 s se pone amarilla.
   */
  const TIMER_MAX = 20;                 // s (CHOICE_MAX en server/room.js)
  let lowT = 0;
  function startTimer(left) {
    const s = Math.max(0, Math.min(TIMER_MAX, Number.isFinite(left) ? left : TIMER_MAX));
    const el = $('pick-timer'), bar = el.firstElementChild;
    clearTimeout(lowT);
    el.classList.remove('hidden');
    el.classList.toggle('low', s <= 5);
    bar.style.transition = 'none';
    bar.style.width = (s / TIMER_MAX * 100) + '%';
    void bar.offsetWidth;               // que empiece desde ahí y no desde donde estaba
    bar.style.transition = 'width ' + s + 's linear';
    bar.style.width = '0%';
    if (s > 5) lowT = setTimeout(() => el.classList.add('low'), (s - 5) * 1000);
  }
  function stopTimer() {
    clearTimeout(lowT);
    $('pick-timer').classList.add('hidden');
  }

  /**
   * Mensaje de apoyo (Ko-fi) al acabar: tras un récord o cada 10 partidas,
   * nunca en la primera y como mucho una vez al día. Se cierra con la X.
   */
  function askSupport(r) {
    if (!G.Funding || !G.Funding.url) return false;
    const runs = (G.DB.save && G.DB.save.stats && G.DB.save.stats.runs) || 0;
    if (runs < 2 || !(r.record || runs % 10 === 0)) return false;
    const today = G.U.gameDay();
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
      ${r.judge ? `<div style="grid-column:1/-1"><span>Ante Arceus</span><b class="gold">${G.U.mmss(r.judge.time)} · ${r.judge.bosses} ${r.judge.bosses === 1 ? 'legendario' : 'legendarios'}</b></div>
        <div style="grid-column:1/-1"><span>Daño a Arceus</span><b class="gold">${(r.judge.dmg || 0).toLocaleString(G.I18n.locale)}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Pokémonedas ganadas</span>
        <b class="gold"><span class="coin"></span> +${r.coins}</b>
        <div style="font-size:12px;color:var(--muted)">${r.breakdown}</div></div>
      ${r.bonus && r.bonus.t1 ? `<div style="grid-column:1/-1"><span>Desafío diario</span><b class="gold">
        ${G.Icons.html('ticket', 22)} +${r.bonus.t1}</b><div style="font-size:12px;color:var(--muted)">Por aguantar. El premio por puesto llega mañana.</div></div>` : ''}
      ${r.t1 || r.t10 ? `<div style="grid-column:1/-1"><span>Tickets del gacha</span><b>
        ${r.t1 ? G.Icons.html('ticket', 22) + ' +' + r.t1 + ' ' : ''}${r.t10 ? G.Icons.html('ticket10', 22) + ' +' + r.t10 + ' ×10' : ''}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>Movimientos</span><b style="font-size:15px">
        ${r.moves.map(m => `${G.Icons.html('move:' + m.id, 16)} ${G.T(m.name, 'move')} Nv.${m.lvl}`).join(' · ') || '—'}</b></div>
      ${crewHtml(r.crew)}
      ${r.team && r.team.length ? `<div style="grid-column:1/-1" class="over-sum"><span>Resumen de la partida</span>
        ${r.team.length > 1 ? '<div class="chips over-tabs" id="over-tabs"></div>' : ''}<div id="over-sum"></div></div>` : ''}
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
    if (r.team && r.team.length) {
      const show = i => {
        $('over-sum').innerHTML = sumHtml(r.team[i]);
        const tabs = $('over-tabs');
        if (tabs) tabs.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
      };
      const tabs = $('over-tabs');
      if (tabs) r.team.forEach((p, i) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = p.me ? 'Tú' : p.name;            // (textContent: el nombre de otro jugador nunca es HTML)
        b.setAttribute('translate', 'no');
        b.onclick = () => show(i);
        tabs.appendChild(b);
      });
      show(0);
    }
    // Con compañeros, la caja es algo más ancha (las tablas de daño caben mejor).
    $('scr-over').querySelector('.box').style.width = r.team && r.team.length > 1 ? 'min(560px,100%)' : 'min(480px,100%)';
    $('btn-again').onclick = onBack;
    // En el Desafío diario: a la tabla de hoy.
    const board = $('btn-board');
    board.classList.toggle('hidden', r.mode !== 'daily');
    board.onclick = () => { onBack(); G.RankingUI.open({ mode: 'x' }); };
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
      el.onclick = () => { if (guarded()) return; G.UI.hide('scr-item'); cb(id); };
      box.appendChild(el);
    });
    G.UI.show('scr-item');
    guard(box);
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
    guard($('bond-cards'));
  }

  function renderBond() {
    const { opt, first } = bond;
    const names = ms => ms.map(m => G.T(m.name, 'move')).join(' + ');
    const step2 = opt.mode === 'pair' && first;
    $('bond-sub').textContent = opt.mode === 'add' ? 'Elige qué movimiento se une a ' + names(opt.group)
      : step2 ? '¿Con cuál unes ' + G.T(first.name, 'move') + '?' : 'Elige el primer movimiento que vas a unir';
    $('bond-back').classList.toggle('hidden', !step2);
    bond.list = step2 ? opt.loose.filter(m => m !== first) : opt.loose;
    const box = $('bond-cards');
    box.innerHTML = '';
    bond.list.forEach((m, i) => {
      const col = G.U.TYPE_COLOR[m.type];
      const desc = opt.mode === 'add' ? 'Se lanzará a la vez que ' + names(opt.group) + '.'
        : step2 ? 'Se lanzará a la vez que ' + G.T(first.name, 'move') + '. Queda un hueco libre.'
        : m.desc || '';
      const el = document.createElement('div');
      el.className = 'card' + (opt.mode === 'add' || step2 ? ' bond' : '');
      el.innerHTML =
        `<div class="ico" style="background:${col}33">${G.Icons.html('move:' + m.id, 32)}</div>
         <div class="txt"><div class="nm">${G.T(m.name, 'move')} <span class="tag-chip" style="background:${col}">Nv.${m.lvl}</span></div><div class="ds">${desc}</div></div>
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
    if (!bond || !bond.list[i] || guarded()) return;
    if (bond.server) {
      const cb = bond.cb;
      bond = null;
      G.UI.hide('scr-bond');
      stopTimer();
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

  /*
   * Resumen de un jugador al acabar (25-10-2026): su Pokémon, sus ataques con el
   * daño hecho y el daño por segundo, el total y su objeto. sum viene de
   * Game.mySum() o, de un compañero, limpio por coop.js (cleanSum).
   */
  function sumHtml(p) {
    const s = p.sum, n = v => Math.round(v).toLocaleString(G.I18n.locale);
    let total = 0;
    const rows = s.mv.map(([id, lvl, dealt, since, evo]) => {
      const m = G.Moves.instance(id, lvl);
      if (evo) G.Moves.evolve(m);
      const secs = Math.max(5, s.t - since);
      if (m.cat) total += dealt;
      return `<tr><td>${G.Icons.html('move:' + id, 18)} ${G.T(m.name, 'move')} <small>Nv.${lvl}</small></td>
        <td class="num">${m.cat ? n(dealt) : '—'}</td><td class="num">${m.cat ? n(dealt / secs) + '/s' : '—'}</td></tr>`;
    }).join('');
    const mon = G.DEX_BY[s.dex], it = s.it && G.Items.BY[s.it];
    // (La frase entera en cada idioma: traducida por trozos sale rara.)
    return `<p class="sub" style="margin:6px 0" translate="no">${s.sh ? G.Icons.html('shiny', 12) + ' ' : ''}${G.I18n.f('{x} · Nv. {x} · {x} de daño en total', G.T(mon.name), s.lv, n(total))}</p>
      <table class="sum-moves"><tr><th></th><th class="num">Daño</th><th class="num">Por segundo</th></tr>${rows}</table>
      <p class="sub" style="margin:6px 0 0">${it ? G.Icons.html(s.it, 16) + ' ' + it.name : 'Sin objeto.'}</p>`;
  }

  /*
   * Resumen de la partida en la pausa: tus ataques (categoría, daño hecho y
   * daño por segundo), tus estadísticas con todo lo subido y el objeto y las
   * cartas de mejora que llevas.
   */
  function pauseSummary() {
    const pl = G.Game.player;
    if (!pl) return '';
    const t = G.Game.st.time, n = v => Math.round(v).toLocaleString('es');
    const k2 = v => '×' + v.toFixed(2).replace('.', ',');
    const pct = v => Math.round(v * 100) + ' %';
    const moves = pl.moves.map(m => {
      const secs = Math.max(5, t - (m.since || 0)), col = G.U.TYPE_COLOR[m.type];
      const cat = m.cat ? `<span class="tag-chip" style="background:${col}">${G.Stats.NAME[m.cat]}</span>` : '<span class="sub">Mejora</span>';
      return `<tr><td>${G.Icons.html('move:' + m.id, 18)} ${G.T(m.name, 'move')} <small>Nv.${m.lvl}</small></td><td>${cat}</td>
        <td class="num">${m.cat ? n(m.dealt || 0) : '—'}</td><td class="num">${m.cat ? n((m.dealt || 0) / secs) + '/s' : '—'}</td></tr>`;
    }).join('');
    const mon = pl.mon, fis = 1 - G.Stats.taken(mon, 'physical'), esp = 1 - G.Stats.taken(mon, 'special');
    const guard = v => (v >= 0 ? '−' : '+') + Math.round(Math.abs(v) * 100) + ' %';
    const st = [
      ['Vida', n(pl.hp) + ' / ' + n(pl.maxHp)],
      ['Ataque', k2(pl.atkFor({ cat: 'physical' }))],
      ['At. Esp.', k2(pl.atkFor({ cat: 'special' }))],
      ['Defensa', mon.df + ' <small>' + guard(fis) + ' físico</small>'],
      ['Def. Esp.', mon.sd + ' <small>' + guard(esp) + ' especial</small>'],
      ['Velocidad', n(pl.spd)],
      ['Crítico', pct(pl.critChance || 0)],
      ['Reducción de daño', pct(pl.reduction)],
      ['Recarga', pl.cdMul < 0.995 ? '−' + pct(1 - pl.cdMul) : '0 %'],
      ['Regeneración', pl.regen.toFixed(1).replace('.', ',') + ' /s']
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    const it = pl.item && G.Items.BY[pl.item];
    const cards = Object.entries(pl.statsTaken || {}).map(([id, c]) => {
      const s = G.LevelUp.STATS.find(x => x.id === id);
      return s ? `<span class="chip">${G.Icons.html(s.icon, 12)} ${s.title} ×${c}</span>` : '';
    }).join('');
    return `<h3>Tus ataques</h3>
      <table class="sum-moves"><tr><th></th><th></th><th class="num">Daño</th><th class="num">Por segundo</th></tr>${moves}</table>
      <h3>Tus estadísticas</h3><div class="sum-stats">${st}</div>
      <h3>Objeto y cartas</h3>
      <p class="sub">${it ? G.Icons.html(pl.item, 18) + ' <b>' + it.name + '</b>: ' + it.desc : 'Sin objeto.'}</p>
      <div class="chips">${cards || '<span class="sub">Aún no has cogido cartas de mejora.</span>'}</div>
      <h3>Tus esferas</h3>${orbsSummary(pl)}`;
  }

  /** Las esferas que llevas (con su tecla y lo que hacen) y las mejoras que tienes puestas. */
  function orbsSummary(pl) {
    const key = i => G.Touch.active ? '' : `<kbd>${i + 5}</kbd> `;
    const rows = (pl.orbs || []).map((s, i) => {
      if (!s) return '';
      const o = G.Orbs.BY[s.id];
      return `<p class="sub orb-row">${key(i)}${G.Icons.html('orb:' + s.id, 18)} <b>${G.T(o.name)}</b>${s.n > 1 ? ' ×' + s.n : ''}: ${G.T(o.desc)}</p>`;
    }).join('');
    const ob = pl.orbBuff || {};
    const on = Object.keys(ob).filter(id => ob[id] > 0)
      .map(id => `<span class="chip">${G.Icons.html('orb:' + id, 12)} ${G.T(G.Orbs.BY[id].name)} · ${Math.ceil(ob[id])} s</span>`).join('');
    return (rows || '<p class="sub">Aún no llevas esferas. Salen de los cofres, de los jefes y, a veces, al derrotar a un Pokémon.</p>')
      + (on ? `<div class="chips">${on}</div>` : '');
  }

  function showPause(coop = false) {
    $('pause-sum').innerHTML = pauseSummary();
    G.UI.soundControls($('pause-sound'));
    $('pause-coop').classList.toggle('hidden', !coop);
    $('btn-quit').textContent = coop ? 'Salir de la partida' : 'Abandonar run';
    G.UI.show('scr-pause');
  }

  function wirePause(onResume, onQuit) {
    $('btn-resume').onclick = onResume;
    $('btn-quit').onclick = onQuit;
  }

  return { showLevelUp, reroll, showItemChoice, showBond, showBondList, pickBond, bondBack, pick, setWaiting, closeLevelUp, startTimer, stopTimer, showOver, wirePause, showPause };
})();
