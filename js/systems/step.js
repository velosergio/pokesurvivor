/* ============ step.js — un paso del mundo ============
 *
 * Todo lo que avanza en la partida salvo el Pokémon propio, la cámara, la
 * música y las pantallas: terreno, enemigos, ataques, objetos, trampas, grietas,
 * la Sentencia, eventos y clima. Siempre en este orden.
 *
 * Lo usan el juego (game.js) y la simulación sin pantalla (server/sim.js), así
 * los dos avanzan exactamente igual. Aquí no se dibuja nada.
 */
G.Step = {
  /**
   * @param dt       segundos de este paso
   * @param time     segundos de partida
   * @param all      todos los jugadores (en solitario, [me])
   * @param me       el jugador cuyos ataques se resuelven en este paso
   * @param host     lleva enemigos, apariciones y ataques (solitario). Si no
   *                 (en grupo: lo lleva el servidor), los enemigos son copias y
   *                 tus ataques llegan del servidor como fantasma (net/coop.js)
   * @param collect  (objeto, quién) al recoger algo del suelo
   */
  world(dt, time, all, me, host, collect) {
    G.World.update(dt, G.Camera);
    if (host) { G.Path.update(dt, all); G.Spawner.update(dt, all, time); }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    G.EnemyMgr.rebuildGrid();
    if (host) G.Combat.tick(dt, me, time);
    G.Projectiles.update(dt, me, G.EnemyMgr.all());
    G.Combat.resolve(dt, me, time);
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, all, collect);
    G.Hazards.update(dt);
    G.Interact.update(dt, me);
    G.Rift.update(dt, me, time);
    G.Judgment.update(dt, me, time);
    G.Events.update(dt, all, time);
    G.Weather.update(dt, time, me);
  },

  /**
   * Un paso con TODOS los jugadores en la misma simulación (el servidor del
   * cooperativo): como `world` con host = true, pero los ataques, los choques y
   * lo que depende de un jugador valen para cada uno.
   *
   *   ataques     Combat.tick de cada jugador (los caídos no atacan)
   *   disparos    cada disparo amigo cuenta para su `owner` (daño, estadísticas
   *               y críticos); los enemigos dan al primer vivo que tocan (uno
   *               por disparo); el contacto enemigo se mira para cada vivo
   *   Interact    cada altar/manantial/cofre/trampa una vez, con todos (ver interact.js)
   *   Rift        abrir la grieta y la arena son globales; entra el grupo en
   *               cuanto la toca uno vivo cualquiera
   *   Judgment    la Sentencia es global; el toque de Arceus se mira para cada uno
   *   Weather     el clima es uno para todos; la arena y la nieve hieren a cada uno
   *   Events      el premio del rescate cura a todos los vivos
   *
   * Donde una función aún pide "un" jugador (dueño por defecto de un orbe, nivel
   * de una trampa...) se le pasa el ANCLA: el primer vivo (o el primero si han
   * caído todos).
   *
   * @param players  todos los jugadores de la partida (no vacío)
   * @param collect  (objeto, quién) al recoger algo del suelo
   */
  team(dt, time, players, collect) {
    const anchor = players.find(p => !p.dead) || players[0];
    G.Interact.setTeam(players);
    G.World.update(dt, G.Camera);
    G.Path.update(dt, players);
    G.Spawner.update(dt, players, time);
    G.EnemyMgr.update(dt, players);
    G.EnemyMgr.rebuildGrid();
    for (const p of players) G.Combat.tick(dt, p, time);
    G.Projectiles.update(dt, anchor, G.EnemyMgr.all(), players);
    G.Combat.resolve(dt, anchor, time, players);
    G.Combat.updateFields(dt);
    G.Pickups.update(dt, players, collect);
    G.Hazards.update(dt);
    G.Interact.update(dt, anchor, players);
    G.Rift.update(dt, anchor, time, players);
    G.Judgment.update(dt, anchor, time, players);
    G.Events.update(dt, players, time, true);
    G.Weather.update(dt, time, anchor, players);
  }
};
