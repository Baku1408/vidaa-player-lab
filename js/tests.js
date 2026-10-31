/* VIDAA Player Lab — suite de tests de lecture exécutée SUR LA VRAIE TV.
 * Chaque test renvoie une promesse résolue par {ok, detail} ; échec = timeout
 * ou état inattendu. Aucun résultat n'est déclaré « PASS » sans preuve.
 */
(function () {
  'use strict';

  var LS_PENDING = 'vidaa_lab_pending_test';   // 'pending' | 'done'

  function L(level, msg, data) { window.VLog.log(level, 'test', msg, data); }
  function $(id) { return document.getElementById(id); }

  function v() { return window.VPlayer.video(); }

  /** Attend un événement sur <video> ou abandonne après ms. */
  function waitEvent(ev, ms, predicate) {
    return new Promise(function (resolve, reject) {
      var el = v();
      if (!el) { reject(new Error('aucun élément vidéo')); return; }
      var done = false;
      function cleanup() { el.removeEventListener(ev, ok); clearTimeout(t); }
      function ok() {
        if (predicate && !predicate()) return;         // événement non concluant
        if (done) return; done = true; cleanup(); resolve(true);
      }
      el.addEventListener(ev, ok);
      var t = setTimeout(function () {
        if (done) return; done = true; cleanup();
        reject(new Error('timeout ' + ms + ' ms sans « ' + ev + ' »'));
      }, ms || 6000);
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function state() {
    var el = v();
    return {
      paused: el ? el.paused : null,
      t: el ? el.currentTime : 0,
      dur: el ? el.duration : 0
    };
  }

  // ─── Les tests ──────────────────────────────────────────────────────────
  var TESTS = [
    {
      id: 'metadata', label: 'Chargement des métadonnées (durée, dimensions)',
      run: function () {
        var el = v();
        if (!el || (!el.currentSrc && !el.src)) {
          return Promise.resolve({ ok: false, detail: 'Aucune source chargée — choisissez une source avant les tests.' });
        }
        if (el.readyState >= 1 && isFinite(el.duration)) {
          return Promise.resolve({ ok: true, detail: 'déjà lues · ' + window.VPlayer.fmt(el.duration) });
        }
        return waitEvent('loadedmetadata', 12000).then(function () {
          return { ok: true, detail: window.VPlayer.fmt(el.duration) + ' · ' + el.videoWidth + 'x' + el.videoHeight };
        }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
      }
    },
    {
      id: 'play', label: 'Lecture (▶ play → événement « playing »)',
      run: function () {
        var el = v();
        if (el && !el.paused && el.currentTime > 0.3) {
          return Promise.resolve({ ok: true, detail: 'déjà en lecture à ' + window.VPlayer.fmt(el.currentTime) });
        }
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
        return waitEvent('playing', 8000).then(function () {
          return { ok: true, detail: 'lecture démarrée à ' + window.VPlayer.fmt(el.currentTime) };
        }).catch(function (e) {
          return { ok: false, detail: String(e.message || e) + (el.error ? ' · erreur média code ' + el.error.code : '') };
        });
      }
    },
    {
      id: 'pause', label: 'Pause (⏸ l\'état paused devient vrai)',
      run: function () {
        var el = v();
        el.pause();
        return waitEvent('pause', 2500).then(function () {
          return { ok: el.paused === true, detail: 'paused=' + el.paused };
        }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
      }
    },
    {
      id: 'unpause', label: 'Reprise après pause (▶ relecture)',
      run: function () {
        var el = v();
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
        return waitEvent('playing', 8000).then(function () {
          return { ok: true, detail: 'reprise à ' + window.VPlayer.fmt(el.currentTime) };
        }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
      }
    },
    {
      id: 'ffwd', label: 'Avance rapide (+10 s : le temps saute et progresse)',
      run: function () {
        var el = v();
        var dur = el.duration;
        if (!isFinite(dur) || dur < 30) {
          return Promise.resolve({ ok: false, skip: true, detail: 'durée ' + window.VPlayer.fmt(dur) + ' < 30 s : test inadapté à cette source.' });
        }
        var before = el.currentTime;
        if (before + 12 > dur) { window.VPlayer.seekTo(dur / 2); before = dur / 2; }
        window.VPlayer.seekBy(10);
        return waitEvent('seeked', 5000).then(function () {
          var after = el.currentTime;
          var gain = after - before;
          if (gain >= 8) return { ok: true, detail: '+' + gain.toFixed(1) + ' s (' + window.VPlayer.fmt(before) + ' → ' + window.VPlayer.fmt(after) + ')' };
          return { ok: false, detail: 'gain seulement ' + gain.toFixed(1) + ' s (attendu ≥ 8 s)' };
        }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
      }
    },
    {
      id: 'rewind', label: 'Retour arrière (−10 s : le temps revient en arrière)',
      run: function () {
        var el = v();
        var chain = Promise.resolve();
        if (el.currentTime < 15) {                       // pas assez de recul possible
          window.VPlayer.seekTo(Math.min((el.duration || 60) / 2, 40));
          chain = waitEvent('seeked', 5000).catch(function () {});
        }
        return chain.then(function () {
          var before = el.currentTime;
          window.VPlayer.seekBy(-10);
          return waitEvent('seeked', 5000).then(function () {
            var gain = before - el.currentTime;
            if (gain >= 8) return { ok: true, detail: '−' + gain.toFixed(1) + ' s (' + window.VPlayer.fmt(before) + ' → ' + window.VPlayer.fmt(el.currentTime) + ')' };
            return { ok: false, detail: 'recul seulement ' + gain.toFixed(1) + ' s (attendu ≥ 8 s)' };
          });
        }).catch(function (e) { return { ok: false, detail: String(e.message || e) }; });
      }
    },
    {
      id: 'buffer', label: 'Buffer (données disponibles devant la lecture)',
      run: function () {
        var el = v();
        return sleep(2500).then(function () {
          var ahead = window.VPlayer.bufferedAhead();
          if (ahead > 0.5) return { ok: true, detail: ahead.toFixed(1) + ' s devant' };
          return { ok: false, detail: ahead.toFixed(2) + ' s seulement (réseau lent ou flux en direct)' };
        });
      }
    },
    {
      id: 'ended', label: 'Fin de vidéo (événement « ended »)',
      run: function () {
        var el = v();
        if (!isFinite(el.duration) || el.duration < 5) {
          return Promise.resolve({ ok: false, skip: true, detail: 'durée invalide' });
        }
        var back = el.currentTime;
        el.currentTime = Math.max(0, el.duration - 1.5);
        return waitEvent('ended', 10000).then(function () {
          return { ok: true, detail: 'événement ended reçu' };
        }).catch(function (e) {
          return { ok: false, detail: String(e.message || e) };
        }).then(function (r) {
          try { el.currentTime = back; } catch (e) {}     // restaure la position
          return r;
        });
      }
    },
    {
      id: 'resume', label: 'Reprise après rechargement (mémorise maintenant, valide au prochain chargement)',
      run: function () {
        var el = v();
        var t = el.currentTime;
        if (t < 5) return Promise.resolve({ ok: false, skip: true, detail: 'position trop proche du début pour ce test.' });
        if (!window.VPlayer.saveResume('test')) return Promise.resolve({ ok: false, detail: 'localStorage refusé' });
        try { localStorage.setItem(LS_PENDING, 'pending'); } catch (e) {}
        return Promise.resolve({
          ok: true, pending: true,
          detail: 'position ' + window.VPlayer.fmt(t) + ' mémorisée : RECHARGEZ la page (ou reprenez l\'URL) ; ' +
            'le test se finalisera automatiquement au chargement suivant.'
        });
      }
    }
  ];

  // ─── Rendu + exécution ──────────────────────────────────────────────────
  function render(rows, runningIndex) {
    var ol = $('test-results');
    if (!ol) return;
    var html = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var cls = r.status === 'PASS' ? 'pass' : (r.status === 'FAIL' ? 'fail' :
        (r.status === 'EN ATTENTE' ? 'skip' : (r.status === 'SKIP' ? 'skip' : '')));
      html.push('<li><b>' + r.label + '</b> — <span class="' + cls + '">' + r.status + '</span>' +
        (r.detail ? '<br><span class="detail">' + r.detail.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' : '') +
        '</li>');
    }
    ol.innerHTML = html.join('');
  }

  function clear() {
    var ol = $('test-results');
    if (ol) ol.innerHTML = '';
    try { localStorage.removeItem(LS_PENDING); } catch (e) {}
    window.VPlayer.clearResume();
  }

  var running = false;

  function runAll() {
    if (running) { L('warn', 'Suite déjà en cours.'); return Promise.resolve(); }
    running = true;
    var rows = TESTS.map(function (t) { return { label: t.label, status: 'en cours…', detail: '' }; });
    render(rows);
    L('info', 'Démarrage de la suite (' + TESTS.length + ' tests) sur source : ' +
      (window.VPlayer.current() ? window.VPlayer.current().label : '(aucune)'));

    var p = Promise.resolve();
    TESTS.forEach(function (t, idx) {
      p = p.then(function () {
        rows[idx].status = 'en cours…';
        render(rows);
        var timeout = new Promise(function (res) {
          setTimeout(function () { res({ ok: false, detail: 'timeout global du test (15 s)' }); }, 15000);
        });
        return Promise.race([t.run(), timeout]).then(function (r) {
          r = r || { ok: false, detail: 'aucun résultat' };
          rows[idx].status = r.skip ? 'SKIP' : (r.pending ? 'EN ATTENTE' : (r.ok ? 'PASS' : 'FAIL'));
          rows[idx].detail = r.detail || '';
          L(r.skip ? 'warn' : (r.ok ? 'success' : 'error'),
            t.id + ' → ' + rows[idx].status + (r.detail ? ' · ' + r.detail : ''));
          render(rows);
        }).catch(function (e) {
          rows[idx].status = 'FAIL';
          rows[idx].detail = String(e && e.message ? e.message : e);
          L('error', t.id + ' → FAIL · ' + rows[idx].detail);
          render(rows);
        });
      });
    });

    return p.then(function () {
      running = false;
      var pass = 0, fail = 0, other = 0;
      rows.forEach(function (r) {
        if (r.status === 'PASS') pass++;
        else if (r.status === 'FAIL') fail++;
        else other++;
      });
      L(fail ? 'warn' : 'success', 'Suite terminée : ' + pass + ' PASS / ' + fail + ' FAIL / ' + other + ' autres.');
      var hud = $('native-status');
      if (hud && fail === 0) { /* n'altère pas le statut natif */ }
      render(rows);
    });
  }

  /** Finalisation du test de reprise au chargement (appelée par app.js). */
  function finalizePendingResume(ok, detail) {
    var pending = null;
    try { pending = localStorage.getItem(LS_PENDING); } catch (e) {}
    if (pending !== 'pending') return false;
    try { localStorage.setItem(LS_PENDING, 'done'); } catch (e) {}
    var ol = $('test-results');
    if (ol) {
      var li = document.createElement('li');
      li.innerHTML = '<b>Reprise après rechargement (finalisation)</b> — <span class="' +
        (ok ? 'pass' : 'fail') + '">' + (ok ? 'PASS' : 'FAIL') + '</span>' +
        '<br><span class="detail">' + String(detail || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
      ol.appendChild(li);
    }
    L(ok ? 'success' : 'error', 'Test de reprise finalisé : ' + (ok ? 'PASS' : 'FAIL') + ' — ' + (detail || ''));
    return true;
  }

  window.VTests = {
    runAll: runAll,
    clear: clear,
    list: function () { return TESTS.slice(); },
    finalizePendingResume: finalizePendingResume
  };
})();
