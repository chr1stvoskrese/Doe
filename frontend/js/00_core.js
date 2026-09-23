// Scroll prevention is handled by CSS (html, body { overflow: hidden })

let state = { columns: [], workspaces: [], activeWorkspaceId: null };
const API_BASE = '/api/v1';

// ============================================================================
// 🔒 БЕЗ СЕТЕВОГО СЕРВЕРА: окно грузится по file://. Отсюда — база каталога
// frontend/ (для воркеров) и корень вложений (для file://-URL картинок).
// ============================================================================
// Каталог frontend/ с завершающим слэшем. wrapper.py инжектит точный путь
// (рантайм-html лежит НЕ в frontend/, а base href указывает на бандл),
// поэтому предпочитаем уже заданное значение, иначе — из текущего URL.
window.__DOE_FRONTEND_BASE = window.__DOE_FRONTEND_BASE || location.href.replace(/[^/]*(?:\?.*)?(?:#.*)?$/, '');
window.__DOE_ATTACH = window.__DOE_ATTACH || '';   // attachments_dir (было /doe/)
window.__DOE_VAULT = window.__DOE_VAULT || '';     // активное хранилище
self.__DOE_ATTACH = window.__DOE_ATTACH;

// Подгружает абсолютные корни вложений из моста. Вызывается при старте (и при
// каждой перезагрузке окна — т.е. и после смены vault, которая навигирует окно).
async function doeLoadAssetRoots() {
    try {
        if (typeof _bridgeReady === 'function') { await _bridgeReady(); }
        if (window.pywebview && window.pywebview.api && window.pywebview.api.get_asset_roots) {
            const r = await window.pywebview.api.get_asset_roots();
            if (r) {
                window.__DOE_ATTACH = r.attachments_dir || '';
                window.__DOE_VAULT = r.vault_dir || '';
                self.__DOE_ATTACH = window.__DOE_ATTACH;
            }
        }
    } catch (e) { console.warn('[Assets] get_asset_roots failed', e); }
}
window.prioritySettings = {
    show_always: false,
    t_low: 40, t_mid: 70,
    e_low: "😞", e_mid: "😐", e_high: "🤩", e_none: "?",
    c_low: "#D35446", "c_mid": "#B3863A", "c_high": "#89A085", c_none: "#7C5CB7"
};
if (navigator.userAgent.toLowerCase().includes('mac')) {
    document.documentElement.classList.add('mac-os');
}
let cmEditor = null;

if (navigator.userAgent.toLowerCase().includes('windows')) {
    document.documentElement.classList.add('win-os');
}

if (navigator.userAgent.toLowerCase().includes('linux')) {
    document.documentElement.classList.add('linux-os');
}

