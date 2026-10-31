/* VIDAA Player Lab — sources de démonstration publiques (HTTPS, vérifiées 200/206)
 *
 * Vérification réseau faite avant livraison (2026-10-31) :
 *  - media.w3.org  → GET partiel 206 (ranges OK)
 *  - cdn.plyr.io   → GET partiel 206
 *  - test-streams.mux.dev → 200 + Access-Control-Allow-Origin: *
 *  - devstreaming-cdn.apple.com → 200 (HLS Apple, sans CORS : utilisable en
 *    HLS natif ou en lecture <video> sans crossOrigin ; échouera en hls.js si
 *    CORS bloquant — c'est justement un cas de diagnostic)
 *  - le bucket "gtv-videos-bucket" de Google renvoyait 403 depuis notre réseau :
 *    il est donc EXCLU de la liste.
 */
(function () {
  'use strict';

  var SOURCES = [
    {
      id: 'sintel-mp4',
      label: 'MP4 · Sintel (W3C)',
      type: 'mp4',
      url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
      note: 'H.264 + AAC, ~52 s, serveur W3C très stable, supporte les ranges (tests d’avance/arrière).'
    },
    {
      id: 'plyr-mp4',
      label: 'MP4 · Plyr 720p',
      type: 'mp4',
      url: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
      note: 'H.264 + AAC, ~2 min — idéal pour les tests de pause/avance/reprise.'
    },
    {
      id: 'mux-hls',
      label: 'HLS · Mux test (multi-débit)',
      type: 'hls',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      note: 'CORS ouvert (*) — test hls.js (MSE) ou HLS natif si le navigateur le permet.'
    },
    {
      id: 'apple-hls',
      label: 'HLS · Apple bipbop',
      type: 'hls',
      url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
      note: 'HLS Apple segments fMP4 — cas « sans CORS » : sert à diagnostiquer les blocages.'
    }
  ];

  var LS_CUSTOM = 'vidaa_lab_custom_url';

  window.VSources = {
    list: function () { return SOURCES.slice(); },
    find: function (id) {
      for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
      return null;
    },
    getCustom: function () {
      try { return localStorage.getItem(LS_CUSTOM) || ''; } catch (e) { return ''; }
    },
    setCustom: function (url) {
      try { localStorage.setItem(LS_CUSTOM, url || ''); } catch (e) {}
    },
    isHls: function (url) {
      return /\.m3u8($|\?)/i.test(String(url || ''));
    },
    isHttps: function (url) {
      return /^https:\/\//i.test(String(url || ''));
    }
  };
})();
