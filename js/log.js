/* VIDAA Player Lab — journal horodaté (ES5 pour compatibilité navigateur TV) */
(function () {
  'use strict';

  var MAX = 400;
  var entries = [];
  var listeners = [];

  function ts(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
      '.' + ('00' + d.getMilliseconds()).slice(-3);
  }

  /**
   * log(level, cat, message[, data])
   *  level: 'info' | 'warn' | 'error' | 'success' | 'debug'
   *  cat:   courte étiquette ('player', 'native', 'keys', 'test', 'diag'…)
   */
  function log(level, cat, message, data) {
    var line = {
      time: ts(new Date()),
      level: level || 'info',
      cat: cat || 'app',
      msg: String(message == null ? '' : message),
      data: data === undefined ? null : data
    };
    if (line.data !== null) {
      try { line.msg += ' ' + (typeof line.data === 'string' ? line.data : JSON.stringify(line.data)); }
      catch (e) { line.msg += ' [data illisible]'; }
    }
    entries.push(line);
    if (entries.length > MAX) entries.splice(0, entries.length - MAX);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](line); } catch (e) {}
    }
    // console aussi, pour le débogage navigateur
    try {
      var fn = level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'log');
      console[fn]('[' + line.time + '][' + line.cat + '] ' + line.msg);
    } catch (e) {}
    return line;
  }

  function text() {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      out.push(e.time + ' [' + e.level.toUpperCase() + '][' + e.cat + '] ' + e.msg);
    }
    return out.join('\n');
  }

  window.VLog = {
    log: log,
    text: text,
    all: function () { return entries.slice(); },
    clear: function () { entries.length = 0; if (typeof render === 'function') render(); },
    onEntry: function (fn) { listeners.push(fn); }
  };

  // Erreurs globales (parse error, reference error…) → journal
  window.addEventListener('error', function (ev) {
    log('error', 'window', 'Erreur non interceptée : ' + (ev.message || '') +
      (ev.filename ? ' @ ' + ev.filename.split('/').pop() + ':' + ev.lineno : ''));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    log('error', 'window', 'Promesse rejetée sans gestionnaire : ' +
      (r && r.message ? r.message : String(r)));
  });

  // Rendu DOM du panneau journal
  var out = null;
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function render() {
    if (!out) out = document.getElementById('log-output');
    if (!out) return;
    var html = [];
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      html.push('<span class="t-' + e.level + '">' + esc(e.time + ' [' + e.cat + '] ' + e.msg) + '</span>');
    }
    out.innerHTML = html.join('\n') || '(vide)';
  }
  window.VLog.render = render;
  window.VLog.onEntry(function () { if (render) render(); });
})();
