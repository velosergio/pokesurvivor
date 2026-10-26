/* ============ ranking-ui.js — pantalla del ranking ============
 * Pestañas Solo / Grupo / Diario, periodo (diario ... histórico), todos o sólo amigos,
 * filtro por Pokémon (sólo en el histórico) y tu puesto abajo aunque no salgas
 * en el top. Lo leído se guarda 2 h (ver ranking.js).
 * Cada marca enseña su build (movimientos y objeto); al tocarla, el detalle.
 * Diario = el Desafío diario: hoy o ayer, con el Pokémon de ese día arriba.
 * Dos mitades (23-10-2026): a la izquierda el daño a Arceus y a la derecha el
 * tiempo aguantado. Salen de la misma lectura (el mismo resumen).
 */
G.RankingUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let mode = 's', period = 'w', scope = 'all', dex = null;
  let dayTab = 'today';            // en Diario: 'today' | 'yday'
  let token = 0;

  function init() {
    const dl = $('rk-dl');
    dl.innerHTML = G.DEX.map(p => `<option value="${esc(G.T(p.name))}">`).join('');
    $('rk-poke').onchange = () => {
      const v = $('rk-poke').value.trim().toLowerCase();
      const p = G.DEX.find(x => (x.name.toLowerCase() === v || G.T(x.name).toLowerCase() === v));
      if (!v) { setDex(null); return; }
      if (!p) { G.UI.toast('No hay ningún Pokémon con ese nombre'); return; }
      setDex(p.dex);
    };
    $('rk-clear').onclick = () => { $('rk-poke').value = ''; setDex(null); };
    $('rk-mod').onclick = () => G.ModUI.open();
  }

  /** El filtro por Pokémon sólo existe en el histórico: al elegir uno se pasa a esa pestaña. */
  function setDex(d) {
    dex = d;
    if (d && period !== 'a') period = 'a';
    $('rk-clear').classList.toggle('hidden', !d);
    tabs(); load();
  }

  /** @param o.mode  pestaña con la que se abre ('x' = Desafío diario) */
  function open(o = {}) {
    if (!G.SocialUI.needOnline()) return;
    if (o.mode) { mode = o.mode; dayTab = 'today'; }
    G.UI.show('scr-rank', true);
    if (!G.Social.started) G.Social.start();
    $('rk-mod').classList.toggle('hidden', !G.Ranking.isAdmin());
    tabs();
    load();
  }

  function tabs() {
    const mk = (box, items, cur, set, cls) => {
      box.innerHTML = '';
      for (const [k, label] of items) {
        const b = document.createElement('button');
        b.className = cls + (k === cur ? ' on' : '');
        b.innerHTML = label;
        b.onclick = () => { set(k); tabs(); load(); };
        box.appendChild(b);
      }
    };
    mk($('rk-mode'), [['s', `<b>${G.Icons.html('user', 16)} Solo</b>`], ['g', `<b>${G.Icons.html('friends', 16)} Grupo</b>`],
                      ['x', `<b>${G.Icons.html('clock', 16)} Diario</b>`]],
       mode, k => { mode = k; }, 'gen-tab');
    const daily = mode === 'x';
    if (daily) mk($('rk-period'), [['today', 'Hoy'], ['yday', 'Ayer']], dayTab, k => { dayTab = k; }, 'chip');
    else mk($('rk-period'), G.Ranking.PERIODS, period, k => {
      period = k;
      if (k !== 'a' && dex) { dex = null; $('rk-poke').value = ''; $('rk-clear').classList.add('hidden'); }
    }, 'chip');
    $('rk-poke').classList.toggle('hidden', daily);
    $('rk-clear').classList.toggle('hidden', daily || !dex);
    dailyHead();
    mk($('rk-scope'), [['all', 'Todos'], ['friends', 'Sólo amigos']], scope, k => { scope = k; }, 'chip');
  }

  /** El día que se ve en Diario ('AAAAMMDD'). */
  const shownDay = () => dayTab === 'yday' ? G.Daily.prevDay(G.Daily.dayId()) : G.Daily.dayId();

  /** Arriba, en Diario: el Pokémon de ese día. */
  function dailyHead() {
    const box = $('rk-daily');
    box.classList.toggle('hidden', mode !== 'x');
    if (mode !== 'x') return;
    const mon = G.DEX_BY[G.Daily.forDay(shownDay()).dex];
    box.innerHTML = '';
    box.appendChild(G.UI.spriteCanvas(mon.dex, 56, 50, { scale: 1 }));
    box.insertAdjacentHTML('beforeend', `<span><small class="sub">${dayTab === 'yday' ? 'Desafío de ayer' : 'Desafío de hoy'}</small><br>
      <b translate="no">${esc(mon.name)}</b> ${G.UI.typeChips(mon.types)}</span>`);
  }

  const fmt = t => t >= 3600 ? Math.floor(t / 3600) + ':' + G.U.mmss(t % 3600).padStart(5, '0') : G.U.mmss(t);

  async function load() {
    const my = ++token;
    const list = $('rk-list'), dlist = $('rk-dlist');
    list.innerHTML = dlist.innerHTML = '<p class="sub">Cargando…</p>';
    $('rk-me').innerHTML = $('rk-dme').innerHTML = '';
    let rows = [], me = null, dmg = { rows: [], me: null };
    // En Diario el "periodo" es el día y no hay filtro por Pokémon.
    const per = mode === 'x' ? shownDay() : period, dx = mode === 'x' ? null : dex;
    try {
      [rows, me, dmg] = await Promise.all([
        G.Ranking.top(mode, per, dx, scope === 'friends'),
        G.Social.me ? G.Ranking.myRank(mode, per, dx) : Promise.resolve(null),
        dx ? Promise.resolve(dmg) : G.Ranking.topDmg(mode, per, scope === 'friends')
      ]);
    } catch (e) {
      if (my !== token) return;
      list.innerHTML = dlist.innerHTML = '<p class="sub">No se pudo cargar el ranking (' + esc(e.code || e.message) + ').</p>';
      return;
    }
    if (my !== token) return;
    list.innerHTML = dlist.innerHTML = '';
    if (!rows.length) {
      // Sólo amigos en diario, semanal y mensual: ahí sólo se guarda el top 50 (ranking.js).
      list.innerHTML = scope === 'friends' && period !== 'a' && !dex
        ? '<p class="sub">Ninguno de tus amigos está en el top 50 de este periodo. En Histórico salen todos.</p>'
        : '<p class="sub">Todavía no hay marcas aquí. ¡Sé el primero!</p>';
    }
    const uid = G.Social.uid;
    const b = G.Ranking.board(mode, per, dx), done = G.Ranking.reported();
    rows.forEach((r, i) => list.appendChild(rowEl(r, i + 1, r.uids.includes(uid), b, done)));

    // Daño a Arceus (no hay por Pokémon).
    if (dx) dlist.innerHTML = '<p class="sub">El daño a Arceus no tiene ranking por Pokémon.</p>';
    else if (!dmg.rows.length) dlist.innerHTML = '<p class="sub">Todavía nadie le ha hecho daño a Arceus aquí. ¡Llega al minuto 30 y pégale!</p>';
    const db = G.Ranking.board(mode, per);
    dmg.rows.forEach((r, i) => dlist.appendChild(rowEl(r, i + 1, r.uids.includes(uid), db, done, true)));
    const dme = $('rk-dme');
    dme.setAttribute('translate', 'no');
    dme.textContent = dx || !dmg.me ? '' : dmg.me.out ? G.T('Aún no estás en el top 50 de daño.')
      : G.I18n.f('Tu puesto: {x}', '#' + dmg.me.pos) + ' · ' + num(dmg.me.d);
    dme.classList.toggle('hidden', !dme.textContent);

    // La frase se monta en cada idioma (traducirla por trozos sale rara).
    const lang = G.I18n.lang, en = lang === 'en', pos = '#' + (me && me.capped ? '1000+' : me && me.pos);
    if (mode === 'x') {
      const when = dayTab === 'yday' ? (en ? 'yesterday' : 'de ayer') : (en ? 'today' : 'de hoy');
      $('rk-me').innerHTML = !G.Social.me ? 'Elige un apodo (en Amigos) para salir en el ranking.'
        : me && me.out ? (en ? `<span translate="no">You're not in the top 50 of ${when}'s challenge.</span>` : `No estás en el top 50 del desafío ${when}.`)
        : me ? (en ? `<span translate="no">Your rank in ${when}'s challenge: <b class="gold">${pos}</b> · ${fmt(me.t)}</span>`
                   : `Tu puesto en el desafío ${when}: <b class="gold">${pos}</b> · ${fmt(me.t)}`)
        : (en ? `<span translate="no">You don't have a record in ${when}'s challenge.</span>` : `No tienes marca en el desafío ${when}.`);
      return;
    }
    if (lang !== 'es' && !en) {
      // Otros idiomas: frases enteras sin periodo ni Pokémon (ya se ven en los filtros).
      const rk = $('rk-me');
      rk.setAttribute('translate', 'no');
      rk.textContent = !G.Social.me ? G.T('Elige un apodo (en Amigos) para salir en el ranking.')
        : me && me.out ? G.T('Aún no estás en el top 50. Tu puesto está en Histórico.')
        : me ? G.I18n.f('Tu mejor puesto: {x}', pos) + ' · ' + fmt(me.t)
        : G.T('Aún no tienes marca.');
      return;
    }
    const pn = en ? { d: 'today', w: 'this week', m: 'this month', y: 'this year', a: 'of all time' }[period]
                  : { d: 'de hoy', w: 'de esta semana', m: 'de este mes', y: 'de este año', a: 'de siempre' }[period];
    const mon = dex ? G.DEX_BY[dex].name : '';
    const where = en ? (mode === 's' ? 'solo' : 'group') + (dex ? ' with ' + mon : '')
                     : (mode === 's' ? 'en solitario' : 'en grupo') + (dex ? ' con ' + mon : '');
    $('rk-me').removeAttribute('translate');
    $('rk-me').innerHTML = !G.Social.me ? 'Elige un apodo (en Amigos) para salir en el ranking.'
      : me && me.out ? (en ? `<span translate="no">You're not in the top 50 ${where} ${pn} yet. Your rank is in All-time.</span>`
                           : `Aún no estás en el top 50 ${pn} ${where}. Tu puesto está en Histórico.`)
      : me ? (en ? `<span translate="no">Your best ${where} rank ${pn}: <b class="gold">${pos}</b> · ${fmt(me.t)}</span>`
                 : `Tu mejor puesto ${pn} ${where}: <b class="gold">${pos}</b> · ${fmt(me.t)}`)
      : (en ? `<span translate="no">You don't have a ${where} record ${pn} yet.</span>` : `Aún no tienes marca ${pn} ${where}.`);
  }

  const num = n => (n || 0).toLocaleString(G.I18n.locale);

  /** Una fila: de tiempo o, con dmg, de daño a Arceus. */
  function rowEl(r, pos, mine, b, done, dmg = false) {
    const el = document.createElement('div');
    el.className = 'rk-row' + (mine ? ' mine' : '') + (pos <= 3 ? ' top' + pos : '');
    el.insertAdjacentHTML('beforeend', `<span class="pos">${pos <= 3 ? G.Icons.html('trophy', 20) : ''}${pos}</span>`);
    const mons = document.createElement('span');
    mons.className = 'mons';
    r.dex.forEach((d, i) => { if (G.DEX_BY[d]) mons.appendChild(G.UI.spriteCanvas(d, 44, 40, { scale: 1, shiny: !!r.shiny[i] })); });
    el.appendChild(mons);
    el.insertAdjacentHTML('beforeend',
      `<span class="who"><b translate="no">${r.names.map((n, i) => `<a href="#" class="plink" data-u="${esc(r.uids[i] || '')}">${esc(n)}</a>`).join(' · ')}</b>${dmg ? '' : `<small>Nv. ${r.lv || 1} · ${num(r.kills)} derrotados</small>`}</span>
       <span class="time">${dmg ? num(r.d) : fmt(r.t)}</span>`);
    if (r.b.length) {
      const strip = document.createElement('span');
      strip.className = 'rk-build';
      strip.innerHTML = r.b.map(c => stripHtml(parseBuild(c))).join('<i class="rk-sep"></i>');
      el.querySelector('.who').appendChild(strip);
    }
    // Tocar la fila (no el nombre ni la bandera) abre o cierra el detalle de la build.
    el.classList.add('rk-tap');
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-expanded', 'false');
    const toggle = () => {
      let det = el.querySelector('.rk-det');
      if (!det) { det = document.createElement('div'); det.className = 'rk-det'; det.innerHTML = detailHtml(r); el.appendChild(det); }
      else det.classList.toggle('hidden');
      const open = !det.classList.contains('hidden');
      el.classList.toggle('open', open);
      el.setAttribute('aria-expanded', String(open));
    };
    el.onclick = e => { if (!e.target.closest('a, button')) toggle(); };
    el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); toggle(); } };
    el.querySelectorAll('.plink').forEach(a => { a.onclick = e => { e.preventDefault(); G.ProfileUI.show(a.dataset.u); }; });
    // Reportar una marca sospechosa (no la tuya). Lo revisa el admin (mod-ui.js).
    if (!mine && G.Social.me) {
      const rep = document.createElement('button');
      const sent = done.has(b + '__' + r.id);
      rep.className = 'rk-rep' + (sent ? ' sent' : '');
      rep.title = sent ? 'Ya la has reportado' : 'Reportar marca sospechosa';
      rep.innerHTML = G.Icons.html('flag', 16);
      rep.onclick = async () => {
        if (rep.classList.contains('sent')) { G.UI.toast('Ya has reportado esta marca'); return; }
        if (!confirm('¿Reportar la marca de ' + r.names.join(', ') + ' como trampa?')) return;
        rep.classList.add('sent'); rep.title = 'Ya la has reportado';
        await G.Ranking.report(b, r);
        G.UI.toast('Gracias: la revisaremos');
      };
      el.appendChild(rep);
    } else el.appendChild(document.createElement('span'));
    return el;
  }

  // ---------------- builds (Player.buildCode) ----------------

  let STAT = null;
  /** Texto de la build → { slots: [[{ id, lvl, evo }]], item, stats: [{ s, n }] } (lo desconocido se salta). */
  function parseBuild(code) {
    if (!STAT) { STAT = {}; for (const x of G.LevelUp.STATS) STAT[x.id] = x; }
    const [mv = '', it = '', st = ''] = String(code || '').split(';');
    const slots = mv.split('|').map(g => g.split('+').map(x => /^([a-z0-9-]+)\.(\d+)(\*?)$/.exec(x))
      .filter(m => m && G.Moves.BY_ID[m[1]]).map(m => ({ id: m[1], lvl: +m[2], evo: !!m[3] }))).filter(g => g.length);
    const stats = st.split(',').map(x => /^([a-z]+)(\d+)$/.exec(x)).filter(m => m && STAT[m[1]]).map(m => ({ s: STAT[m[1]], n: +m[2] }));
    return { slots, item: G.Items.BY[it] ? it : null, stats };
  }
  const moveName = m => (m.evo && G.Moves.EVO[m.id] ? G.Moves.EVO[m.id][0] : G.Moves.BY_ID[m.id].name);

  /** La tira de la fila: iconos de los movimientos con su nivel (los fusionados, juntos) y el objeto. */
  function stripHtml(bd) {
    return bd.slots.map(g => `<span class="rk-slot${g.length > 1 ? ' fused' : ''}">${g.map(m =>
      `<span class="rk-mv${m.evo ? ' evo' : ''}" title="${esc(moveName(m))}">${G.Icons.html('move:' + m.id, 16)}<sub>${m.lvl}</sub></span>`).join('')}</span>`).join('')
      + (bd.item ? `<span class="rk-it" title="${esc(G.Items.BY[bd.item].name)}">${G.Icons.html(bd.item, 16)}</span>` : '');
  }

  /** El detalle al tocar la fila: la build de cada uno (en grupo, con su nombre). */
  function detailHtml(r) {
    if (!r.b.length) return '<p class="sub">Esta marca es de antes de que se guardaran las builds.</p>';
    const group = r.uids.length > 1;
    return r.b.map((code, i) => {
      const bd = parseBuild(code), mon = G.DEX_BY[r.dex[i]];
      const it = bd.item && G.Items.BY[bd.item];
      return `<div class="rk-bd">
        ${group ? `<div class="rk-bd-who"><b translate="no">${esc(r.names[i] || '')}</b> <small>${mon ? esc(mon.name) : ''}</small></div>` : ''}
        <div><span class="lab">Movimientos</span>${bd.slots.map(g => `<div class="rk-bslot${g.length > 1 ? ' fused' : ''}">${g.map(m =>
          `<span class="rk-bmv">${G.Icons.html('move:' + m.id, 16)} <span class="${m.evo ? 'gold' : ''}">${esc(moveName(m))}</span> <small>Nv. ${m.lvl}</small></span>`).join('')}</div>`).join('') || '<div>—</div>'}</div>
        <div><span class="lab">Objeto</span><div>${it ? `${G.Icons.html(bd.item, 16)} <span>${esc(it.name)}</span> <small>${esc(it.desc)}</small>` : '<small>Sin objeto</small>'}</div></div>
        <div><span class="lab">Mejoras de nivel</span><div class="rk-bstats">${bd.stats.map(x =>
          `<span>${G.Icons.html(x.s.icon, 14)} <span>${esc(x.s.title)}</span> <small>×${x.n}</small></span>`).join('') || '<small>Ninguna</small>'}</div></div>
      </div>`;
    }).join('');
  }

  return { init, open };
})();
