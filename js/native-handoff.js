/* VIDAA Player Lab — handoff vers le lecteur natif Hisense
 * ═══════════════════════════════════════════════════════════════════════
 * Technique et contrat de message étudiés dans le projet open source
 *   https://github.com/NoobyGains/stremio-vidaa-tv  (licence GPLv2)
 * fichier de référence : patches/head/kernel/native-player.js
 * Ce fichier est une RÉÉCRITURE originale pour ce prototype (aucun code
 * copié-collé) ; seul le protocole fonctionnel est repris, avec attribution
 * complète dans NOTICE.
 *
 * FAITS ÉTABLIS par les auteurs de ce projet (issues #28/#29, firmwares testés) :
 *  1. `omi_platform.sendPlatformMessage` (variante `opera_omi`) est un vrai
 *     pont Opera/Vewd injecté par le navigateur/WebView VIDAA.
 *  2. Seul le type de message `AllAppsUpdate` (rafraîchissement du launcher)
 *     est confirmé comme agissant sur les firmwares VIDAA étudiés.
 *  3. Les types `launchNativePlayer` / `openMediaPlayer` / `playVideo`
 *     NE SONT PRIS EN CHARGE par AUCUN firmware confirmé : l'envoi est
 *     « fire-and-forget », sans aucun accusé de réception.
 *  4. Donc : SI le pont existe ET que la page passe réellement en
 *     arrière-plan (visibilitychange→hidden / blur / pagehide) dans le délai,
 *     on considère la main tendue comme « vérifiée ». Sinon = ÉCHEC explicite.
 *
 * Aucune API VIDAA n'est inventée ici : seuls `omi_platform` /
 * `opera_omi` et les trois types de messages sont utilisés, tous observés
 * dans le code source de référence.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var VERIFY_MS = 2000;            // identique à la valeur de référence
  var inFlight = false;

  function L(level, msg, data) { window.VLog.log(level, 'native', msg, data); }

  /** Détection du pont — sans jamais lever d'exception. */
  function detect() {
    var res = { omi: false, send: false, operaOmi: false, sendName: null, err: null };
    try { res.omi = (typeof window.omi_platform !== 'undefined') && !!window.omi_platform; } catch (e) { res.err = String(e); }
    try {
      res.send = res.omi && (typeof window.omi_platform.sendPlatformMessage === 'function');
    } catch (e) { res.err = String(e); }
    if (res.send) res.sendName = 'omi_platform';
    if (!res.send) {
      try {
        res.operaOmi = (typeof window.opera_omi !== 'undefined') && !!window.opera_omi &&
          (typeof window.opera_omi.sendPlatformMessage === 'function');
      } catch (e) {}
      if (res.operaOmi) { res.send = true; res.sendName = 'opera_omi'; }
    }
    return res;
  }

  /** Devine le type MIME à partir de l'extension (contrat observé de référence). */
  function guessMime(url) {
    var p = '';
    try { p = String(url || '').split('?')[0].toLowerCase(); } catch (e) {}
    if (p.indexOf('.mkv') !== -1) return 'video/x-matroska';
    if (p.indexOf('.m3u8') !== -1) return 'application/vnd.apple.mpegurl';
    if (p.indexOf('.mpd') !== -1) return 'application/dash+xml';
    if (p.indexOf('.webm') !== -1) return 'video/webm';
    if (p.indexOf('.mov') !== -1) return 'video/quicktime';
    return 'video/mp4';
  }

  /**
   * Lance la tentative de handoff.
   * @param {string} url   flux à transmettre
   * @param {string} titre titre affiché
   * @param {object} opts  { verifyMs }
   * @returns {Promise<{ok:boolean, reason:string, detail:string, sent:string[], sendErrors:string[], signal:string|null, elapsedMs:number}>}
   */
  function launch(url, title, opts) {
    opts = opts || {};
    var verifyMs = (typeof opts.verifyMs === 'number' ? opts.verifyMs : VERIFY_MS);

    return new Promise(function (resolve) {
      if (inFlight) {
        L('warn', 'Handoff déjà en cours — tentative ignorée.');
        resolve(mk(false, 'busy', 'Une tentative est déjà en cours.', '', [], [], null, 0));
        return;
      }

      var d = detect();
      if (!d.send) {
        L('warn', 'Pont omi_platform absent : handoff impossible sur cet environnement.');
        resolve(mk(false, 'no-bridge',
          'omi_platform.sendPlatformMessage est absent de ce contexte.',
          'Soit ce navigateur n\'injecte pas le pont VIDAA, soit l\'application tourne hors du WebView Hisense. ' +
          'Comparez : ouvrir la même page dans le navigateur Internet de la TV puis via une tuile installée (Sidee).',
          [], [], null, 0));
        return;
      }
      if (!url) {
        resolve(mk(false, 'no-url', 'Aucun flux à transmettre.', 'Lancez d\'abord la lecture d\'une source.', [], [], null, 0));
        return;
      }

      inFlight = true;
      var t0 = Date.now();
      var signal = null;
      var settled = false;

      function finish(ok, reason, detail) {
        if (settled) return;
        settled = true;
        cleanup();
        inFlight = false;
        var elapsed = Date.now() - t0;
        var res = mk(ok, reason, detail, signal, sent, sendErrors, signal, elapsed);
        if (ok) {
          L('success', 'Handoff VÉRIFIÉ : la page est passée en arrière-plan (' + signal + ') après ' + elapsed + ' ms. ' +
            'Attention : aucun accusé de réception n\'existe — la lecture native reste à confirmer visuellement à l\'écran.');
        } else {
          L('error', 'Handoff ÉCHEC (' + reason + ') après ' + elapsed + ' ms — ' + detail);
        }
        resolve(res);
      }

      function onVis() {
        if (document.visibilityState === 'hidden' || document.hidden === true) {
          signal = 'visibilitychange→hidden';
          finish(true, 'verified', 'Page masquée suite à l\'envoi.');
        }
      }
      function onBlur() { signal = 'window.blur'; finish(true, 'verified', 'Fenêtre perdue le focus.'); }
      function onHide() { signal = 'pagehide'; finish(true, 'verified', 'Événement pagehide reçu.'); }

      function cleanup() {
        try { document.removeEventListener('visibilitychange', onVis); } catch (e) {}
        try { window.removeEventListener('blur', onBlur); } catch (e) {}
        try { window.removeEventListener('pagehide', onHide); } catch (e) {}
        clearTimeout(timer);
      }

      // État avant envoi (diagnostic : une page DÉJÀ masquée fausserait la vérif)
      var alreadyHidden = (document.visibilityState === 'hidden' || document.hidden === true);
      var hadFocus = null;
      try { hadFocus = document.hasFocus(); } catch (e) {}

      // Brasage de la vérification AVANT l'envoi (sinon on peut rater une
      // bascule très rapide) — même logique que le code de référence.
      if (alreadyHidden) {
        signal = 'already-hidden';
        L('warn', 'La page était DÉJÀ masquée avant envoi : la vérification ne prouve rien.');
      }
      document.addEventListener('visibilitychange', onVis, false);
      window.addEventListener('blur', onBlur, false);
      window.addEventListener('pagehide', onHide, false);
      var timer = setTimeout(function () {
        finish(false, 'no-signal',
          'Aucun signal d\'arrière-plan dans les ' + verifyMs + ' ms : le firmware a ignoré la commande ' +
          '(cas documenté sur VIDAA) ou le navigateur ne remonte pas les événements de visibilité.');
      }, verifyMs);

      var mimeType = guessMime(url);
      var title2 = title || document.title || 'VIDAA Player Lab';

      // Contrat de message EXACTEMENT tel qu'observé dans native-player.js.
      var messages = [
        { type: 'launchNativePlayer', url: url, title: title2, mimeType: mimeType },
        { type: 'openMediaPlayer', url: url, title: title2 },
        { type: 'playVideo', url: url, mimeType: mimeType, title: title2 }
      ];
      var sent = [], sendErrors = [];

      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        try {
          if (d.sendName === 'opera_omi') window.opera_omi.sendPlatformMessage(JSON.stringify(m));
          else window.omi_platform.sendPlatformMessage(JSON.stringify(m));
          sent.push(m.type);
          L('info', 'Message envoyé (sans ACK) : ' + m.type);
        } catch (e) {
          sendErrors.push(m.type + ' → ' + (e && e.message ? e.message : String(e)));
          L('error', 'Le pont a REFUSÉ/levé sur ' + m.type + ' : ' + (e && e.message ? e.message : String(e)));
        }
      }

      if (sent.length === 0 && sendErrors.length > 0) {
        finish(false, 'send-threw', 'Tous les envois ont levé une exception : ' + sendErrors.join(' ; '));
        return;
      }
      if (alreadyHidden) {
        // On n'attend pas : le signal pré-existant ne prouve rien, on laisse
        // le timer décider (un vrai signal post-envoi reste possible).
        L('warn', 'Signal pré-existant ignoré — on attend un signal PROVENU de l\'envoi.');
      }

      // Fabrique de résultat — déclarée dans l'étendue de l'exécuteur, donc
      // hoistée et utilisable par les retours précoces (busy / no-bridge).
      // `d`, `alreadyHidden`, `hadFocus` peuvent être encore indefinis lors
      // des retours précoces : on les garde tolérants.
      function mk(ok, reason, detail, signalUsed, sentL, errsE, sig, ms) {
        return {
          ok: ok, reason: reason, detail: detail,
          signal: sig || signalUsed || null,
          sent: sentL || [],
          sendErrors: errsE || [],
          elapsedMs: ms || 0,
          bridge: (d && d.sendName) || null,
          alreadyHidden: alreadyHidden === true,
          hadFocus: (typeof hadFocus === 'boolean' ? hadFocus : null)
        };
      }
    });
  }

  window.VNative = {
    detect: detect,
    launch: launch,
    guessMime: guessMime,
    verifyMs: VERIFY_MS,
    inFlight: function () { return inFlight; }
  };
})();
