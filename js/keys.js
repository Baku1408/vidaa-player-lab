/* VIDAA Player Lab — télécommande : dispatch des touches + navigation par focus
 * ═══════════════════════════════════════════════════════════════════════
 * Codes observés/utilisés :
 *  - Couleurs 403/404/405/406, Info 457, Ch+ 427 / Ch- 428, Retour 8/461/10009 :
 *    ces codes sont ceux déclarés par le projet de référence stremio-vidaa-tv
 *    (patches/head/kernel/keys.js) — donc documentés sur VIDAA.
 *  - Play/Pause/REW/FF (415/19/412/413) et flèches/OK (37-40/13) : codes
 *    historiques Opera TV/Vewd & CE-HTML — NON confirmés ici : c'est pourquoi
 *    le journal enregistre CHAQUE code réellement reçu (panneau « Dernières
 *    touches ») pour être calibré sur VOTRE télécommande/firmware.
 * Aucune API native n'est appelée : uniquement des événements DOM clavier.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CODES = {
    13: 'ok', 32: 'space',
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    403: 'red', 404: 'green', 405: 'yellow', 406: 'blue',
    457: 'info', 73: 'i',
    427: 'chUp', 428: 'chDown',
    8: 'back', 461: 'back', 10009: 'back', 27: 'escape',
    19: 'pause', 415: 'play', 412: 'rewind', 413: 'forward',
    417: 'fastForward', 416: 'fastRewind', 10252: 'playPause',
    461: 'back', 10182: 'exit', 457: 'info'
  };

  var handlers = {};
  var lastKeys = [];   // {code, name, key, at}
  function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ─── Navigation spatiale (D-pad) ────────────────────────────────────────
  function focusables() {
    var els = document.querySelectorAll('button:not([disabled]), [data-focus], input, video, a[href]');
    var vis = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest && el.closest('.hidden')) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.offsetParent === null && el.tagName !== 'VIDEO') continue;
      vis.push(el);
    }
    return vis;
  }

  function moveFocus(dir) {
    var list = focusables();
    if (!list.length) return;
    var cur = document.activeElement;
    if (!cur || list.indexOf(cur) === -1) { list[0].focus(); return; }
    var r = cur.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === cur) continue;
      var b = el.getBoundingClientRect();
      var bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - cx, dy = by - cy;
      var main = (dir === 'left') ? -dx : (dir === 'right') ? dx : (dir === 'up') ? -dy : dy;
      var cross = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);
      if (main <= 1) continue;                       // doit être dans la direction
      var score = main + cross * 2;                  // privilégie l'alignement
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) {
      best.focus();
      try { best.scrollIntoView({ block: 'nearest' }); } catch (e) { try { best.scrollIntoView(); } catch (e2) {} }
      var lbl = (best.textContent || best.id || best.tagName).trim().substring(0, 50);
      window.VLog.log('debug', 'keys', 'focus → ' + lbl);
    }
  }

  function inVideo() { return document.activeElement && document.activeElement.tagName === 'VIDEO'; }

  function dispatch(e) {
    var code = e.keyCode || e.which || 0;
    var name = CODES[code] || null;
    var key = e.key || '';

    // Journalise TOUJOUT le code brut (calibration télécommande)
    lastKeys.push({ code: code, name: name || '?', key: key, at: new Date().toISOString().substring(11, 23) });
    if (lastKeys.length > 40) lastKeys.shift();
    if (name || code) {
      window.VLog.log('debug', 'keys', 'keydown keyCode=' + code +
        (name ? ' (' + name + ')' : '') + (key ? ' key="' + key + '"' : ''));
    }

    // Clavier écran actif : on laisse la saisie tranquille
    var osk = document.getElementById('osk');
    if (osk && !osk.className.match(/hidden/)) {
      if (name === 'back' || name === 'escape') { hideOsk(); e.preventDefault(); }
      return;
    }

    var handled = false;
    var fns = name ? (handlers[name] || []) : [];
    if (fns.length) {
      // Si des handlers sont enregistrés pour cette touche, elle est consommée
      // (preventDefault) même si un handler lève — pas de navigation par défaut.
      handled = true;
      for (var i = 0; i < fns.length; i++) {
        try { fns[i]({ code: code, name: name, event: e }); }
        catch (err) { window.VLog.log('error', 'keys', 'handler ' + name + ' : ' + err.message); }
      }
    }

    // Navigation par défaut (flèches / OK) si personne n'a consommé la touche
    if (!handled) {
      if (name === 'left' || name === 'right' || name === 'up' || name === 'down') {
        if (inVideo() && (name === 'left' || name === 'right')) {
          // Dans la vidéo : ◀ ▶ = saut temporel
          window.VPlayer.seekBy(name === 'right' ? 10 : -10);
          handled = true;
        } else {
          moveFocus(name);
          handled = true;
        }
      } else if (name === 'ok' || name === 'space') {
        var act = document.activeElement;
        if (act && act.tagName === 'BUTTON') {
          try { act.click(); } catch (err) {}
          handled = true;
        } else if (act && act.tagName === 'VIDEO') {
          window.VPlayer.togglePlay();
          handled = true;
        } else if (act && act.tagName === 'INPUT') {
          handled = true;                      // saisie en cours
        } else {
          moveFocus('down');
          handled = true;
        }
      }
    }

    if (handled) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    }
  }

  var oskPrev = null;
  function showOsk(onOk) {
    var osk = document.getElementById('osk'), inp = document.getElementById('osk-input');
    if (!osk) return;
    oskPrev = document.activeElement;
    osk.className = '';
    inp.value = window.VSources.getCustom() || '';
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
    document.getElementById('osk-ok').onclick = function () {
      var v = (inp.value || '').trim();
      hideOsk();
      if (v) onOk(v);
    };
    document.getElementById('osk-cancel').onclick = function () { hideOsk(); };
  }
  function hideOsk() {
    var osk = document.getElementById('osk');
    if (osk) osk.className = 'hidden';
    if (oskPrev && oskPrev.focus) { try { oskPrev.focus(); } catch (e) {} }
  }

  function init() {
    document.addEventListener('keydown', dispatch, true);
    window.VLog.log('info', 'keys', 'écoute clavier active (codes bruts journalisés).');
  }

  window.VKeys = {
    init: init,
    on: on,
    lastKeys: function () { return lastKeys.slice(); },
    showOsk: showOsk,
    hideOsk: hideOsk,
    moveFocus: moveFocus
  };
})();
