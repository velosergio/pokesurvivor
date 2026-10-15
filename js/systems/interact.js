/* ============ interact.js — altares, manantiales, cofres con candado y trampas ============
 * Los objetos los coloca world.js (raros, en el suelo libre); aquí está lo que
 * pasa al tocarlos. Todo se mira alrededor de TU Pokémon:
 *
 *   altar     da un poder de 25 s (Furia, Rayo, Imán o Prisa) y se apaga
 *   spring    cura mientras estás encima; se agota y se recarga sola
 *   bigchest  quédate a su lado CHEST_TIME segundos (mientras te atacan) y se
 *             abre: monedas, tickets y experiencia para subir un nivel
 *   trap      salta al pisarla (tú o un enemigo) y afecta a todo lo cercano:
 *             veneno, pegajosa (ralentiza) o explosiva
 *
 * Cooperativo: todo lo decide el servidor (con `team`). El navegador no
 * activa altares, cofres ni trampas por su cuenta: el servidor manda
 *   alt [tx, ty, uid, poder]   quién se ha llevado el poder del altar (net/coop.js)
 *   chs [tx, ty, décimas]      cómo va la apertura de un cofre
 *   pb  [tx, ty]               cofre abierto / trampa que salta (world.breakAt)
 * Los manantiales se siguen viendo en cada navegador (la vida es la del servidor).
 */
G.Interact = (() => {
  const CHEST_TIME = 3.5;
  const POWER_TIME = 25;
  const POWERS = [
    { id: 'dmg', name: 'Furia', desc: 'daño ×2', color: '#ff5f6d', on: p => { p.atkMul *= 2; }, off: p => { p.atkMul /= 2; } },
    { id: 'spd', name: 'Rayo', desc: '+45% velocidad', color: '#5fd4ff', on: p => { p.spdMul *= 1.45; }, off: p => { p.spdMul /= 1.45; } },
    { id: 'mag', name: 'Imán', desc: 'atraes todo desde lejos', color: '#ff8ad8', on: p => { p.magnet *= 4; }, off: p => { p.magnet /= 4; } },
    { id: 'cd', name: 'Prisa', desc: '-40% recarga', color: '#ffd23f', on: p => { p.cdMul *= 0.6; }, off: p => { p.cdMul /= 0.6; } }
  ];
  const TRAP_R = 74;
  const authority = () => !G.Coop.active || G.Coop.isHost;
  let healShown = 0, healAcc = 0;
  /** (servidor) El equipo del último update(…, team); null en el juego. Lo usa trapEffect. */
  let crew = null;

  /**
   * @param pl    tu Pokémon: en el juego todo se mira alrededor de él
   * @param team  (servidor) todos los jugadores. Cada objeto se mira UNA vez por
   *              paso (aunque esté cerca de varios) y con todos a la vez:
   *              altar      el primero vivo que llega se lleva el poder (es suyo)
   *              manantial  se recarga una vez y cura a cada uno que esté encima
   *              cofre      se abre mientras haya alguien vivo al lado (no va más
   *                         rápido con más gente; se cierra si no queda nadie)
   *              trampa     salta si la pisa cualquiera, y daña a todos los de dentro
   */
  function update(dt, pl, team) {
    setTeam(team);
    const who = team || (pl ? [pl] : []);
    const seen = team ? new Set() : null;
    for (const q of who) {
      for (const p of G.World.specialsNear(q.x, q.y, 720)) {
        if (seen) { if (seen.has(p)) continue; seen.add(p); }
        special(dt, who, p);
      }
    }
  }

  /** (servidor) Equipo para trapEffect; G.Step.team lo pone al empezar el paso (una
   *  trampa puede romperla un ataque antes de llegar a update). null = el juego. */
  function setTeam(team) { crew = team || null; }

  function special(dt, who, p) {
    const py = p.type === 'spring' || p.type === 'trap' ? p.y - 8 : p.y;
    const d2 = q => G.U.dist2(q.x, q.y, p.x, py);
    switch (p.type) {
      case 'spring':
        if (p.charge < 1) p.charge = Math.min(1, p.charge + dt / 45);
        for (const q of who) spring(dt, q, p, d2(q));
        break;
      case 'altar':
        if (!authority()) break;                 // en grupo, lo dice el servidor (alt)
        // Contando el tamaño de tu Pokémon: uno grande (Reshiram, Zekrom...) choca
        // con el altar antes de llegar a 30 y no lo podía activar.
        for (const q of who) {
          if (!p.used && !q.dead && d2(q) < Math.max(30, p.r + q.r + 14) ** 2) { usePower(q, p); break; }
        }
        break;
      case 'bigchest':
        if (!authority()) break;                 // en grupo, la apertura llega del servidor (chs)
        const near = who.filter(q => !q.dead && d2(q) < Math.max(46, p.r + q.r + 24) ** 2);
        if (near.length) {
          if (p.open === 0) G.Audio.sfx('select');
          p.open += dt;
          if (p.open >= CHEST_TIME) { p.open = 0; for (const q of near) q.chests++; G.World.breakProp(p); }
        } else if (p.open > 0) p.open = Math.max(0, p.open - dt * 1.5);
        // Servidor: cómo va, en décimas (sólo cuando cambia).
        if (G.Coop.isHost && p.open >= 0) {
          const q = Math.round(p.open / CHEST_TIME * 10);
          if (q !== (p.netQ | 0)) { p.netQ = q; G.Coop.broadcast(['chs', p.tx, p.ty, q]); }
        }
        break;
      case 'trap':
        if (!authority()) break;                 // en grupo, salta en el servidor (pb)
        if (who.some(q => !q.dead && d2(q) < 13 * 13)) G.World.breakProp(p);
        else if (authority() && G.EnemyMgr.queryCircle(p.x, p.y - 8, 3).some(e => !e.flying && !e.remote)) G.World.breakProp(p);
        break;
    }
  }

  /** Cura a `pl` si está encima del manantial `p` (la recarga va aparte, en special). */
  function spring(dt, pl, p, d2) {
    if (pl.dead || d2 > 26 * 26 || p.charge <= 0.02 || pl.hp >= pl.maxHp) return;
    const before = pl.hp;
    pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.14 * dt);
    healAcc += pl.hp - before;
    p.charge = Math.max(0, p.charge - dt * 0.09);
    if (Math.random() < dt * 14) G.FX.px(pl.x + G.U.rand(-pl.r, pl.r), pl.y - G.U.rand(0, pl.bodyH), '#7dffb0', { vy: -50, life: 0.5 });
    healShown -= dt;
    if (healShown <= 0 && healAcc >= 1) {
      healShown = 0.6;
      G.FX.dmgText(pl.x, pl.y - pl.bodyH - 6, '+' + Math.round(healAcc), '#5fe08a');
      healAcc = 0;
      G.Audio.sfx('xp');
    }
    if (p.charge <= 0.02) G.Spawner.say('El manantial se ha secado (se recarga solo)', 2.2, true);
  }

  function usePower(pl, p) {
    p.used = true;
    const pw = POWERS[p.kind];
    pl.addPower(pw, POWER_TIME);
    if (G.Coop.isHost) G.Coop.broadcast(['alt', p.tx, p.ty, String(pl.uid || ''), p.kind]);
    G.FX.ring(p.x, p.y - 20, 8, 90, pw.color, 0.6, 5);
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, pw.color, 24, 200);
    G.Audio.sfx('legend');
    G.Spawner.say('¡Poder ' + pw.name + '! ' + pw.desc + ' durante ' + POWER_TIME + ' s', 3, true);
  }

  /**
   * Una trampa salta (en cada ordenador; ver la cabecera). El daño a enemigos
   * sólo lo hace quien manda; a ti te afecta si estás dentro.
   */
  function trapEffect(p) {
    const x = p.x, y = p.y - 8, k = p.kind;
    const col = ['#c86bdc', '#8bd94a', '#ff7b3d'][k];
    const pal = ['poison', 'grass', 'fire'][k];
    G.FX.ring(x, y, 6, TRAP_R, col, 0.5, k === 2 ? 7 : 4);
    G.FX.burst(x, y - 6, col, k === 2 ? 40 : 22, k === 2 ? 260 : 140);
    for (let i = 0; i < (k === 2 ? 10 : 7); i++) {
      const a = Math.random() * 6.2832, r = G.U.rand(8, TRAP_R * 0.8);
      G.FX.sp(k === 2 ? 'impact' : 'blob', pal, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 - 6,
              { vy: k === 2 ? -30 : -45, life: G.U.rand(0.4, 0.8) });
    }
    G.Audio.sfx(k === 2 ? 'boss' : 'surge');
    if (k === 2 && G.U.dist2(x, y, G.Camera.x, G.Camera.y) < 500 * 500) G.Camera.kick(0.7);

    // El nivel que manda en el daño: el tuyo; en el servidor, el del ancla (primer vivo).
    const pl = crew ? crew.find(q => !q.dead) || crew[0] : G.Game.player;
    const lvl = pl ? pl.level : 1;
    if (authority()) {
      for (const e of G.EnemyMgr.queryCircle(x, y, TRAP_R)) {
        if (e.remote) continue;
        if (k === 0) { e.applyPoison(5); e.hurt(14 + lvl * 3, '#d47cf0'); }
        else if (k === 1) { e.applySlow(0.65, 4.5); e.hurt(4, '#8bd94a'); }
        else e.hurt(90 + lvl * 18, '#ff7b3d', e.x - x, e.y - y, 220);
      }
    }
    // En el juego, a ti; en el servidor, a todos los del equipo que estén dentro.
    for (const q of crew || [pl]) {
      if (!q || q.dead || G.U.dist2(x, y, q.x, q.y) >= (TRAP_R * 0.7) ** 2) continue;
      q.invuln = 0;
      if (k === 0) q.hurt(q.maxHp * 0.1);
      else if (k === 1) { q.slowT = 3.5; G.FX.dmgText(q.x, q.y - q.bodyH - 6, '¡Pegajoso!', '#8bd94a'); }
      else q.hurt(q.maxHp * 0.2);
    }
  }

  /**
   * Grupo: el servidor dice quién se ha llevado el poder de un altar. El altar se
   * apaga para todos; si eres tú, el aviso y la cuenta atrás (los efectos ya
   * vienen del servidor en tu `kit`: aquí no se aplican otra vez).
   */
  function netAltar(tx, ty, uid, kind, me, pl) {
    const p = G.World.propOn(tx, ty);
    if (p) { p.used = true; G.FX.ring(p.x, p.y - 20, 8, 90, (POWERS[kind] || POWERS[0]).color, 0.6, 5); }
    const pw = POWERS[kind];
    if (!pw || uid !== me || !pl) return;
    pl.power = { def: { name: pw.name, color: pw.color, on() {}, off() {} }, t: POWER_TIME, dur: POWER_TIME };
    G.FX.burst(pl.x, pl.y - pl.bodyH * 0.5, pw.color, 24, 200);
    G.Audio.sfx('legend');
    G.Spawner.say('¡Poder ' + pw.name + '! ' + pw.desc + ' durante ' + POWER_TIME + ' s', 3, true);
  }

  /** Grupo: cómo va la apertura de un cofre (q en décimas). */
  function netChest(tx, ty, q) {
    const p = G.World.propOn(tx, ty);
    if (!p) return;
    if (q > 0 && !(p.open > 0)) G.Audio.sfx('select');
    p.open = q / 10 * CHEST_TIME;
  }

  return { update, setTeam, trapEffect, netAltar, netChest, POWERS, CHEST_TIME };
})();
