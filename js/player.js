/* VIDAA Player Lab — lecteur HTML5 (MP4) + HLS (natif ou hls.js/MSE)
 * Collecte TOUS les événements vidéo dans le journal et détecte les
 * blocages de lecture (stall) pour alimenter le diagnostic.
 */
(function () {
  'use strict';

  var LS_POS = 'vidaa_lab_resume';     // position mémorisée pour le test de reprise
  var STALL_MS = 6000;                 // pas d'avance pendant 6 s = blocage

  var video, hls = null, current = null;   // current = source courante {id,label,type,url}
  var lastAdvanceAt = 0, lastTime = -1, stalled = false, playing = false;
  var watchers = [];

  function L(level, msg, data) { window.VLog.log(level, 'player', msg, data); }

  function $(id) { return document.getElementById(id); }

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  var ERR_TEXT = {
    1: 'MEDIA_ERR_ABORTED — lecture interrompue (chargement annulé).',
    2: 'MEDIA_ERR_DECODE — le décodeur a échoué : codec/flux incompatible avec ce navigateur.',
    3: 'MEDIA_ERR_NETWORK — erreur réseau : coupure, HTTPS, CORS, ou le serveur a refusé une requête (Range…).',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED — source non lisible : format/codec non pris en charge, ou MSE/HLS indisponible.'
  };

  function currentUrl() {
    if (!current) return '';
    return current.url;
  }

  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch (e) {}
      hls = null;
      L('debug', 'Instance hls.js détruite.');
    }
  }

  // ─── Garde « HLS natif » : si le navigateur DÉCLARE supporter .m3u8 mais
  // échoue en pratique (cas fréquent : canPlayType renvoie « maybe » à tort),
  // on bascule automatiquement sur hls.js (MSE) en le signalant. ──────────
  var nativeGuard = null;    // { url, timer, onErr }

  function clearNativeGuard() {
    if (!nativeGuard) return;
    clearTimeout(nativeGuard.timer);
    try { video.removeEventListener('error', nativeGuard.onErr); } catch (e) {}
    nativeGuard = null;
  }

  function startHlsJs(url, why) {
    clearNativeGuard();
    if (typeof window.Hls === 'undefined' || !window.Hls.isSupported()) {
      L('error', 'Bascule hls.js impossible (' + why + ') : hls.js/MSE indisponible.');
      failStage('Le HLS natif a échoué (' + why + ') et hls.js (MSE) n\'est pas disponible ici.');
      return;
    }
    L('warn', 'HLS NATIF ÉCHEC → bascule sur hls.js (MSE) : ' + why);
    showStageMsg('');
    destroyHls();
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    hls = new window.Hls({ enableWorker: true, maxBufferLength: 30 });
    attachHlsEvents(hls);
    hls.loadSource(url);
    hls.attachMedia(video);
    var p = video.play();
    if (p && p.catch) p.catch(function (err) { L('warn', 'autoplay après bascule refusé : ' + err.message); });
  }

  function armNativeGuard(url) {
    clearNativeGuard();
    var guard = { url: url, timer: null, onErr: null };
    guard.onErr = function () {
      if (nativeGuard !== guard) return;
      startHlsJs(url, 'erreur vidéo en mode natif (code ' + (video.error ? video.error.code : '?') + ')');
    };
    guard.timer = setTimeout(function () {
      if (nativeGuard !== guard) return;
      if (video.error) return;                 // l'erreur gérée par onErr
      if (video.readyState >= 1) return;       // les metadata sont là : OK
      startHlsJs(url, 'aucune metadata après 6 s en mode natif');
    }, 6000);
    video.addEventListener('error', guard.onErr);
    nativeGuard = guard;
  }

  /** Détermine le mode de lecture pour une URL donnée. */
  function pickMode(url) {
    var isHls = window.VSources.isHls(url);
    if (!isHls) return { mode: 'mp4', why: 'Pas une URL .m3u8 → lecture <video> directe.' };

    var native = '';
    try { native = video.canPlayType('application/vnd.apple.mpegurl'); } catch (e) {}
    var mseOk = false;
    try { mseOk = (typeof window.Hls !== 'undefined') && window.Hls.isSupported(); } catch (e) {}

    if (native === 'probably' || native === 'maybe') {
      return { mode: 'hls-native', why: 'HLS natif déclaré par le navigateur (canPlayType="' + native + '").' };
    }
    if (mseOk) {
      return { mode: 'hlsjs', why: 'HLS natif absent → hls.js via MSE (MediaSource Extensions).' };
    }
    return { mode: 'unsupported', why: 'HLS non supporté : ni HLS natif, ni MSE pour hls.js.' };
  }

  /** Charge une source. Retourne une Promesse résolue au premier metadata. */
  function load(src, opts) {
    opts = opts || {};
    destroyHls();
    clearNativeGuard();
    current = src;
    var url = src.url;
    var res = pickMode(url);
    L('info', 'Chargement « ' + src.label + ' » — mode ' + res.mode + ' (' + res.why + ')');

    showStageMsg('');
    video.removeAttribute('src');
    video.load();

    if (res.mode === 'unsupported') {
      failStage('HLS indisponible sur ce navigateur : ni lecture native (.m3u8), ni MSE pour hls.js. ' +
        'Essayez une source MP4.');
      return Promise.reject(new Error('hls-unsupported'));
    }

    if (res.mode === 'hls-native') {
      video.src = url;
      armNativeGuard(url);                 // vérifie que le natif tient ses promesses
    } else if (res.mode === 'hlsjs') {
      hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        manifestLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 4
      });
      attachHlsEvents(hls);
      hls.loadSource(url);
      hls.attachMedia(video);
    } else {
      video.src = url;
    }

    if (opts.autoplay !== false) {
      var p = video.play();
      if (p && p.catch) p.catch(function (err) {
        L('warn', 'autoplay refusé par le navigateur (règle d\'interaction utilisateur) : ' + err.message);
        showStageMsg('Appuyez sur ▶ Lecture (ou OK) pour démarrer.');
      });
    }

    return waitFor('loadedmetadata', 12000).then(function () {
      L('success', 'metadata lues : ' + fmt(video.duration) + ' s · ' +
        (video.videoWidth || '?') + 'x' + (video.videoHeight || '?'));
      updateHud();
      return true;
    });
  }

  function attachHlsEvents(h) {
    h.on(window.Hls.Events.MANIFEST_PARSED, function (ev, data) {
      L('success', 'hls.js : manifeste HLS analysé (' + (data && data.levels ? data.levels.length : '?') + ' niveaux).');
      emit('hls-manifest', data);
    });
    h.on(window.Hls.Events.LEVEL_SWITCHED, function (ev, data) {
      L('debug', 'hls.js : passage au niveau ' + (data && data.level != null ? data.level : '?'));
    });
    h.on(window.Hls.Events.FRAG_BUFFERED, function () { noteAdvance(); });
    h.on(window.Hls.Events.ERROR, function (ev, data) {
      var d = data || {};
      var msg = 'hls.js erreur ' + (d.type || '') + '/' + (d.details || '') +
        (d.response && d.response.code ? ' HTTP ' + d.response.code : '') +
        (d.fatal ? ' [FATALE]' : ' [non fatale]');
      L(d.fatal ? 'error' : 'warn', msg, d.url ? { url: d.url } : null);
      if (d.fatal) {
        var hint = '';
        if (String(d.details).indexOf('network') !== -1) {
          hint = ' → Réseau/CORS/HTTPS. Vérifiez le panneau Diagnostic (bouton « Tester l\'accès réseau »).';
        } else if (String(d.details).indexOf('codec') !== -1 || String(d.details).indexOf('decoding') !== -1) {
          hint = ' → Codec non décodé par cette TV.';
        }
        failStage('Échec HLS : ' + d.details + hint);
        emit('hls-fatal', d);
      }
    });
  }

  /** Événements <video> → journal + HUD. */
  function attachVideoEvents() {
    var map = {
      loadstart: ['info', 'démarrage du chargement'],
      loadedmetadata: ['info', 'metadata reçues'],
      loadeddata: ['debug', 'première image disponible'],
      canplay: ['info', 'prêt à jouer'],
      canplaythrough: ['debug', 'peut jouer jusqu\'au bout sans buffer'],
      play: ['info', '▶ play() accepté'],
      playing: ['success', '▶ LECTURE EN COURS'],
      pause: ['warn', '⏸ pause'],
      waiting: ['warn', 'attente de données (buffering)…'],
      stalled: ['warn', 'stalled : le flux ne progresse pas'],
      seeking: ['info', 'seek demandé → ' + 't=…'],
      seeked: ['success', 'seek terminé'],
      ended: ['warn', 'fin de vidéo atteinte'],
      emptied: ['warn', 'source vidée (reload)'],
      abort: ['warn', 'chargement annulé'],
      timeupdate: null,
      progress: null,
      volumechange: ['debug', 'volume ' + '→'],
      ratechange: ['info', 'vitesse de lecture →'],
      error: null,
      durationchange: ['info', 'durée →']
    };
    for (var ev in map) {
      if (!map.hasOwnProperty(ev)) continue;
      (function (name, conf) {
        video.addEventListener(name, function () {
          if (name === 'timeupdate' || name === 'progress') { noteAdvance(); updateHud(); return; }
          if (name === 'error') { onError(); return; }
          if (!conf) return;
          var extra = '';
          if (name === 'seeking') extra = ' t=' + fmt(video.currentTime);
          if (name === 'seeked') extra = ' t=' + fmt(video.currentTime);
          if (name === 'volumechange') extra = ' vol=' + video.volume.toFixed(2) + (video.muted ? ' (muet)' : '');
          if (name === 'ratechange') extra = ' x' + video.playbackRate;
          if (name === 'durationchange') extra = ' ' + fmt(video.duration);
          if (name === 'waiting' || name === 'stalled') {
            stalled = true; showSpinner(true); showStageMsg(''); emit('stall-start', { event: name });
          }
          if (name === 'playing' || name === 'seeked') { stalled = false; showSpinner(false); emit('stall-end', {}); }
          window.VLog.log(conf[0], 'player', conf[1] + extra);
          updateHud();
        }, false);
      })(ev, map[ev]);
    }

    video.addEventListener('playing', function () { playing = true; lastAdvanceAt = Date.now(); });
    video.addEventListener('pause', function () { playing = false; });
    video.addEventListener('waiting', function () { playing = false; });
  }

  function onError() {
    if (nativeGuard) return;               // la garde gère la bascule hls.js
    var e = video.error;
    var code = e ? e.code : 0;
    var txt = ERR_TEXT[code] || ('Erreur média inconnue (code ' + code + ')');
    if (e && e.message) txt += ' — ' + e.message;
    L('error', 'ERREUR VIDÉO : ' + txt, { src: (video.currentSrc || video.src || '').substring(0, 140) });
    failStage(txt);
    emit('video-error', { code: code, message: e ? e.message : '' });
    updateHud();
  }

  function noteAdvance() {
    var t = video.currentTime;
    if (Math.abs(t - lastTime) > 0.25) {
      lastTime = t; lastAdvanceAt = Date.now();
      if (stalled) { stalled = false; showSpinner(false); emit('stall-end', { recovered: true }); }
    }
  }

  /** Boucle de surveillance des blocages (1 s). */
  function watchdog() {
    if (!video) return;
    var now = Date.now();
    if (playing && !video.seeking && lastAdvanceAt && now - lastAdvanceAt > STALL_MS) {
      if (!stalled) {
        stalled = true;
        showSpinner(true);
        L('error', 'BLOCAGE DÉTECTÉ : aucune progression depuis ' + Math.round((now - lastAdvanceAt) / 1000) +
          ' s alors que la lecture est annoncée en cours. buffered=' +
          fmt(bufferedAhead()) + ' s, readyState=' + video.readyState + ', networkState=' + video.networkState);
        emit('stall', {
          buffered: bufferedAhead(), readyState: video.readyState,
          networkState: video.networkState, time: video.currentTime
        });
        showStageMsg('Blocage de lecture détecté — voir le Journal (touche 🟢).');
      }
    }
    updateHud();
  }

  function bufferedAhead() {
    try {
      var b = video.buffered, t = video.currentTime;
      for (var i = 0; i < b.length; i++) {
        if (t >= b.start(i) - 0.5 && t <= b.end(i)) return b.end(i) - t;
      }
      return b.length ? (b.end(0) - t) : 0;
    } catch (e) { return -1; }
  }

  function updateHud() {
    if (!video) return;
    var state = 'arrêt';
    if (video.ended) state = 'fin';
    else if (video.seeking) state = 'seek…';
    else if (stalled) state = 'BLOCAGE';
    else if (video.paused) state = 'pause';
    else state = 'lecture';
    setText('hud-state', state);
    setText('hud-time', fmt(video.currentTime) + ' / ' + fmt(video.duration));
    setText('hud-buf', 'buf ' + bufferedAhead().toFixed(1) + ' s');
    setText('hud-src', current ? (current.label + ' [' + (current.type || '?') + ']') : '—');
    setText('btn-play', video.paused ? '▶ Lecture / Pause' : '⏸ Lecture / Pause');
    emit('hud', { state: state });
  }

  function setText(id, txt) { var el = $(id); if (el) el.textContent = txt; }
  function showSpinner(on) { var el = $('spinner'); if (el) el.className = on ? '' : 'hidden'; }
  function failStage(msg) { showStageMsg(msg); }
  function showStageMsg(msg) {
    var el = $('stage-msg');
    if (!el) return;
    if (!msg) { el.className = 'hidden'; el.textContent = ''; }
    else { el.className = ''; el.textContent = msg; }
  }

  function waitFor(ev, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      function ok() { if (done) return; done = true; cleanup(); resolve(true); }
      function ko() { if (done) return; done = true; cleanup(); reject(new Error('timeout:' + ev)); }
      function cleanup() {
        video.removeEventListener(ev, ok);
        video.removeEventListener('error', onErr);
        clearTimeout(t);
      }
      function onErr() {
        if (done) return; done = true; cleanup();
        reject(new Error('media-error:' + (video.error ? video.error.code : '?')));
      }
      if (ev === 'loadedmetadata' && video.readyState >= 1) { ok(); return; }
      video.addEventListener(ev, ok);
      video.addEventListener('error', onErr);
      var t = setTimeout(ko, ms || 8000);
    });
  }

  // ─── Actions de transport ───────────────────────────────────────────────
  function togglePlay() {
    if (!video.src && !hls) { L('warn', 'Aucune source chargée.'); return; }
    if (video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function (e) { L('error', 'play() rejeté : ' + e.message); });
    } else {
      video.pause();
    }
    updateHud();
  }

  function seekBy(delta) {
    if (!video.duration) { L('warn', 'seek ignoré : durée inconnue (metadata absentes).'); return; }
    var target = Math.max(0, Math.min(video.duration - 0.3, video.currentTime + delta));
    L('info', 'seek ' + (delta > 0 ? '+' : '') + delta + ' s → ' + fmt(target));
    video.currentTime = target;
  }

  function seekTo(t) { if (video.duration) video.currentTime = Math.max(0, Math.min(video.duration - 0.3, t)); }

  function stop() {
    L('info', '■ stop');
    try { video.pause(); video.currentTime = 0; } catch (e) {}
    updateHud();
  }

  function toggleMute() {
    video.muted = !video.muted;
    L('info', 'muet = ' + video.muted);
  }

  // ─── Reprise (test en deux temps) ───────────────────────────────────────
  function saveResume(tag) {
    try {
      localStorage.setItem(LS_POS, JSON.stringify({
        url: currentUrl(), t: video.currentTime, tag: tag || 'manual', at: Date.now()
      }));
      L('info', 'Position mémorisée pour le test de reprise : ' + fmt(video.currentTime) + ' s');
      return true;
    } catch (e) { L('error', 'localStorage inaccessible : ' + e.message); return false; }
  }
  function readResume() {
    try { return JSON.parse(localStorage.getItem(LS_POS) || 'null'); } catch (e) { return null; }
  }
  function clearResume() { try { localStorage.removeItem(LS_POS); } catch (e) {} }

  /** Après rechargement : si une reprise était attendue, la valide. */
  function attemptResume() {
    var r = readResume();
    if (!r || !r.url || !r.t) return null;
    if (!current || current.url !== r.url) { clearResume(); return null; }
    return waitFor('loadedmetadata', 12000).then(function () {
      seekTo(r.t);
      L('info', 'Reprise demandée à ' + fmt(r.t) + ' s (tag=' + r.tag + ')');
      // ANTI-COURSE : l'écouteur 'playing' est branché AVANT play(), car la
      // promesse play() peut se résoudre APRÈS l'événement 'playing' (on le
      // raterait alors et le test déclarerait un faux échec).
      var played = waitFor('playing', 6000);
      var playPromise = null;
      try { playPromise = video.play(); }
      catch (e) { playPromise = Promise.reject(e); }
      var guarded = (playPromise && playPromise.then)
        ? playPromise.then(function () { return played; },
                           function (err) { return Promise.reject(err); })
        : played;
      return Promise.race([played, guarded]).then(function () {
          var ok = Math.abs(video.currentTime - r.t) < 4;
          window.VLog.log(ok ? 'success' : 'error', 'test',
            (ok ? 'REPRISE VALIDÉE à ' : 'REPRISE ÉCHEC (retrouvé ') + fmt(video.currentTime) +
            (ok ? ' s.' : ' au lieu de ' + fmt(r.t) + ' s)'));
          emit('resume-checked', { ok: ok, expected: r.t, got: video.currentTime, tag: r.tag });
          clearResume();                    // la reprise ne tente qu'une seule fois
          return ok;
        }).catch(function (e) {
          L('error', 'Reprise : play() refusé (' + e.message + ')');
          emit('resume-checked', { ok: false, error: e.message, tag: r.tag });
          clearResume();
          return false;
        });
    }).catch(function (e) {
      L('error', 'Reprise impossible : ' + e.message);
      emit('resume-checked', { ok: false, error: e.message, tag: r.tag });
      clearResume();
      return false;
    });
  }

  function emit(name, data) {
    for (var i = 0; i < watchers.length; i++) {
      try { watchers[i](name, data); } catch (e) {}
    }
  }

  function init() {
    video = $('video');
    attachVideoEvents();
    setInterval(watchdog, 1000);
    document.addEventListener('visibilitychange', function () {
      L('info', 'visibilitychange → ' + document.visibilityState);
    });
    window.addEventListener('pagehide', function () { L('warn', 'pagehide (fermeture/rechargement de la page)'); });
    L('info', 'Lecteur initialisé.');
  }

  window.VPlayer = {
    init: init,
    load: load,
    video: function () { return video; },
    current: function () { return current; },
    togglePlay: togglePlay,
    seekBy: seekBy,
    seekTo: seekTo,
    stop: stop,
    toggleMute: toggleMute,
    bufferedAhead: bufferedAhead,
    fmt: fmt,
    saveResume: saveResume,
    readResume: readResume,
    clearResume: clearResume,
    attemptResume: attemptResume,
    pickMode: pickMode,
    onUpdate: function (fn) { watchers.push(fn); },
    currentUrl: currentUrl
  };
})();
