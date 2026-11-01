/* VIDAA Player Lab — panneau Xtream Codes : connexion, diagnostic, catalogue
 * ═══════════════════════════════════════════════════════════════════════
 *  - Identifiants : saisis ici, chiffrés par VSecure (ou mémoire seule),
 *    JAMAIS affichés, journalisés en clair, ni persistés ailleurs.
 *  - Diagnostic : 6 étapes séparées (URL, mixed content, joignabilité,
 *    CORS, auth, inventaire) pour ne jamais confondre les causes.
 *  - Catalogue : catégories → items → détail → ▶ Lire (VPlayer existant).
 *  - Rapport formats/codecs : persisté SANS identifiants (ni URL média).
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function L(level, msg, data) { window.VLog.log(level, 'xt-ui', msg, data); }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var LS_BASE = 'xtream_base_url';       // seule donnée conservée : le SERVEUR (pas un identifiant)

  var st = {
    mode: null,          // 'vod' | 'series' | 'live'
    cats: null,          // catégories chargées
    items: [],           // items de la catégorie courante
    shown: 0,            // pagination affichée
    cfg: null,           // config de travail (mémoire uniquement)
    lastPlay: null,      // dernière lecture lancée (pour le rapport)
    diagRunning: false
  };

  var PAGE = 50;         // éléments affichés par lot (TV : DOM léger)

  /* ── Messages courts ─────────────────────────────────────────────── */
  function setStatus(id, txt, cls) {
    var el = $(id);
    if (!el) return;
    el.className = 'status' + (cls ? ' ' + cls : '');
    el.textContent = txt;
  }
  function toast(msg, cls) {
    if (window.VApp && window.VApp.toast) window.VApp.toast(msg, cls);
    else L('info', 'toast(' + (cls || 'info') + '): ' + msg);
  }

  /* ── Configuration de travail ────────────────────────────────────── */
  function fieldCfg() {
    var b = ($('xt-server') || {}).value || '';
    var u = ($('xt-user') || {}).value || '';
    var p = ($('xt-pass') || {}).value || '';
    b = String(b).trim(); u = String(u).trim(); p = String(p);
    if (!b || !u || !p) return null;
    return { b: b, u: u, p: p };
  }
  /** Config de travail : champs saisis en priorité, coffre déverrouillé en
   *  complément (un champ laissé vide ne force pas à tout retaper). */
  function workCfg() {
    var mem = (window.VSecure && !window.VSecure.locked()) ? window.VSecure.get() : null;
    var b = String(($('xt-server') || {}).value || '').trim();
    var u = String(($('xt-user') || {}).value || '').trim();
    var p = String(($('xt-pass') || {}).value || '');
    var cfg = {
      b: b || (mem ? mem.b : ''),
      u: u || (mem ? mem.u : ''),
      p: p || (mem ? mem.p : '')
    };
    if (!cfg.b || !cfg.u || !cfg.p) return null;
    return cfg;
  }
  function cfgOrFail() {
    var c = workCfg();
    if (!c) {
      toast('Renseignez serveur + utilisateur + mot de passe (ou déverrouillez le coffre).', 'bad');
      return null;
    }
    var parsed = window.VXtream.parseServerUrl(c.b);
    if (!parsed.ok) { toast('URL serveur invalide : ' + parsed.error, 'bad'); return null; }
    c = { b: parsed.base, base: parsed.base, u: c.u, p: c.p };
    st.cfg = c;
    // Le serveur seul n'est pas un identifiant… MAIS une URL de relais
    // (/k/<code>/…) contient le code d'accès : jamais persistée en clair,
    // exactement comme une URL Xtream. Enregistrez-la dans le coffre chiffré.
    if (!/^\/k\//i.test(parsed.path)) {
      try { localStorage.setItem(LS_BASE, parsed.base); } catch (e) {}
    }
    return c;
  }

  /* ── Coffre ──────────────────────────────────────────────────────── */
  function renderVault() {
    var el = $('xt-vault');
    if (!el) return;
    if (!window.VSecure.available()) {
      el.className = 'status bad';
      el.textContent = 'COFFRE INDISPONIBLE : WebCrypto absent de ce contexte (page non sécurisée ?). ' +
        'Les identifiants ne seront JAMAIS stockés en clair — saisie possible pour la session uniquement.';
      return;
    }
    if (window.VSecure.locked()) {
      el.className = 'status ' + (window.VSecure.exists() ? 'warn' : '');
      el.textContent = window.VSecure.exists()
        ? 'Coffre chiffré présent sur cette TV (verrouillé). Saisissez la phrase secrète puis « Déverrouiller » — ' +
          'la phrase n\'est jamais stockée : elle est à retaper à chaque rechargement.'
        : 'Aucun coffre enregistré. Renseignez les champs puis « Enregistrer chiffré » pour conserver vos accès ' +
          'sur cette TV (AES-GCM 256, clé dérivée de votre phrase secrète).';
      return;
    }
    var mem = window.VSecure.get();
    el.className = 'status ok';
    el.textContent = 'Coffre DÉVERROUILLÉ pour cette session (serveur : ' + mem.b +
      ', utilisateur : •••). Rien n\'est écrit en clair : à la fermeture de la page, il faudra la phrase secrète.';
  }

  function saveVault() {
    var f = fieldCfg();
    if (!f) { toast('Serveur, utilisateur et mot de passe requis pour enregistrer.', 'bad'); return; }
    var phrase = String(($('xt-phrase') || {}).value || '');
    var parsed = window.VXtream.parseServerUrl(f.b);
    if (!parsed.ok) { toast('URL serveur invalide : ' + parsed.error, 'bad'); return; }
    window.VSecure.save({ b: parsed.base, u: f.u, p: f.p }, phrase).then(function () {
      $('xt-pass').value = ''; $('xt-phrase').value = '';
      renderVault();
      toast('Identifiants chiffrés et conservés sur cette TV.', 'ok');
    }).catch(function (e) { toast(e.message, 'bad'); renderVault(); });
  }

  function unlockVault() {
    var phrase = String(($('xt-phrase') || {}).value || '');
    window.VSecure.unlock(phrase).then(function () {
      $('xt-phrase').value = '';
      renderVault();
      toast('Coffre déverrouillé pour cette session.', 'ok');
    }).catch(function (e) { toast(e.message, 'bad'); renderVault(); });
  }

  function forgetVault() {
    window.VSecure.forget();
    renderVault();
    toast('Coffre supprimé de cette TV.', 'info');
  }

  /* ── Diagnostic ──────────────────────────────────────────────────── */
  function runDiag() {
    if (st.diagRunning) return;
    var cfg = cfgOrFail();
    if (!cfg) return;
    var ol = $('xt-steps');
    if (ol) ol.innerHTML = '';
    setStatus('xt-verdict', 'Diagnostic en cours… les étapes s\'affichent au fur et à mesure.', '');
    st.diagRunning = true;
    var btn = $('btn-xt-diag');
    if (btn) btn.disabled = true;

    var byId = {};
    window.VXtream.diagnose(cfg, function (s) {
      if (!ol) return;
      var li = byId[s.id];
      if (!li) {
        li = document.createElement('li');
        byId[s.id] = li;
        ol.appendChild(li);
      }
      var cls = s.state === 'ok' ? 'pass' : (s.state === 'fail' ? 'fail' :
        (s.state === 'warn' ? 'skip' : 'skip'));
      var tag = s.state === 'ok' ? 'OK' : (s.state === 'fail' ? 'BLOQUÉ' :
        (s.state === 'warn' ? 'ATTENTION' : '…'));
      li.innerHTML = '<b>' + esc(s.label) + '</b> — <span class="' + cls + '">' + tag + '</span>' +
        (s.detail ? '<br><span class="detail">' + esc(s.detail) + '</span>' : '');
    }).then(function (rep) {
      st.diagRunning = false;
      if (btn) btn.disabled = false;
      var cls = rep.blockers.length ? (rep.inv ? 'warn' : 'bad') : 'ok';
      var txt = rep.verdict;
      if (rep.blockers.length) txt += '\n\nBlocage : ' + rep.blockers.join('\n');
      if (rep.hints.length) txt += '\n\n' + rep.hints.join('\n');
      setStatus('xt-verdict', txt, cls);
      if (rep.inv && !rep.inv.partial) {
        toast('Connexion validée — le catalogue est accessible.', 'ok');
        showCatalogue(true);
      } else if (rep.blockers.length) {
        toast('Diagnostic : ' + rep.blockers[0].substring(0, 90), 'bad');
      }
      renderReport();
    }).catch(function (e) {
      st.diagRunning = false;
      if (btn) btn.disabled = false;
      setStatus('xt-verdict', 'Erreur inattendue du diagnostic : ' + (e && e.message ? e.message : e), 'bad');
      L('error', 'diagnostic exception: ' + (e && e.stack ? e.stack : e));
    });
  }

  /* ── Catalogue ───────────────────────────────────────────────────── */
  function showCatalogue(on) {
    ['xt-cats', 'xt-items'].forEach(function (id) {
      var el = $(id);
      if (el) { el.innerHTML = ''; el.className = on ? 'btnrow hidden' : 'btnrow hidden'; }
    });
    var d = $('xt-detail');
    if (d && on) { d.className = 'status hidden'; d.innerHTML = ''; }
  }

  var CAT_ACTIONS = {
    vod: { cats: 'get_vod_categories', items: 'get_vod_streams', label: 'Films' },
    series: { cats: 'get_series_categories', items: 'get_series', label: 'Séries' },
    live: { cats: 'get_live_categories', items: 'get_live_streams', label: 'Direct' }
  };

  function loadCats(mode) {
    var cfg = cfgOrFail();
    if (!cfg) return;
    var conf = CAT_ACTIONS[mode];
    st.mode = mode;
    st.cats = null;
    setStatus('xt-msg', 'Chargement des catégories ' + conf.label + '…', '');
    showCatalogue(true);
    var box = $('xt-cats');
    if (box) box.className = 'btnrow hidden';
    var items = $('xt-items');
    if (items) items.className = 'btnrow hidden';
    window.VXtream.apiCall(cfg, conf.cats).then(function (r) {
      if (r.kind !== 'ok') {
        setStatus('xt-msg', 'Échec du chargement des catégories (' + r.kind + ') : ' + r.error, 'bad');
        return;
      }
      var cats = Array.isArray(r.json) ? r.json : [];
      st.cats = cats;
      if (!cats.length) {
        setStatus('xt-msg', 'Aucune catégorie ' + conf.label + ' renvoyée par le serveur.', 'warn');
        return;
      }
      setStatus('xt-msg', cats.length + ' catégories ' + conf.label + ' — choisissez :', '');
      if (box) {
        box.className = 'btnrow';
        cats.forEach(function (c) {
          var b = document.createElement('button');
          b.className = 'btn small';
          b.setAttribute('data-focus', '');
          b.textContent = c.category_name || ('catégorie ' + c.category_id);
          b.onclick = function () { loadItems(cfg, c); };
          box.appendChild(b);
        });
        try { box.querySelector('button').focus(); } catch (e) {}
      }
      L('info', cats.length + ' catégories ' + mode + ' chargées.');
    }).catch(function (e) {
      setStatus('xt-msg', 'Exception : ' + (e && e.message ? e.message : e), 'bad');
    });
  }

  function loadItems(cfg, cat) {
    var conf = CAT_ACTIONS[st.mode];
    var box = $('xt-items');
    if (box) { box.innerHTML = ''; box.className = 'btnrow hidden'; }
    var d = $('xt-detail');
    if (d) { d.className = 'status hidden'; d.innerHTML = ''; }
    setStatus('xt-msg', 'Chargement de « ' + (cat.category_name || '') + ' »…', '');
    st.items = []; st.shown = 0;
    window.VXtream.apiCall(cfg, conf.items, null, { category_id: cat.category_id }).then(function (r) {
      if (r.kind !== 'ok') {
        setStatus('xt-msg', 'Échec (' + r.kind + ') : ' + r.error, 'bad');
        return;
      }
      st.items = Array.isArray(r.json) ? r.json : [];
      if (!st.items.length) { setStatus('xt-msg', 'Catégorie vide.', 'warn'); return; }
      setStatus('xt-msg', st.items.length + ' élément(s) — choisissez (affichage par ' + PAGE + ') :', '');
      if (box) box.className = 'btnrow';
      renderItems();
      try { if (box && box.querySelector('button')) box.querySelector('button').focus(); } catch (e) {}
    }).catch(function (e) {
      setStatus('xt-msg', 'Exception : ' + (e && e.message ? e.message : e), 'bad');
    });
  }

  function itemLabel(it) {
    return it.name || it.title || ('#' + (it.stream_id || it.series_id || '?'));
  }
  function itemId(it) {
    return it.stream_id != null ? it.stream_id : it.series_id;
  }

  function renderItems() {
    var box = $('xt-items');
    if (!box) return;
    box.innerHTML = '';
    var end = Math.min(st.shown + PAGE, st.items.length);
    for (var i = st.shown; i < end; i++) {
      (function (it) {
        var b = document.createElement('button');
        b.className = 'btn small';
        b.setAttribute('data-focus', '');
        b.textContent = itemLabel(it);
        b.onclick = function () { openDetail(it); };
        box.appendChild(b);
      })(st.items[i]);
    }
    st.shown = end;
    if (st.shown < st.items.length) {
      var more = document.createElement('button');
      more.className = 'btn small primary';
      more.setAttribute('data-focus', '');
      more.textContent = '⬇ ' + Math.min(PAGE, st.items.length - st.shown) + ' de plus…';
      more.onclick = renderItems;
      box.appendChild(more);
    }
  }

  /* ── Détail + lecture ────────────────────────────────────────────── */
  function openDetail(it) {
    var cfg = st.cfg || cfgOrFail();
    if (!cfg) return;
    var d = $('xt-detail');
    if (!d) return;
    d.className = 'status';
    d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>Chargement des informations…';

    if (st.mode === 'vod') {
      window.VXtream.vodInfo(cfg, itemId(it)).then(function (info) {
        var md = (info && info.movie_data) || {};
        var inf = (info && info.info) || {};
        var ext = md.container_extension || 'mp4';
        var src = window.VXtream.buildSource(cfg, 'movie', itemId(it), ext, itemLabel(it), info);
        var lines = [
          '<b>' + esc(inf.name || itemLabel(it)) + '</b>',
          'Conteneur annoncé : <b>' + esc(ext) + '</b>' +
            (src.note.indexOf('codec inconnu') === -1 ? ' · ' + esc(src.note.replace(/^Xtream · /, '')) : ''),
          inf.genre ? 'Genre : ' + esc(inf.genre) : '',
          inf.duration ? 'Durée : ' + esc(inf.duration) : '',
          inf.plot ? '<span class="detail">' + esc(String(inf.plot).substring(0, 300)) + '</span>' : ''
        ].filter(Boolean).join('<br>');
        d.innerHTML = lines + '<div class="btnrow" id="xt-detail-btns"></div>';
        detailButtons(src, itemId(it), ext);
      }).catch(function (e) {
        d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>get_vod_info illisible : ' + esc(e.message) +
          '<br><span class="detail">Le fichier reste jouable à l\'aveugle (conteneur supposé : mp4).</span>' +
          '<div class="btnrow" id="xt-detail-btns"></div>';
        detailButtons(
          window.VXtream.buildSource(cfg, 'movie', itemId(it), 'mp4', itemLabel(it), null), itemId(it), 'mp4');
      });
      return;
    }

    if (st.mode === 'series') {
      window.VXtream.seriesInfo(cfg, itemId(it)).then(function (info) {
        var eps = [];
        var epMap = (info && info.episodes) || {};
        Object.keys(epMap).forEach(function (season) {
          (epMap[season] || []).forEach(function (ep) {
            eps.push({
              id: ep.id, ext: ep.container_extension || 'mp4',
              label: 'S' + season + 'E' + (ep.episode_num || '?') +
                (ep.title ? ' · ' + ep.title : '')
            });
          });
        });
        if (!eps.length) {
          d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>Aucun épisode retourné par le serveur.';
          return;
        }
        d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>' + eps.length +
          ' épisode(s) — choisissez ci-dessous :<div class="btnrow hidden" id="xt-ep-btns"></div>';
        var box = $('xt-ep-btns');
        box.className = 'btnrow';
        var shown = 0;
        function renderEps() {
          var end = Math.min(shown + PAGE, eps.length);
          for (var i = shown; i < end; i++) {
            (function (ep) {
              var b = document.createElement('button');
              b.className = 'btn small';
              b.setAttribute('data-focus', '');
              b.textContent = ep.label;
              b.onclick = function () {
                var src = window.VXtream.buildSource(cfg, 'episode', ep.id, ep.ext, ep.label, null);
                playSource(src, { title: ep.label, ext: ep.ext });
              };
              box.appendChild(b);
            })(eps[i]);
          }
          shown = end;
          if (shown < eps.length) {
            var more = document.createElement('button');
            more.className = 'btn small primary';
            more.setAttribute('data-focus', '');
            more.textContent = '⬇ épisodes suivants…';
            more.onclick = renderEps;
            box.appendChild(more);
          }
        }
        renderEps();
        try { box.querySelector('button').focus(); } catch (e) {}
      }).catch(function (e) {
        d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>get_series_info illisible : ' + esc(e.message);
      });
      return;
    }

    // live : lecture directe (HLS .m3u8 — nécessite CORS côté serveur)
    var src = {
      id: 'xtream-live-' + itemId(it),
      label: 'Direct · ' + itemLabel(it),
      type: 'hls',
      url: window.VXtream.mediaUrl(cfg, 'live', itemId(it), 'm3u8'),
      note: 'Xtream · live · m3u8 (HLS — CORS requis pour les segments)'
    };
    d.innerHTML = '<b>' + esc(itemLabel(it)) + '</b><br>Direct TV en HLS (.m3u8). ' +
      '<span class="detail">Le HLS exige CORS sur le serveur : si le manifeste échoue, c\'est signalé en fin de Journal.</span>' +
      '<div class="btnrow" id="xt-detail-btns"></div>';
    detailButtons(src, itemId(it), 'm3u8');
  }

  function detailButtons(src, id, ext) {
    var box = $('xt-detail-btns');
    if (!box) return;
    box.innerHTML = '';
    var play = document.createElement('button');
    play.className = 'btn primary';
    play.setAttribute('data-focus', '');
    play.textContent = '▶ Lire';
    play.onclick = function () { playSource(src, { title: src.label, ext: ext }); };
    box.appendChild(play);

    var probe = document.createElement('button');
    probe.className = 'btn small';
    probe.setAttribute('data-focus', '');
    probe.textContent = '🔍 Tester l\'accès au fichier';
    probe.onclick = function () {
      setStatus('xt-detail', 'Test d\'accès média (1 octet, requête annulée aussitôt)…', '');
      window.VXtream.mediaProbe(src.url).then(function (r) {
        var map = {
          ok: ['Le serveur média RÉPOND à la requête (portée réseau prouvée — la réponse est opaque ' +
               'sans CORS, mais <video> n\'exige pas de CORS : la lecture reste testable).', 'ok'],
          mixed: ['BLOQUÉ : contenu mixte (page HTTPS → fichier HTTP). Aucune lecture possible depuis ici.', 'bad'],
          timeout: ['Délai dépassé sur le fichier (port média différent ou fermé ?).', 'warn'],
          fail: ['Fichier injoignable (DNS/port/pare-feu, ou erreur réseau).', 'bad']
        };
        var m = map[r.state] || ['Résultat inconnu : ' + r.state, 'warn'];
        setStatus('xt-detail', m[0], m[1]);
        L('info', 'mediaProbe (' + ext + ') → ' + r.state);
      });
    };
    box.appendChild(probe);
  }

  function playSource(src, meta) {
    st.lastPlay = { title: (meta && meta.title) || src.label, ext: (meta && meta.ext) || '?', recorded: false };
    L('info', 'Lecture Xtream demandée : ' + src.label + ' [' + src.type + '] conteneur=' +
      (meta && meta.ext ? meta.ext : '?'));
    var load = (window.VApp && window.VApp.loadSource)
      ? window.VApp.loadSource(src, { autoplay: true })
      : window.VPlayer.load(src, { autoplay: true });
    load.then(function () {
      var v = window.VPlayer.video();
      appendReport({
        title: st.lastPlay.title, ext: st.lastPlay.ext, result: 'metadata OK',
        detail: (v && v.videoWidth ? v.videoWidth + 'x' + v.videoHeight : '') +
          ' · durée ' + (v ? window.VPlayer.fmt(v.duration) : '?')
      });
      st.lastPlay.recorded = true;
      toast('Flux chargé — lecture en cours (HUD : Info).', 'ok');
      setTimeout(function () { var el = $('video'); if (el) try { el.focus(); } catch (e) {} }, 300);
    }).catch(function (e) {
      var msg = e && e.message ? e.message : String(e);
      // L'événement 'video-error' a pu déjà consigner l'échec : pas de doublon.
      if (!st.lastPlay.recorded) {
        appendReport({ title: st.lastPlay.title, ext: st.lastPlay.ext, result: 'ÉCHEC', detail: msg });
        st.lastPlay.recorded = true;
      }
      // Pas de toast ici : VApp.loadSource affiche déjà « Chargement échoué ».
      if (msg === 'timeout:loadedmetadata') {
        toast('Pas de metadata après 12 s — flux trop lent ou format refusé (voir Journal).', 'bad');
      }
    });
  }

  /** Échec média survenu APRÈS le chargement → consigné honnêtement. */
  function notePlaybackError(detail) {
    if (!st.lastPlay) return;
    if (!st.lastPlay.recorded) {
      appendReport({ title: st.lastPlay.title, ext: st.lastPlay.ext, result: 'ÉCHEC', detail: detail });
      st.lastPlay.recorded = true;
      return;
    }
    // Les metadata passaient mais la lecture a échoué ensuite : cas typique
    // d'un codec non décodable — signalé comme seconde ligne du rapport.
    if (st.lastPlay.lastError === detail) return;
    st.lastPlay.lastError = detail;
    appendReport({ title: st.lastPlay.title, ext: st.lastPlay.ext,
      result: 'ÉCHEC APRÈS METADATA', detail: detail });
  }

  /* ── Rapport formats & codecs (sans identifiants) ─────────────────── */
  function appendReport(entry) {
    entry.title = String(entry.title || '').substring(0, 80);
    entry.detail = window.VLog.redact(String(entry.detail || '')).substring(0, 160);
    window.VXtream.reportAppend(entry);
    renderReport();
    L('info', 'Rapport formats : « ' + entry.title + ' » [' + entry.ext + '] → ' + entry.result +
      (entry.detail ? ' (' + entry.detail + ')' : ''));
  }

  function renderReport() {
    var t = $('xt-report');
    if (!t) return;
    var rows = window.VXtream.reportRead();
    var html = '<tr><td>Date</td><td>Élément</td><td>Conteneur</td><td>Résultat</td><td>Détail</td></tr>';
    if (!rows.length) html += '<tr><td colspan="5" class="detail">Aucun essai enregistré — ' +
      'chaque lecture réussie ou échouée s\'inscrira ici (jamais d\'identifiants).</td></tr>';
    rows.forEach(function (r) {
      var cls = r.result === 'metadata OK' ? 'y' : 'n';
      html += '<tr><td>' + esc(String(r.at || '').replace('T', ' ').substring(0, 16)) + '</td>' +
        '<td>' + esc(r.title) + '</td><td>' + esc(r.ext) + '</td>' +
        '<td class="' + cls + '">' + esc(r.result) + '</td>' +
        '<td>' + esc(r.detail) + '</td></tr>';
    });
    t.innerHTML = html;

    var c = $('xt-codecs');
    if (c && !c.innerHTML) {
      var probes = [
        ['H.264/AVC (MP4)', 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'],
        ['H.265/HEVC (MP4)', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
        ['AV1 (MP4)', 'video/mp4; codecs="av01.0.05M.08"'],
        ['VP9 (WebM)', 'video/webm; codecs="vp9, opus"'],
        ['AAC (audio MP4)', 'audio/mp4; codecs="mp4a.40.2"'],
        ['HLS natif (.m3u8)', 'application/vnd.apple.mpegurl']
      ];
      var h = '';
      probes.forEach(function (pr) {
        var ans = '';
        try { ans = document.createElement('video').canPlayType(pr[1]) || 'non'; } catch (e) { ans = '?'; }
        h += '<tr><td>' + esc(pr[0]) + '</td><td class="' +
          (ans === 'probably' ? 'y' : (ans === 'maybe' ? 'w' : 'n')) + '">' + esc(ans) + '</td></tr>';
      });
      var mse = 'non';
      try { mse = ((typeof window.MediaSource !== 'undefined') && window.Hls && window.Hls.isSupported()) ? 'oui (hls.js utilisable)' : 'non'; } catch (e) {}
      h += '<tr><td>MSE (hls.js)</td><td class="' + (mse === 'non' ? 'n' : 'y') + '">' + esc(mse) + '</td></tr>';
      h += '<tr><td>MKV (conteneur)</td><td class="n">non jouable en HTML5 — ' +
        'si votre fournisseur sert du .mkv, l\'échec sera affiché tel quel</td></tr>';
      c.innerHTML = h;
    }
  }

  /* ── Câblage ─────────────────────────────────────────────────────── */
  function boot() {
    // URL serveur seule (pas un identifiant) mémorisée pour confort
    try {
      var saved = localStorage.getItem(LS_BASE);
      if (saved && $('xt-server') && !$('xt-server').value) $('xt-server').value = saved;
    } catch (e) {}

    renderVault();
    renderReport();

    var b;
    b = $('btn-xt-diag'); if (b) b.onclick = runDiag;
    b = $('btn-xt-save'); if (b) b.onclick = saveVault;
    b = $('btn-xt-unlock'); if (b) b.onclick = unlockVault;
    b = $('btn-xt-forget'); if (b) b.onclick = forgetVault;
    b = $('btn-xt-vod'); if (b) b.onclick = function () { loadCats('vod'); };
    b = $('btn-xt-series'); if (b) b.onclick = function () { loadCats('series'); };
    b = $('btn-xt-live'); if (b) b.onclick = function () { loadCats('live'); };
    b = $('btn-xt-report-clear'); if (b) b.onclick = function () {
      window.VXtream.reportClear(); renderReport(); toast('Rapport formats effacé.', 'info');
    };

    // Événement média → rapport (honnête, dédoublonné).
    window.VPlayer.onUpdate(function (name, data) {
      if (name === 'video-error') {
        if (data && data.retrying) return;      // simple réessai automatique, pas encore un échec final
        notePlaybackError('code ' + data.code + ' ' + (data.message || ''));
      } else if (name === 'hls-fatal') {
        notePlaybackError('hls ' + (data && data.details ? data.details : 'fatal'));
      } else if (name === 'stall-recovery' && data && data.attempt === 3) {
        notePlaybackError('blocage persistant après 3 récupérations');
      }
    });

    L('info', 'Panneau Xtream initialisé (coffre=' +
      (window.VSecure.exists() ? 'présent' : 'absent') + ', webcrypto=' + window.VSecure.available() + ').');
  }

  window.VXtreamUI = { boot: boot, runDiag: runDiag, renderReport: renderReport };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
