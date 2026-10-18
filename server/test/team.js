/* Partida de varios jugadores en la misma simulación (como la llevará el
 * servidor del cooperativo), llevada por bots (sólo para pruebas).
 * Igual que solo.js, pero con G.Step.team: los ataques, los choques y lo que
 * depende de un jugador valen para todos. Las cartas de nivel se eligen solas. */
'use strict';

/**
 * @param sim    lo que devuelve createSim()
 * @param o.dex  Pokémon de cada jugador (su número es el de jugadores)
 * @param o.god  si cae, se levanta al momento
 * @param o.gap  distancia entre jugadores al empezar
 * @returns {{ players, step(dt), time: number }}
 */
function teamRun(sim, { dex = [4, 7, 1, 25], world = 1234, god = false, gap = 160 } = {}) {
  const { G, clock } = sim;
  const players = dex.map(d => new G.Player(G.DEX_BY[d], G.Upgrades.perks({}), false));
  let time = 0, biome = 0;
  const levels = new Map(players.map(p => [p, 0]));
  G.Game = { player: players[0], st: { get time() { return time; } }, everyone: () => players,
             flash() {}, curtain() {}, levelXp: () => 20, offerBond() {} };
  G.RNG.reseed(world);
  for (const m of [G.Projectiles, G.EnemyMgr, G.Pickups, G.Path, G.Hazards]) m.clear();
  for (const m of [G.Spawner, G.Rift, G.Judgment, G.Events, G.Weather]) m.reset();
  G.Combat.clearFields();
  G.World.reset(world);
  G.World.setBiome(0, true);
  // En fila, separados (cada uno con su espacio).
  players.forEach((p, i) => {
    p.x = (i - (players.length - 1) / 2) * gap; p.y = 0;
    G.World.collide(p);
    p.addMove(G.startMoveOf(p.dex));
  });
  G.Camera.x = 0; G.Camera.y = 0;

  function collect(o, who) {
    who = who || players[0];
    if (o.kind === 'xp' || o.kind === 'xpBig') levels.set(who, levels.get(who) + who.gainXp(o.value));
    else if (o.kind === 'coin') who.coins += o.value;
    else if (o.kind === 'heal') who.heal(who.maxHp * 0.3);
    else if (o.kind === 'magnet') G.Pickups.pullAll();
  }

  function step(dt) {
    clock.t += dt;
    if (G.Judgment.cinematic) { G.Judgment.cineTick(dt); G.World.update(dt, G.Camera); return; }
    time += dt;
    const b = Math.floor(time / 240);
    if (b !== biome && !G.Rift.inArena && !G.Judgment.active) { biome = b; G.World.setBiome(b); }
    // Cada bot da vueltas grandes, cada uno con su fase.
    players.forEach((p, i) => {
      const a = time * 0.3 + i * 1.7;
      G.Input.axis = () => [Math.cos(a), Math.sin(a)];
      p.update(dt);
    });
    // La cámara (sin pantalla) sigue al grupo.
    const cx = players.reduce((s, p) => s + p.x, 0) / players.length;
    const cy = players.reduce((s, p) => s + p.y, 0) / players.length;
    G.Camera.follow(cx, cy, dt);
    G.Step.team(dt, time, players, collect);
    for (const p of players) {
      while (levels.get(p) > 0) { levels.set(p, levels.get(p) - 1); const o = G.LevelUp.offer(p); if (o.length) o[0].apply(p); }
      if (god) { if (p.dead) p.revive(1); p.hp = p.maxHp; }
    }
  }

  return { players, step, get time() { return time; } };
}

module.exports = { teamRun };
