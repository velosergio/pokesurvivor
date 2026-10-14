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
  }

  function open() {
    if (!G.Ranking.isAdmin()) return;
    G.UI.show('scr-debug', true);
  }

  function clearCard() {
    picked = null;
    $('dbg-card').classList.add('hidden');
    $('dbg-card').innerHTML = '';
    $('dbg-coins').disabled = true;
    $('dbg-t10').disabled = true;
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
    const pendC = Math.max(0, (g.coins || 0) - ((s && s.grantedCoins) || 0));
    const pendT = Math.max(0, (g.t10 || 0) - ((s && s.grantedT10) || 0));
    picked = { uid: uid, name: name };
    const card = $('dbg-card');
    card.classList.remove('hidden');
    card.innerHTML = '<p><b translate="no">' + esc(name) + '</b></p>'
      + '<p class="sub" translate="no">' + coins.toLocaleString('es') + ' monedas · ' + t10.toLocaleString('es') + ' tickets ×10</p>'
      + '<p class="sub" translate="no">Pendiente: ' + pendC.toLocaleString('es') + ' monedas · ' + pendT.toLocaleString('es') + ' tickets ×10</p>'
      + (s ? '' : '<p class="sub">Aún no tiene partida.</p>');
    $('dbg-coins').disabled = false;
    $('dbg-t10').disabled = false;
    $('dbg-err').textContent = '';
  }

  async function give(field) {
    if (!G.Ranking.isAdmin() || !picked) return;
    const label = field === 'coins' ? '100.000 monedas' : '1.000 tickets ×10';
    if (!confirm('¿Dar ' + label + ' a ' + picked.name + '?')) return;
    const uid = picked.uid, name = picked.name;
    $('dbg-coins').disabled = true;
    $('dbg-t10').disabled = true;
    try {
      const ref = store().collection('grants').doc(uid);
      await store().runTransaction(async tx => {
        const snap = await tx.get(ref);
        const d = snap.exists ? snap.data() : { coins: 0, t10: 0 };
        tx.set(ref, {
          coins: (d.coins || 0) + (field === 'coins' ? 100000 : 0),
          t10: (d.t10 || 0) + (field === 't10' ? 1000 : 0),
          at: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      G.UI.toast('Anotado. Lo verá al sincronizar.');
      await showPicked(uid, name);
    } catch (e) {
      G.UI.toast('No se pudo: ' + (e.code || e.message));
      if (picked) { $('dbg-coins').disabled = false; $('dbg-t10').disabled = false; }
    }
  }

  return { init: init, open: open };
})();
