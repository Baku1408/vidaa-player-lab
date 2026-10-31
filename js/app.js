/* VIDAA Player Lab — assemblage : sources, boutons, touches couleur, badges,
 * handoff natif, tests, diagnostic, reprise. */
(function () {
  'use strict';

  var LS_LAST = 'vidaa_lab_last_source';

  function L(level, msg, data) { window.VLog.log(level, 'app', msg, data); }
  function $(id) { return document.getElementById(id); }

  // ─── Toast ──────────────────────────────────────────────────────────────
  var toastTimer = null;
  function toast(msg, cls, ms) {
    var el = $('toast');
    if (!el) return;
    el.className = 'toast ' + (cls || 'info');
    el.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast hidden'; }, ms || 6000);
    L(cls === 'bad' ? 'warn' : 'info', 'toast: ' + msg);
  }

  // ─── Badges d'état ──────────────────────────────────────────────────────
  function setBadge(id, txt, cls) {
    var el = $(id);
    if (!el) return;
    el.textContent = txt;
    el.className = 'badge ' + cls;
  }
  function refreshBadges() {
    setBadge('badge-https', location.protocol === 'https:' ? 'HTTPS ✓' : 'HTTP ✗',
      location.protocol === 'https:' ? 'ok' : 'bad');
    var mse = (typeof window.MediaSource !== 'undefined') || (typeof window.WebKitMediaSource !== 'undefined');
    setBadge('badge-mse', mse ? 'MSE ✓' : 'MSE ✗', mse ? 'ok' : 'bad');
    var nativeHls = '';
    try { nativeHls = document.createElement('video').canPlayType('application/vnd.apple.mpegurl'); } catch (e) {}
    setBadge('badge-hls', nativeHls ? 'HLS natif ✓' : 'HLS via hls.js', nativeHls ? 'ok' : 'warn');
    var d = window.VNative.detect();
    setBadge('badge-omi', d.send ? 'omi_platform ✓' : 'omi_platform ✗', d.send ? 'ok' : 'bad');
    var on = navigator.onLine !== false;
    setBadge('badge-net', on ? 'En ligne' : 'HORS LIGNE', on ? 'ok' : 'bad');
    L('debug', 'badges: https=' + (location.protocol === 'https:') + ' mse=' + mse +
      ' hlsNatif="' + nativeHls + '" omi=' + d.send + ' online=' + on);
  }

  // ─── Sources ────────────────────────────────────────────────────────────
  function loadSource(src, opts) {
    opts = opts || {};
    L('info', 'Source demandée : ' + src.label + ' — ' + src.url);
    try { localStorage.setItem(LS_LAST, JSON.stringify({ id: src.id || 'custom', url: src.url })); } catch (e) {}
    return window.VPlayer.load(src, opts).catch(function (err) {
      if (String(err.message).indexOf('timeout') === -1 && String(err.message) !== 'hls-unsupported') {
        toast('Chargement échoué : ' + err.message, 'bad');
      }
      throw err;
    });
  }

  function buildSources() {
    var box = $('source-list');
    if (!box) return;
    box.innerHTML = '';
    var list = window.VSources.list();
    list.forEach(function (s) {
      var b = document.createElement('button');
      b.className = 'btn';
      b.setAttribute('data-focus', '');
      b.textContent = s.label;
      b.onclick = function () { pickSource(s, b); };
      b.setAttribute('title', s.url + ' — ' + s.note);
      box.appendChild(b);
    });
    markActive(null);
  }

  function markActive(src) {
    var box = $('source-list');
    if (!box) return;
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].style.borderTopWidth = '';
      kids[i].style.boxShadow = '';
    }
    var disp = $('custom-url-display');
    if (disp) disp.textContent = src ? ('URL : ' + src.url.substring(0, 90)) : '';
  }

  function pickSource(s, btn) {
    if (btn) {
      var box = $('source-list');
      if (box) for (var i = 0; i < box.children.length; i++) box.children[i].style.boxShadow = '';
      btn.style.boxShadow = '0 0 0 3px #ffd400';
    }
    markActive(s);
    loadSource(s).catch(function () {});
    setTimeout(function () { var v = $('video'); if (v) try { v.focus(); } catch (e) {} }, 300);
  }

  // ─── Handoff natif ──────────────────────────────────────────────────────
  function setNativeStatus(txt, cls) {
    var el = $('native-status');
    if (!el) return;
    el.className = 'status ' + (cls || '');
    el.textContent = txt;
  }

  function refreshNativeAvailability() {
    var d = window.VNative.detect();
    var btn = $('btn-native');
    if (!btn) return d;
    if (d.send) {
      btn.disabled = false;
      btn.textContent = ' Essayer le lecteur natif Hisense (' + d.sendName + ')';
      setNativeStatus('Pont détecté : ' + d.sendName + '. La tentative reste soumise à vérification ' +
        '(aucun accusé de réception VIDAA).', '');
    } else {
      btn.disabled = true;
      btn.textContent = ' Lecteur natif INDISPONIBLE ici';
      setNativeStatus('FONCTION INDISPONIBLE dans ce contexte : ni omi_platform, ni opera_omi avec ' +
        'sendPlatformMessage.\n' +
        '→ Ouvrez cette même URL dans le navigateur Internet de la TV, ou via une tuile installée avec ' +
        'Sidee (le pont est injecté par l\'environnement applicatif VIDAA, pas toujours par le navigateur).\n' +
        '→ Comparez les deux contextes : le badge « omi_platform » en haut change selon l\'endroit d\'où ' +
        'vous lancez la page.', 'warn');
    }
    return d;
  }

  function runNativeHandoff() {
    var d = refreshNativeAvailability();
    if (!d.send) {
      toast('Lecteur natif indisponible : omi_platform absent de ce contexte.', 'bad');
      setNativeStatus('ÉCHEC — omi_platform.sendPlatformMessage absent : rien n\'a été envoyé.', 'bad');
      return;
    }
    var cur = window.VPlayer.current();
    var url = window.VPlayer.currentUrl();
    if (!url) {
      setNativeStatus('ÉCHEC — aucun flux en cours à transmettre. Lancez d\'abord une lecture.', 'bad');
      toast('Aucun flux à transmettre au lecteur natif.', 'bad');
      return;
    }
    setNativeStatus('Tentative en cours… envoi de 3 messages, attente d\'un signal d\'arrière-plan (2 s max)…', 'warn');
    toast('Tentative de lecture native…', 'info', 2500);

    window.VNative.launch(url, cur ? cur.label : document.title).then(function (res) {
      var head = 'Pont : ' + (res.bridge || '?') +
        ' · messages envoyés : ' + (res.sent.length ? res.sent.join(', ') : 'aucun') +
        ' · durée : ' + res.elapsedMs + ' ms\n';
      if (res.sendErrors.length) head += 'Refus du pont : ' + res.sendErrors.join(' ; ') + '\n';

      if (res.ok) {
        var txt = head +
          'RÉSULTAT : LA PAGE EST PASSÉE EN ARRIÈRE-PLAN (signal : ' + res.signal + ').\n' +
          'Cela signifie que la TV a probablement pris la main — MAIS il n\'existe aucun accusé de ' +
          'réception : si aucun lecteur natif ne s\'ouvre à l\'écran dans les 2 s, la commande a été ignorée ' +
          'par le firmware (cas documenté sur VIDAA).\n' +
          'Note : si vous aviez appuyé sur une autre touche (Accueil…) au même moment, ce signal peut être ' +
          'un faux positif.';
        setNativeStatus(txt, 'ok');
        toast('Arrière-plan détecté — vérifiez l\'écran de la TV.', 'ok');
      } else {
        var txt2 = head +
          'RÉSULTAT : ÉCHEC (' + res.reason + ').\n' + res.detail;
        if (res.reason === 'no-signal' && res.sent.length) {
          txt2 += '\nLes messages ont bien été remis au pont, mais le firmware n\'a rien fait de visible ' +
            '(ou ce navigateur ne remonte pas visibilitychange/blur). C\'est l\'échec documenté sur ' +
            'certains firmwares VIDAA.';
        }
        setNativeStatus(txt2, 'bad');
        toast('Lecteur natif : ÉCHEC — ' + res.reason, 'bad');
      }
      window.VDiag.render();
    }).catch(function (e) {
      setNativeStatus('ÉCHEC — exception inattendue : ' + (e && e.message ? e.message : String(e)), 'bad');
      L('error', 'handoff exception: ' + (e && e.stack ? e.stack : e));
    });
  }

  // ─── Panneaux ───────────────────────────────────────────────────────────
  function togglePanel(id, on) {
    var el = $(id);
    if (!el) return;
    var willShow = (on === undefined) ? el.className.indexOf('hidden') !== -1 : on;
    el.className = willShow ? 'panel' : 'panel hidden';
    if (willShow) {
      if (id === 'panel-diag') window.VDiag.render();
      if (id === 'panel-log') window.VLog.render();
      var first = el.querySelector('[data-focus], button');
      if (first) { try { first.focus(); } catch (e) {} }
    }
    return willShow;
  }

  function anyPanelOpen() {
    return [$('panel-diag'), $('panel-log')].some(function (p) {
      return p && p.className.indexOf('hidden') === -1;
    });
  }
  function closePanels() {
    ['panel-diag', 'panel-log'].forEach(function (id) { togglePanel(id, false); });
    var v = $('video'); if (v) { try { v.focus(); } catch (e) {} }
  }

  // ─── Entrée ─────────────────────────────────────────────────────────────
  function wireButtons() {
    $('btn-play').onclick = function () { window.VPlayer.togglePlay(); };
    $('btn-rw').onclick = function () { window.VPlayer.seekBy(-30); };
    $('btn-ff').onclick = function () { window.VPlayer.seekBy(30); };
    $('btn-stop').onclick = function () { window.VPlayer.stop(); };
    $('btn-mute').onclick = function () { window.VPlayer.toggleMute(); };
    $('btn-hud').onclick = function () {
      var h = $('hud');
      h.className = h.className.indexOf('hidden') !== -1 ? 'hud' : 'hud hidden';
      L('info', 'HUD info : ' + (h.className.indexOf('hidden') === -1 ? 'affiché' : 'masqué'));
    };
    $('btn-native').onclick = runNativeHandoff;
    $('btn-run-tests').onclick = function () {
      toast('Suite de tests lancée (regardez la liste plus bas)…', 'info', 4000);
      window.VTests.runAll();
    };
    $('btn-clear-tests').onclick = function () { window.VTests.clear(); };
    $('btn-diag-refresh').onclick = function () { window.VDiag.render(); };
    $('btn-diag-cors').onclick = function () { window.VDiag.testCors(); };
    $('btn-diag-keys').onclick = function () { window.VDiag.showKeys(); };
    $('btn-log-clear').onclick = function () { window.VLog.clear(); };
    $('btn-log-all').onclick = function () {
      var pre = $('log-output');
      if (!pre) return;
      try {
        var r = document.createRange(); r.selectNodeContents(pre);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        var ok = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(window.VLog.text()).then(function () { toast('Journal copié.', 'ok', 2500); })
            .catch(function () { toast('Sélection faite — utilisez la copie du navigateur.', 'info'); });
          ok = true;
        }
        if (!ok) toast('Journal sélectionné — copie via le navigateur.', 'info');
      } catch (e) { toast('Copie impossible : ' + e.message, 'bad'); }
    };
    $('btn-custom-open').onclick = function () {
      window.VKeys.showOsk(function (url) {
        if (!window.VSources.isHttps(url)) {
          toast('URL refusée : HTTPS obligatoire (le navigateur TV bloquera le HTTP).', 'bad');
          L('error', 'URL non-HTTPS refusée : ' + url);
          return;
        }
        window.VSources.setCustom(url);
        var src = { id: 'custom', label: 'URL perso', type: window.VSources.isHls(url) ? 'hls' : 'mp4', url: url };
        markActive(src);
        loadSource(src).catch(function () {});
      });
    };
  }

  function wireKeys() {
    var K = window.VKeys;

    // Back : ferme les panneaux ouvrets, ne quitte JAMAIS la page.
    function backHandler() {
      if (anyPanelOpen()) closePanels();
    }

    K.on('yellow', function () { runNativeHandoff(); return false; });
    K.on('red', function () { togglePanel('panel-diag'); return false; });
    K.on('green', function () { togglePanel('panel-log'); return false; });
    K.on('blue', function () { window.VTests.runAll(); toast('Suite de tests lancée…', 'info', 4000); return false; });
    K.on('info', function () { $('btn-hud').click(); return false; });
    K.on('chUp', function () { window.VPlayer.seekBy(60); return false; });
    K.on('chDown', function () { window.VPlayer.seekBy(-60); return false; });
    K.on('play', function () { var v = window.VPlayer.video(); if (v && v.paused) window.VPlayer.togglePlay(); return false; });
    K.on('pause', function () { var v = window.VPlayer.video(); if (v && !v.paused) window.VPlayer.togglePlay(); return false; });
    K.on('playPause', function () { window.VPlayer.togglePlay(); return false; });
    K.on('rewind', function () { window.VPlayer.seekBy(-30); return false; });
    K.on('fastRewind', function () { window.VPlayer.seekBy(-30); return false; });
    K.on('forward', function () { window.VPlayer.seekBy(30); return false; });
    K.on('fastForward', function () { window.VPlayer.seekBy(30); return false; });
    K.on('back', backHandler);
    K.on('escape', backHandler);
    K.on('exit', backHandler);
  }

  function boot() {
    L('info', 'Démarrage de VIDAA Player Lab.');
    L('info', 'ua: ' + navigator.userAgent);
    L('info', 'contexte: ' + location.protocol + '//' + location.host + location.pathname +
      ' · secure=' + (window.isSecureContext === true));

    window.VPlayer.init();
    window.VKeys.init();
    buildSources();
    wireButtons();
    wireKeys();
    refreshBadges();
    refreshNativeAvailability();

    window.VPlayer.onUpdate(function (name, data) {
      if (name === 'resume-checked') {
        var detail = data.ok
          ? 'retrouvée à ' + window.VPlayer.fmt(data.got) + ' (attendu ' + window.VPlayer.fmt(data.expected) + ')'
          : (data.error ? data.error : 'retrouvée à ' + window.VPlayer.fmt(data.got || 0) +
            ' (attendu ' + window.VPlayer.fmt(data.expected || 0) + ')');
        window.VTests.finalizePendingResume(!!data.ok, detail);
      }
    });

    window.addEventListener('online', function () { L('success', 'réseau EN LIGNE'); refreshBadges(); });
    window.addEventListener('offline', function () { L('error', 'réseau HORS LIGNE'); refreshBadges(); });
    setInterval(refreshBadges, 15000);

    // Restauration de la dernière source + test de reprise éventuel
    var last = null;
    try { last = JSON.parse(localStorage.getItem(LS_LAST) || 'null'); } catch (e) {}
    if (last && last.url) {
      var known = last.id ? window.VSources.find(last.id) : null;
      var src = known || { id: last.id || 'custom', label: known ? known.label : 'URL perso', type: window.VSources.isHls(last.url) ? 'hls' : 'mp4', url: last.url };
      L('info', 'Dernière source restaurée : ' + src.url.substring(0, 100));
      window.VPlayer.load(src, { autoplay: false }).then(function () {
        markActive(src);
        return window.VPlayer.attemptResume();
      }).catch(function () {});
    } else {
      // Première visite : charge la première source en démo (sans autoplay)
      var first = window.VSources.list()[0];
      window.VPlayer.load(first, { autoplay: false }).then(function () {
        markActive(first);
        L('info', 'Source de démonstration chargée — appuyez sur ▶ ou OK pour lire.');
        toast('Prêt. ▶ ou OK pour démarrer la lecture.', 'info', 7000);
      }).catch(function (e) { L('warn', 'chargement initial: ' + e.message); });
    }

    // Focus initial
    setTimeout(function () {
      var b = $('btn-play');
      if (b) { try { b.focus(); } catch (e) {} }
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
