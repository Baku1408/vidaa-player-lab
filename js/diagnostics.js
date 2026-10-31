/* VIDAA Player Lab — diagnostic : capacités du navigateur, pont VIDAA,
 * codecs, CORS, verdict de lecture. Tout est MESURÉ, rien n'est supposé. */
(function () {
  'use strict';

  function L(level, msg, data) { window.VLog.log(level, 'diag', msg, data); }

  function $(id) { return document.getElementById(id); }

  function yn(v) { return v ? '<span class="y">OUI</span>' : '<span class="n">NON</span>'; }
  function color(cls, txt) { return '<span class="' + cls + '">' + txt + '</span>'; }

  function canPlay(type) {
    var v = document.createElement('video');
    try { return v.canPlayType(type) || ''; } catch (e) { return ''; }
  }

  function hisenseApis() {
    // Noms d'API strictement observés dans le code source de référence
    // (device.js / install-prompt.js / exit-button.js) — simple test typeof.
    var names = [
      'Hisense_GetOSVersion', 'Hisense_GetModelName', 'Hisense_GetFirmWareVersion',
      'Hisense_GetChipSetName', 'Hisense_GetSupportForHDRInfo', 'Hisense_GetDrmInfo',
      'Hisense_RegisterObserver', 'Hisense_AddInsecureDomain', 'Hisense_GetInsecureDomain',
      'Hisense_Exit', 'Hisense_installApp', 'HiUtils_createRequest',
      'omi_platform', 'opera_omi'
    ];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var n = names[i], t;
      try { t = typeof window[n]; } catch (e) { t = 'throw'; }
      out.push({ name: n, type: t });
    }
    return out;
  }

  function readVis() {
    try { return document.visibilityState + (document.hidden ? ' (hidden)' : ''); } catch (e) { return '?'; }
  }

  function rows() {
    var v = $('video');
    var d = window.VNative.detect();
    var r = [];

    r.push(['— Environnement —', null, 'HEAD']);
    r.push(['URL de la page', location.protocol + '//' + location.host + location.pathname]);
    r.push(['Contexte sécurisé (isSecureContext)', yn(window.isSecureContext === true) +
      (window.isSecureContext === true ? '' : ' <span class="w">→ API média/Clé possiblement bloquées</span>')]);
    r.push(['HTTPS', yn(location.protocol === 'https:')]);
    r.push(['navigator.onLine', yn(navigator.onLine !== false)]);
    r.push(['User-Agent', String(navigator.userAgent || '')]);
    r.push(['Résolution écran', (screen ? screen.width + 'x' + screen.height : '?') +
      ' · DPR ' + (window.devicePixelRatio || 1) +
      ' · viewport ' + window.innerWidth + 'x' + window.innerHeight]);
    r.push(['visibilityState', readVis()]);

    r.push(['— Pont VIDAA (handoff) —', null, 'HEAD']);
    r.push(['omi_platform présent', yn(d.omi)]);
    r.push(['sendPlatformMessage utilisable', d.send ? color('y', 'OUI (' + d.sendName + ')') : color('n', 'NON')]);
    if (d.err) r.push(['Erreur de détection', color('n', d.err)]);

    r.push(['— APIs Hisense (typeof, sans appel) —', null, 'HEAD']);
    var apis = hisenseApis();
    var found = 0;
    for (var i = 0; i < apis.length; i++) {
      var a = apis[i];
      var ok = (a.type === 'function' || a.type === 'object');
      if (ok) found++;
      r.push([a.name, ok ? color('y', a.type) : '<span class="w">' + a.type + '</span>']);
    }
    r.push(['Total détecté', found + ' / ' + apis.length]);

    r.push(['— Médias / codecs déclarés par le navigateur —', null, 'HEAD']);
    var probed = [
      ['H.264 MP4', 'video/mp4; codecs="avc1.42E01E"'],
      ['HEVC/H.265 MP4', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
      ['AV1 MP4', 'video/mp4; codecs="av01.0.04M.08"'],
      ['VP9 WebM', 'video/webm; codecs="vp9"'],
      ['AAC audio', 'video/mp4; codecs="mp4a.40.2"'],
      ['AC-3 audio', 'video/mp4; codecs="ac-3"'],
      ['E-AC-3 (Atmos)', 'video/mp4; codecs="ec-3"'],
      ['Opus audio', 'audio/webm; codecs="opus"']
    ];
    for (var j = 0; j < probed.length; j++) {
      var res = canPlay(probed[j][1]);
      var cls = res === 'probably' ? 'y' : (res === 'maybe' ? 'w' : 'n');
      r.push([probed[j][0], '<span class="' + cls + '">' + (res || 'non') + '</span>']);
    }
    var nativeHls = '';
    try { nativeHls = v ? v.canPlayType('application/vnd.apple.mpegurl') : ''; } catch (e) {}
    r.push(['HLS natif (.m3u8)', nativeHls ? color('y', nativeHls) : '<span class="w">non déclaré</span>']);
    r.push(['MSE (MediaSource)', yn(typeof window.MediaSource !== 'undefined' ||
      typeof window.WebKitMediaSource !== 'undefined')]);
    r.push(['hls.js chargé', yn(typeof window.Hls !== 'undefined') +
      (typeof window.Hls !== 'undefined' ? ' v' + (window.Hls.version || '?') : '')]);
    var eme = false;
    try { eme = !!(navigator.requestMediaKeySystemAccess || navigator.webkitRequestMediaKeySystemAccess); } catch (e) {}
    r.push(['EME (DRM) déclaré', yn(eme), 'DRM type Widevine/PlayReady → flux protégés']);

    r.push(['— État du lecteur —', null, 'HEAD']);
    if (v) {
      r.push(['src courant', (v.currentSrc || v.src || '(aucun)').substring(0, 160)]);
      r.push(['readyState / networkState', v.readyState + ' / ' + v.networkState]);
      r.push(['paused / ended / seeking', v.paused + ' / ' + v.ended + ' / ' + v.seeking]);
      r.push(['currentTime / duration', window.VPlayer.fmt(v.currentTime) + ' / ' + window.VPlayer.fmt(v.duration)]);
      r.push(['bufferahead', window.VPlayer.bufferedAhead().toFixed(2) + ' s']);
      r.push(['videoWidth x videoHeight', (v.videoWidth || '?') + 'x' + (v.videoHeight || '?')]);
      r.push(['played range', (v.played && v.played.length ? v.played.start(0).toFixed(1) + '→' + v.played.end(v.played.length - 1).toFixed(1) : '—')]);
      r.push(['erreur média', v.error ? color('n', 'code ' + v.error.code + ' ' + (v.error.message || '')) : color('y', 'aucune')]);
      r.push(['currentSrc (mode)', (function () {
        var cur = window.VPlayer.current();
        if (!cur) return '(aucune source)';
        var m = window.VPlayer.pickMode(cur.url);
        return m.mode + ' — ' + m.why;
      })()]);
    } else {
      r.push(['video', '<span class="n">absent</span>']);
    }
    return r;
  }

  function render() {
    var t = $('diag-table');
    if (!t) return;
    var html = [];
    var rs = rows();
    for (var i = 0; i < rs.length; i++) {
      var row = rs[i];
      if (row[2] === 'HEAD') {
        html.push('<tr><td colspan="2" style="color:#ffd400;font-weight:700;padding-top:12px">' + row[0] + '</td></tr>');
      } else {
        html.push('<tr><td>' + row[0] + '</td><td>' + row[1] +
          (typeof row[2] === 'string' && row[2] !== 'HEAD'
            ? ' <span class="hint">' + row[2] + '</span>' : '') + '</td></tr>');
      }
    }
    t.innerHTML = html.join('');
    renderVerdict();
  }

  /** Verdict de lecture : explique le blocage le plus probable. */
  function renderVerdict() {
    var el = $('diag-verdict');
    if (!el) return;
    var v = $('video');
    var probs = [];
    var cls = 'ok';

    if (location.protocol !== 'https:') {
      probs.push('Page servie en HTTP : les API média modernes et le mixte de contenus seront bloqués.');
      cls = 'bad';
    }
    if (window.isSecureContext !== true) {
      probs.push('Contexte non sécurisé : pleins d\'API (EME, plein écran…) indisponibles.');
      cls = 'bad';
    }
    var d = window.VNative.detect();
    if (!d.send) probs.push('Pont omi_platform absent → handoff natif impossible ICI (comparez navigateur vs tuile Sidee).');

    if (v && v.error) {
      probs.push('Erreur média active : code ' + v.error.code +
        (v.error.code === 3 ? ' → suspectez CORS/HTTPS/Range sur le serveur du flux.' : '') +
        (v.error.code === 4 ? ' → codec/format non lisible par ce navigateur.' : ''));
      cls = 'bad';
    }

    var cur = window.VPlayer && window.VPlayer.current();
    if (cur && window.VSources.isHls(cur.url)) {
      var native = '';
      try { native = v ? v.canPlayType('application/vnd.apple.mpegurl') : ''; } catch (e) {}
      if (!native && (typeof window.Hls === 'undefined' || !window.Hls.isSupported())) {
        probs.push('HLS sans support : ni HLS natif, ni MSE → le flux .m3u8 ne démarrera jamais ici.');
        cls = 'bad';
      } else if (native) probs.push('HLS natif disponible : le navigateur télécharge le .m3u8 lui-même (pas de hls.js).');
      else probs.push('HLS via hls.js (MSE) : chaque segment doit être autorisé en CORS par le serveur.');
      if (cls !== 'bad') cls = 'warn';
    }
    if (navigator.onLine === false) { probs.push('TV hors ligne.'); cls = 'bad'; }

    if (!probs.length) probs.push('Aucun blocage détecté à ce niveau. Si la lecture échoue quand même, consultez le Journal (🟢) : l\'événement exact (error / stall / HTTP) y figure.');

    el.className = 'status ' + cls;
    el.textContent = probs.join('\n');
  }

  /** Test réseau CORS sur la source courante (et sur 2 URLs de contrôle). */
  function testCors() {
    var cur = window.VPlayer.current();
    var targets = [];
    if (cur) targets.push({ label: 'source courante', url: cur.url });
    targets.push({ label: 'contrôle HLS (mux, CORS *)', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' });

    var out = [];
    L('info', 'Test d\'accès réseau (mode cors) sur ' + targets.length + ' URL(s)…');

    function one(t) {
      if (typeof fetch !== 'function') {
        out.push(t.label + ' : fetch indisponible sur ce navigateur');
        return Promise.resolve();
      }
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 8000);
      return fetch(t.url, {
        method: 'GET', mode: 'cors', cache: 'no-store',
        headers: { 'Range': 'bytes=0-64' },
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (r) {
        clearTimeout(timer);
        var ok = r.ok || r.status === 206;
        var acao = null;
        try { acao = r.headers.get('Access-Control-Allow-Origin'); } catch (e) {}
        out.push(t.label + ' → HTTP ' + r.status + (r.status === 206 ? ' (Range accepté)' : '') +
          ' · lecture CORS : ' + (ok ? 'AUTORISÉE ✓' : 'REFUSÉE') +
          ' · ACAO=' + (acao || 'non exposé par le serveur') +
          (ok ? ' ✓' : ' ✗'));
        L(ok ? 'success' : 'error', 'fetch ' + t.url.substring(0, 80) + ' → ' + r.status +
          (acao ? ' ACAO=' + acao : ' (ACAO non exposé)'));
        try { if (r.body && r.body.cancel) r.body.cancel(); } catch (e) {}
      }).catch(function (e) {
        clearTimeout(timer);
        out.push(t.label + ' → REFUSÉ : ' + (e && e.message ? e.message : String(e)) +
          ' (CORS, HTTPS, DNS ou politique du navigateur)');
        L('error', 'fetch refusé sur ' + t.url.substring(0, 80) + ' : ' + (e.message || e));
      });
    }

    var p = Promise.resolve();
    targets.forEach(function (t) { p = p.then(function () { return one(t); }); });
    return p.then(function () {
      var el = $('diag-verdict');
      if (el) { el.className = 'status ' + (out.join('\n').indexOf('REFUSÉ') !== -1 ? 'bad' : 'ok'); el.textContent = out.join('\n'); }
      return out;
    });
  }

  function showKeys() {
    var ks = window.VKeys.lastKeys();
    var el = $('diag-verdict');
    if (!el) return;
    if (!ks.length) { el.className = 'status warn'; el.textContent = 'Aucune touche reçue pour l\'instant — appuyez sur des boutons de la télécommande ici.'; return; }
    var lines = ['Dernières touches reçues (keyCode brut → nom interprété) :'];
    for (var i = ks.length - 1; i >= 0; i--) {
      lines.push('  ' + ks[i].at + '  keyCode=' + ks[i].code + '  ' + ks[i].name +
        (ks[i].key ? '  key="' + ks[i].key + '"' : ''));
    }
    el.className = 'status ok';
    el.textContent = lines.join('\n');
    L('info', 'Affichage des ' + ks.length + ' derniers codes clavier.');
  }

  window.VDiag = {
    render: render,
    testCors: testCors,
    showKeys: showKeys,
    hisenseApis: hisenseApis
  };
})();
