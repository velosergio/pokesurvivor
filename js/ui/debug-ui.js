/* ============ debug-ui.js — regalos del moderador (pantalla oculta) ============
 * Sólo G.Ranking.isAdmin. Escribe grants/{uid}; el juego del jugador lo suma
 * al sincronizar (js/core/grant.js). Las reglas rechazan a cualquiera más.
 */
G.DebugUI = (() => {
  const $ = G.UI.$;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VALID = /^[A-Za-z0-9_ñÑáéíóúÁÉÍÓÚ]{3,16}$/;
  let picked = null;

  function store() { return G.DB.fb && G.DB.fb.fs; }

  function init() {
    $('dbg-form').onsubmit = e => { e.preventDefault(); search($('dbg-nick').value); };
    $('dbg-coins').onclick = () => give('coins');
    $('dbg-t10').onclick = () => give('t10');
    $('dbg-mon-form').onsubmit = e => { e.preventDefault(); giveMon(); };
    $('dbg-mon-list').innerHTML = G.DEX.map(p => '<option value="' + esc(p.name) + ' #' + p.dex + '">').join('');
  }

  // «Pikachu #25», «Pikachu» o «25» -> entrada del Pokédex (o null).
  function findMon(raw) {
    const t = (raw || '').trim();
    const m = t.match(/#?(\d{1,4})$/);
    if (m && G.DEX_BY[+m[1]]) return G.DEX_BY[+m[1]];
    const low = t.toLowerCase();
    return G.DEX.find(p => p.name.toLowerCase() === low) || null;
  }

  function setBusy(busy) {
    for (const id of ['dbg-coins', 'dbg-t10', 'dbg-mon', 'dbg-mon-shiny', 'dbg-mon-give']) $(id).disabled = busy;
  }

  function open() {
    if (!G.Ranking.isAdmin()) return;
    G.UI.show('scr-debug', true);
  }

  function clearCard() {
    picked = null;
    $('dbg-card').classList.add('hidden');
    $('dbg-card').innerHTML = '';
    setBusy(true);
  }

  async function search(raw) {
    $('dbg-err').textContent = '';
    const name = (raw || '').trim();
    if (!VALID.test(name)) {
      $('dbg-err').textContent = 'El apodo debe tener 3-16 letras, números o _.';
      clearCard();
      return;
    }
    const db = store();
    if (!db) { $('dbg-err').textContent = 'Hace falta una cuenta en la nube.'; clearCard(); return; }
    try {
      const snap = await db.collection('names').doc(name.toLowerCase()).get();
      if (!snap.exists) {
        $('dbg-err').textContent = 'No hay ningún jugador con ese apodo.';
        clearCard();
        return;
      }
      await showPicked(snap.data().uid, name);
    } catch (e) {
      $('dbg-err').textContent = 'No se pudo buscar (' + (e.code || e.message) + ').';
      clearCard();
    }
  }

  async function showPicked(uid, fallback) {
    const db = store();
    const [prof, save, grant] = await Promise.all([
      db.collection('profiles').doc(uid).get(),
      db.collection('saves').doc(uid).get(),
      db.collection('grants').doc(uid).get()
    ]);
    const name = (prof.exists && prof.data().name) || fallback;
    const s = save.exists ? (save.data().save || {}) : null;
    const coins = s ? (s.coins || 0) : 0;
    const t10 = s && s.tickets ? (s.tickets.t10 || 0) : 0;
    const g = grant.exists ? grant.data() : { coins: 0, t10: 0 };
    const owned = (s && s.owned) || {}, shiny = (s && s.shiny) || {};
    const gm = g.mons || {}, gs = g.shinies || {};
    const pendM = Object.keys(gm).filter(d => !owned[d]).length
      + Object.keys(gs).filter(d => !shiny[d]).length;
    const pendC = Math.max(0, (g.coins || 0) - ((s && s.grantedCoins) || 0));
    const pendT = Math.max(0, (g.t10 || 0) - ((s && s.grantedT10) || 0));
    picked = { uid: uid, name: name, owned: owned, shiny: shiny, gm: gm, gs: gs };
    const card = $('dbg-card');
    card.classList.remove('hidden');
    card.innerHTML = '<p><b translate="no">' + esc(name) + '</b></p>'
      + '<p class="sub" translate="no">' + coins.toLocaleString('es') + ' monedas · ' + t10.toLocaleString('es') + ' tickets ×10</p>'
      + '<p class="sub" translate="no">Pendiente: ' + pendC.toLocaleString('es') + ' monedas · ' + pendT.toLocaleString('es') + ' tickets ×10'
      + (pendM ? ' · ' + pendM + ' Pokémon' : '') + '</p>'
      + '<p class="sub" translate="no">' + Object.keys(owned).length + ' Pokémon · ' + Object.keys(shiny).length + ' shiny</p>'
      + (s ? '' : '<p class="sub">Aún no tiene partida.</p>');
    setBusy(false);
    $('dbg-err').textContent = '';
  }

  async function give(field) {
    if (!G.Ranking.isAdmin() || !picked) return;
    const label = field === 'coins' ? '100.000 monedas' : '100 tickets ×10';
    if (!confirm('¿Dar ' + label + ' a ' + picked.name + '?')) return;
    const uid = picked.uid, name = picked.name;
    setBusy(true);
    try {
      const ref = store().collection('grants').doc(uid);
      await store().runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : { coins: 0, t10: 0 };
        const doc = {
          coins: (d.coins || 0) + (field === 'coins' ? 100000 : 0),
          t10: (d.t10 || 0) + (field === 't10' ? 100 : 0),
          at: firebase.firestore.FieldValue.serverTimestamp()
        };
        // Los Pokémon de la libreta se conservan tal cual (las reglas no dejan quitarlos).
        if (d.mons) doc.mons = d.mons;
        if (d.shinies) doc.shinies = d.shinies;
        tx.set(ref, doc);
      });
    } catch (e) {
      G.UI.toast('No se pudo: ' + (e.code || e.message));
      if (picked) setBusy(false);
      return;
    }
    // La escritura ya está hecha: si sólo falla el refresco de la tarjeta, sigue siendo un éxito.
    G.UI.toast('Anotado. Lo verá al sincronizar.');
    try { await showPicked(uid, name); }
    catch (e) { if (picked) setBusy(false); }
  }

  // Un Pokémon (o su shiny) a la libreta: mons / shinies { dex: true }, uno por escritura.
  async function giveMon() {
    if (!G.Ranking.isAdmin() || !picked) return;
    const p = findMon($('dbg-mon').value);
    if (!p) { $('dbg-err').textContent = 'No existe ese Pokémon.'; return; }
    const sh = $('dbg-mon-shiny').checked;
    const field = sh ? 'shinies' : 'mons', d = String(p.dex);
    const label = p.name + (sh ? ' shiny' : '');
    if ((sh ? picked.gs : picked.gm)[d]) { $('dbg-err').textContent = label + ' ya está en su libreta.'; return; }
    const has = sh ? picked.shiny[d] : picked.owned[d];
    if (!confirm((has ? 'Ya tiene ' + label + '. ' : '') + '¿Dar ' + label + ' a ' + picked.name + '?')) return;
    $('dbg-err').textContent = '';
    const uid = picked.uid, name = picked.name;
    setBusy(true);
    try {
      const ref = store().collection('grants').doc(uid);
      await store().runTransaction(async tx => {
        const snap = await tx.get(ref);
        const g = snap.exists ? snap.data() : {};
        const doc = {
          coins: g.coins || 0,
          t10: g.t10 || 0,
          mons: Object.assign({}, g.mons),
          shinies: Object.assign({}, g.shinies),
          at: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (doc[field][d]) throw { message: 'ya estaba en la libreta' };
        doc[field][d] = true;
        tx.set(ref, doc);
      });
    } catch (e) {
      G.UI.toast('No se pudo: ' + (e.code || e.message));
      if (picked) setBusy(false);
      return;
    }
    G.UI.toast('Anotado: ' + label + '. Lo verá al sincronizar.');
    $('dbg-mon').value = '';
    try { await showPicked(uid, name); }
    catch (e) { if (picked) setBusy(false); }
  }

  return { init: init, open: open };
})();
