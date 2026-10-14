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
   * @param time     segundos de partida
   * @param all      todos los jugadores (en solitario, [me])
   * @param me       el jugador cuyos ataques se resuelven en este paso
   * @param host     lleva enemigos y apariciones (solitario o anfitrión)
   * @param collect  (objeto, quién) al recoger algo del suelo
   */
  world(dt, time, all, me, host, collect) {
    G.World.update(dt, G.Camera);
    if (host) { G.Path.update(dt, all); G.Spawner.update(dt, all, time); }
    else G.Spawner.tickBanner(dt);
    G.EnemyMgr.update(dt, all);
    G.EnemyMgr.rebuildGrid();
    G.Combat.tick(dt, me, time);
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
  }
};
