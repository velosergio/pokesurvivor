/* Partida en solitario sin pantalla, llevada por un bot (sólo para pruebas).
 * Hace lo mismo que G.Game.startRun + update de js/game.js, sin pantallas:
 * las cartas de nivel se eligen solas (la primera) y no hay pausa. */
'use strict';

/**
 * @param sim  lo que devuelve createSim()
 * @param o.god  si cae, se levanta al momento (para llegar lejos en la partida)
 * @returns {{ pl, step(dt), time: number }}
 */
function soloRun(sim, { dex = 4, world = 1234, god = false } = {}) {
  const { G, clock } = sim;
  const mon = G.DEX_BY[dex];
  const pl = new G.Player(mon, G.Upgrades.perks({}), false);
  let time = 0, levels = 0, biome = 0;
  G.Game = { player: pl, st: { get time() { return time; } }, everyone: () => [pl], flash() {}, curtain() {}, levelXp: () => 20, offerBond() {} };
  for (const m of [G.Projectiles, G.EnemyMgr, G.Pickups, G.Path, G.Hazards]) m.clear();
  for (const m of [G.Spawner, G.Rift, G.Judgment, G.Events, G.Weather]) m.reset();
  G.Combat.clearFields();
  G.World.reset(world);
  G.World.setBiome(0, true);
  pl.addMove(G.startMoveOf(mon.dex));
  G.Camera.x = pl.x; G.Camera.y = pl.y;
  // El bot da vueltas grandes (así recorre mapa, rompe cosas y recoge).
  G.Input.axis = () => [Math.cos(time * 0.3), Math.sin(time * 0.3)];

  function collect(p) {
    if (p.kind === 'xp' || p.kind === 'xpBig') levels += pl.gainXp(p.value);
    else if (p.kind === 'coin') pl.coins += p.value;
    else if (p.kind === 'heal') pl.heal(pl.maxHp * 0.3);
    else if (p.kind === 'magnet') G.Pickups.pullAll();
  }

  function step(dt) {
    clock.t += dt;
    if (G.Judgment.cinematic) { G.Judgment.cineTick(dt); pl.anim.update(dt); G.World.update(dt, G.Camera); return; }
    time += dt;
    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) { biome = b; G.World.setBiome(b); }
    pl.update(dt);
    G.Camera.follow(pl.x, pl.y, dt);
    G.Step.world(dt, time, [pl], pl, true, collect);
    while (levels > 0) { levels--; const o = G.LevelUp.offer(pl); if (o.length) o[0].apply(pl); }
    if (god) { if (pl.dead) pl.revive(1); pl.hp = pl.maxHp; }
  }

  return { pl, step, get time() { return time; } };
}

module.exports = { soloRun };
