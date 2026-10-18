/* ============ social-ui.js — apodo, amigos, sala e invitaciones ============ */
(() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** ¿Se puede usar lo online? Si no, explica por qué. */
  function needOnline() {
    if (G.DB.online) return true;
    G.UI.toast(G.DB.guest ? 'Crea una cuenta para jugar con amigos y salir en el ranking.'
      : 'Esto necesita la versión online del juego (con la nube).', 3200);
    return false;
  }

  // ======================= APODO =======================

  G.NickUI = (() => {
    let then = null, skipped = false;

    function init() {
      $('nick-form').onsubmit = async e => {
        e.preventDefault();
        $('nick-err').textContent = '';
        $('nick-ok').disabled = true;
        const r = await G.Social.claimNick($('nick-in').value);
        $('nick-ok').disabled = false;
        if (!r.ok) { $('nick-err').textContent = r.error; G.Audio.sfx('error'); return; }
        G.Audio.sfx('confirm');
        G.UI.toast('Tu apodo es ' + G.Social.me.name);
        const cb = then; then = null;
        if (cb) cb(); else G.MenuUI.open();
      };
      $('nick-later').onclick = () => { skipped = true; then = null; G.MenuUI.open(); };
    }

    /** @param next  qué abrir después de elegirlo */
    function open(next) {
      then = next || null;
      G.UI.show('scr-nick');
      $('nick-err').textContent = '';
      $('nick-in').value = '';
      setTimeout(() => $('nick-in').focus(), 50);
    }

    return { init, open, get skipped() { return skipped; } };
  })();

  /** Abre `fn` si tienes apodo; si no, pide el apodo primero. */
  function withNick(fn) {
    if (!needOnline()) return;
    if (G.Social.me) { fn(); return; }
    G.Social.start().then(r => { if (r === 'ok') fn(); else G.NickUI.open(fn); });
  }

  // ======================= AMIGOS =======================

  G.FriendsUI = (() => {
    function init() {
      $('fr-add').onsubmit = async e => {
        e.preventDefault();
        const name = $('fr-name').value;
        msg('');
        const r = await G.Social.request(name);
        msg(r.ok ? r.msg : r.error, !r.ok);
        if (r.ok) $('fr-name').value = '';
      };
      $('fr-room').onclick = () => G.LobbyUI.open();
      // Jugar en grupo: crear una sala o entrar con el código que te pasen.
      $('fr-create').onclick = async () => {
        msg('Conectando…');
        const r = await G.Social.createRoom();
        if (!r.ok) { msg(r.error, true); return; }
        msg('');
        G.LobbyUI.open();
      };
      $('fr-join').onsubmit = async e => {
        e.preventDefault();
        msg('Conectando…');
        const r = await G.Social.joinRoom($('fr-code').value);
        if (!r.ok) { msg(r.error, true); return; }
        msg('');
        $('fr-code').value = '';
        G.LobbyUI.open();
      };
      G.Social.on(() => { if (G.UI.isOpen('scr-friends')) render(); });
    }

    function msg(t, bad) {
      $('fr-msg').textContent = t || '';
      $('fr-msg').style.color = bad ? '#ffb0b8' : '';
      if (t) G.Audio.sfx(bad ? 'error' : 'confirm');
    }

    function open() { withNick(() => { G.UI.show('scr-friends', true); msg(''); render(); G.Social.refreshPresence(); }); }

    /** "hace 5 min", "hace 2 h", "hace 3 días". */
    function ago(t) {
      const m = Math.max(1, Math.round((G.Social.now() - t) / 60000));
      if (m < 60) return 'hace ' + m + ' min';
      const h = Math.round(m / 60);
      if (h < 48) return 'hace ' + h + ' h';
      return 'hace ' + Math.round(h / 24) + ' días';
    }

    function stateText(f) {
      if (f.status === 'in') return 'Quiere ser tu amigo';
      if (f.status === 'out') return 'Solicitud enviada';
      if (!f.online) return f.seen ? 'Visto ' + ago(f.seen) : 'Desconectado';
      return f.play ? 'Jugando' : f.room ? 'En una sala' : 'En línea';
    }

    function render() {
      const room = G.Social.room;
      $('fr-me').innerHTML = 'Tu apodo: <b class="gold" translate="no">' + esc(G.Social.me ? G.Social.me.name : '') + '</b> · dáselo a tus amigos para que te añadan.';
      $('fr-room').classList.toggle('hidden', !room);
      $('fr-group').classList.toggle('hidden', !!room || !G.Net.available());
      const list = G.Social.friends.sort((a, b) => {
        const rank = f => f.status === 'in' ? 0 : f.status === 'ok' ? (f.online ? (f.play ? 2 : 1) : 3) : 4;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
      const box = $('fr-list');
      box.innerHTML = '';
      if (!list.length) {
        box.innerHTML = '<p class="sub">Aún no tienes amigos añadidos. Escribe arriba el apodo de un amigo.</p>';
        return;
      }
      for (const f of list) {
        const el = document.createElement('div');
        el.className = 'fr-row';
        const dot = f.status !== 'ok' ? 'pend' : !f.online ? 'off' : f.play ? 'play' : 'on';
        const inRoom = room && room.members.some(m => m.uid === f.uid);
        el.innerHTML = `<i class="dot ${dot}"></i><b translate="no"><a href="#" class="plink" title="Ver su perfil">${esc(f.name)}</a></b><span class="st">${inRoom ? 'En tu sala' : stateText(f)}</span><span class="grow"></span>`;
        if (f.status === 'ok') el.querySelector('.plink').onclick = e => { e.preventDefault(); G.ProfileUI.show(f.uid); };
        else el.querySelector('.plink').onclick = e => e.preventDefault();
        const btn = (txt, cls, fn) => {
          const b = document.createElement('button');
          b.className = 'btn small ' + cls; b.textContent = txt; b.onclick = fn; el.appendChild(b); return b;
        };
        if (f.status === 'in') {
          btn('Aceptar', 'gold', async () => { const r = await G.Social.accept(f.uid); msg(r.ok ? r.msg : r.error, !r.ok); });
          btn('Rechazar', 'ghost', () => G.Social.remove(f.uid));
        } else if (f.status === 'out') {
          btn('Cancelar', 'ghost', () => G.Social.remove(f.uid));
        } else {
          if (f.online && !f.play && f.room && !room) {
            // Está en una sala: entras con su código (si está llena o cerrada, el servidor lo dice).
            btn('Unirse', 'gold', async () => {
              msg('Conectando…');
              const r = await G.Social.joinRoom(f.room);
              if (!r.ok) { msg(r.error, true); G.Social.refreshPresence(true); return; }
              msg('');
              G.LobbyUI.open();
            });
          } else if (f.online && !f.play && !inRoom && (!room || room.isHost)) {
            btn('Invitar', 'gold', async () => {
              const r = await G.Social.invite(f.uid);
              msg(r.ok ? r.msg : r.error, !r.ok);
              if (r.ok) G.LobbyUI.open();
            });
          }
          btn('Quitar', 'ghost', () => { if (confirm('¿Quitar a ' + f.name + ' de tus amigos?')) G.Social.remove(f.uid); });
        }
        box.appendChild(el);
      }
    }

    return { init, open, render };
  })();

  // ======================= SALA =======================

  G.LobbyUI = (() => {
    let membersKey = '';
    let rulesOpen = false;
    /** Condiciones a medida (proto.RULES): nombre y para qué sirve. */
    const RULE_TEXT = {
      spawn: ['Enemigos', 'cuántos aparecen'],
      rift: ['Grietas', 'cada cuánto se abren'],
      coin: ['Monedas', 'cuántas sueltan'],
      ticket: ['Tickets', 'cuántos sueltan']
    };
    const pct = k => Math.round(k * 100) + '%';

    function init() {
      $('lobby-leave').onclick = async () => {
        await G.Social.leaveRoom();
        G.MenuUI.open();
      };
      $('lobby-menu').onclick = () => G.MenuUI.open();
      $('lobby-start').onclick = start;
      $('lobby-rules-btn').onclick = () => { rulesOpen = !rulesOpen; render(); };
      $('lobby-start').dataset.sfx = 'confirm';
      $('lobby-copy').onclick = () => {
        const room = G.Social.room;
        if (!room) return;
        const done = () => G.UI.toast('Código copiado: ' + room.id, 2000);
        if (navigator.clipboard) navigator.clipboard.writeText(room.id).then(done, () => G.UI.toast(room.id, 3000));
        else G.UI.toast(room.id, 3000);
      };
      G.Social.on(what => {
        if (what === 'room-closed') {
          G.UI.toast('Te has quedado fuera de la sala', 2600);
          if (G.UI.isOpen('scr-lobby')) G.MenuUI.open();
        }
        if (G.UI.isOpen('scr-lobby')) render();
      });
      G.Net.onState(() => { if (G.UI.isOpen('scr-lobby')) render(); });
    }

    function open() {
      if (!G.Social.room) { G.MenuUI.open(); return; }
      G.Social.refreshMember();
      G.Social.refreshPresence();
      G.UI.show('scr-lobby', true);
      membersKey = '';
      rulesOpen = false;
      render();
    }

    function close() { G.UI.hide('scr-lobby'); }

    function connText(m, room) {
      if (!m.on) return 'Reconectando…';
      if (m.uid === room.host) return m.uid === G.Social.uid ? 'Tú · líder' : 'Líder';
      return m.uid === G.Social.uid ? 'Tú' : 'En la sala';
    }

    function render() {
      const room = G.Social.room;
      if (!room) return;
      const ms = room.members;
      const leader = (ms.find(m => m.uid === room.host) || {}).name || '…';
      $('lobby-sub').textContent = room.isHost
        ? 'Eres el líder. Pasa el código o invita a tus amigos (hasta ' + G.Social.MAX_PLAYERS + ') y empezad cuando estéis.'
        : 'Estás en la sala de ' + leader + '. El líder empezará la partida.';
      $('lobby-code').textContent = room.id;

      // Las tarjetas sólo se rehacen si cambian los miembros (los sprites no parpadean).
      const key = ms.map(m => m.uid + ':' + m.dex + ':' + (m.shiny ? 1 : 0)).join('|');
      const box = $('lobby-members');
      if (key !== membersKey) {
        membersKey = key;
        box.innerHTML = '';
        for (let i = 0; i < G.Social.MAX_PLAYERS; i++) {
          const m = ms[i];
          const c = document.createElement('div');
          c.className = 'lob-card' + (m ? '' : ' empty');
          if (m) {
            c.style.setProperty('--pc', G.Coop.COLORS[i]);
            c.appendChild(G.UI.spriteCanvas(m.dex, 120, 96, { scale: 2, lively: true, shiny: !!m.shiny }));
            c.insertAdjacentHTML('beforeend', `<b translate="no">${esc(m.name)}</b><small>${esc((G.DEX_BY[m.dex] || {}).name || '')}</small><span class="conn" data-u="${esc(m.uid)}"></span>`);
          } else c.innerHTML = '<span>Libre</span>';
          box.appendChild(c);
        }
      }
      box.querySelectorAll('.conn').forEach(el => {
        const m = ms.find(x => x.uid === el.dataset.u);
        if (!m) return;
        el.textContent = connText(m, room);
        el.className = 'conn' + (m.on ? '' : ' wait');
      });

      // Invitar (sólo el líder y si queda sitio).
      const canInvite = room.isHost && ms.length < G.Social.MAX_PLAYERS;
      $('lobby-inv-title').classList.toggle('hidden', !canInvite);
      const inv = $('lobby-invite');
      inv.classList.toggle('hidden', !canInvite);
      if (canInvite) {
        inv.innerHTML = '';
        const free = G.Social.friends.filter(f => f.status === 'ok' && f.online && !ms.some(m => m.uid === f.uid));
        if (!free.length) inv.innerHTML = '<p class="sub" style="margin:0">Ningún amigo en línea ahora mismo.</p>';
        for (const f of free) {
          const el = document.createElement('div');
          el.className = 'fr-row';
          el.innerHTML = `<i class="dot ${f.play ? 'play' : 'on'}"></i><b translate="no">${esc(f.name)}</b><span class="st">${f.play ? 'Jugando' : 'En línea'}</span><span class="grow"></span>`;
          const b = document.createElement('button');
          b.className = 'btn small gold'; b.textContent = 'Invitar';
          b.onclick = async () => { const r = await G.Social.invite(f.uid); G.UI.toast(r.ok ? r.msg : r.error); };
          el.appendChild(b);
          inv.appendChild(el);
        }
      }

      renderRules(room);

      const btn = $('lobby-start');
      btn.classList.toggle('hidden', !room.isHost);
      const away = ms.some(m => !m.on);
      const net = G.Net.state;
      btn.disabled = !room.isHost || ms.length < 2 || away || net !== 'open';
      btn.textContent = 'Empezar partida (' + ms.length + '/' + G.Social.MAX_PLAYERS + ')';
      $('lobby-note').textContent = net === 'retry' ? 'Se ha cortado la conexión con el servidor: reconectando…'
        : !room.isHost ? 'Cuando el líder empiece, entraréis todos a la vez.'
        : ms.length < 2 ? 'Necesitas al menos un amigo en la sala: pásale el código.'
        : away ? 'Esperando a que vuelva a conectarse alguien…'
        : 'La partida empieza para todos a la vez.';
    }

    /** Botón «Condiciones de partida»: el líder las cambia; los demás las ven. */
    function renderRules(room) {
      const rules = room.rules || G.Proto.cleanRules(null);
      const custom = G.Proto.customRules(rules);
      const sum = $('lobby-rules-sum');
      sum.textContent = custom ? 'A medida: esta partida no cuenta para el ranking.' : 'Normales.';
      sum.classList.toggle('custom', custom);
      $('lobby-rules-btn').textContent = rulesOpen ? 'Ocultar condiciones' : 'Condiciones de partida';
      const box = $('lobby-rules');
      box.classList.toggle('hidden', !rulesOpen);
      if (!rulesOpen) return;
      box.innerHTML = '';
      for (const k of Object.keys(G.Proto.RULES)) {
        const steps = G.Proto.RULES[k], i = steps.indexOf(rules[k]);
        const row = document.createElement('div');
        row.className = 'lob-rule';
        row.innerHTML = `<span><b>${RULE_TEXT[k][0]}</b> <small class="sub">${RULE_TEXT[k][1]}</small></span>`;
        const val = document.createElement('b');
        val.textContent = pct(rules[k]);
        val.classList.toggle('custom', rules[k] !== 1);
        if (room.isHost) {
          const step = d => {
            const v = steps[i + d];
            if (v === undefined) return;
            G.Social.setRules(Object.assign({}, rules, { [k]: v }));
          };
          const minus = document.createElement('button');
          minus.className = 'btn small ghost'; minus.type = 'button'; minus.textContent = '−';
          minus.disabled = i <= 0; minus.onclick = () => step(-1);
          const plus = document.createElement('button');
          plus.className = 'btn small ghost'; plus.type = 'button'; plus.textContent = '+';
          plus.disabled = i >= steps.length - 1; plus.onclick = () => step(1);
          row.append(minus, val, plus);
        } else row.appendChild(val);
        box.appendChild(row);
      }
      if (room.isHost && custom) {
        const b = document.createElement('button');
        b.className = 'btn small ghost'; b.type = 'button'; b.textContent = 'Volver a las normales';
        b.onclick = () => G.Social.setRules(null);
        box.appendChild(b);
      }
      const note = document.createElement('p');
      note.className = 'note';
      note.style.margin = '2px 0 0';
      note.textContent = room.isHost
        ? 'Sólo el líder las cambia. Si alguna no está al 100%, la partida no sube al ranking.'
        : 'Las elige el líder. Si alguna no está al 100%, la partida no sube al ranking.';
      box.appendChild(note);
    }

    function start() {
      const room = G.Social.room;
      if (!room || !room.isHost || room.members.length < 2) return;
      // El servidor manda `started` a todos (net/coop.js → G.Flow.startCoop).
      G.Net.send('start');
    }

    return { init, open, close, render };
  })();

  // ======================= INVITACIONES =======================

  G.InvitePop = (() => {
    let cur = null;

    function init() {
      $('inv-yes').onclick = async () => {
        if (!cur) return;
        const from = cur.from;
        hide();
        const r = await G.Social.acceptInvite(from);
        if (!r.ok) { G.UI.toast(r.error, 3000); return; }
        G.LobbyUI.open();
      };
      $('inv-no').onclick = () => { if (cur) G.Social.declineInvite(cur.from); hide(); };
      G.Social.on(what => { if (what === 'invites' || what === 'room') refresh(); });
    }

    function hide() { cur = null; $('invite-pop').classList.add('hidden'); }

    /** Enseña la invitación más antigua si estás en los menús (no en plena partida). */
    function refresh() {
      const room = G.Social.room;
      const list = G.Social.invites.filter(i => !room || i.room !== room.id).sort((a, b) => a.at - b.at);
      if (!list.length || G.Game.state !== 'ui' || !G.DB.loggedIn) { hide(); return; }
      if (cur && cur.from === list[0].from) return;
      cur = list[0];
      $('inv-text').innerHTML = `${G.Icons.html('friends', 22)} <b class="gold" translate="no">${esc(cur.name)}</b> te invita a jugar en su sala`;
      $('invite-pop').classList.remove('hidden');
      G.Audio.sfx('shiny');
    }

    return { init, refresh };
  })();

  G.SocialUI = {
    init() { G.NickUI.init(); G.FriendsUI.init(); G.LobbyUI.init(); G.InvitePop.init(); },
    withNick, needOnline
  };
})();
