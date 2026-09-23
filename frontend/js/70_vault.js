// ============================================================
//  🔐 Прогресс шифрования / расшифровки
// ============================================================
// Поллинг эндпоинта прогресса. Возвращает функцию остановки.
function startVaultProgressPolling(op, fillEl, labelEl) {
    // Единое поведение для шифрования и расшифровки: полоса всегда начинается
    // с 0% и плавно заполняется. Никакого "бегающего" indeterminate-режима —
    // короткую паузу до начала обработки файлов (закрытие БД и т.п.)
    // полоса просто стоит пустой, активность показывает анимация замка.
    if (fillEl) fillEl.style.width = '0%';
    if (labelEl) labelEl.textContent = '';

    // Детект «замирания»: если счётчик не двигается >5с (например, система
    // докачивает выгруженный файл) — объясняем это пользователю.
    let lastDone = -1;
    let lastChangeAt = Date.now();
    let lastTotal = 0; // запоминаем, чтобы при завершении доснять счётчик до N/N

    const timer = setInterval(async () => {
        try {
            const r = await fetch(`${API_BASE}/system/vault/security/progress?t=${Date.now()}`);
            if (!r.ok) return;
            const p = await r.json();
            if (p.active && p.op === op && p.total > 0) {
                lastTotal = p.total;
                const pct = Math.min(100, Math.round((p.done / p.total) * 100));
                if (fillEl) fillEl.style.width = pct + '%';

                if (p.done !== lastDone) {
                    lastDone = p.done;
                    lastChangeAt = Date.now();
                }
                const stalled = (Date.now() - lastChangeAt) > 5000;
                if (labelEl) {
                    labelEl.textContent = t('security.filesCount', p.done, p.total)
                        + (stalled ? ' · ' + t('security.stalledHint') : '');
                }
            }
        } catch (e) { /* сервер занят/недоступен — просто пропускаем тик */ }
    }, 150);

    return () => {
        clearInterval(timer);
        if (fillEl) {
            fillEl.classList.remove('indeterminate');
            fillEl.style.width = '100%';
        }
        // Операция завершена целиком — счётчик не должен застревать на
        // последнем «пойманном» поллингом значении (напр., 13/29)
        if (labelEl && lastTotal > 0) {
            labelEl.textContent = t('security.filesCount', lastTotal, lastTotal);
        }
    };
}

// Шифрование активного хранилища с полноэкранным оверлеем прогресса.
// Используется при выходе на экран выбора хранилищ и при закрытии приложения.
window.lockVaultWithProgress = async () => {
    // Быстрая проверка: защищено ли хранилище и есть ли что шифровать
    let needLock = false;
    try {
        const r = await fetch(`${API_BASE}/system/vault/security/status?t=${Date.now()}`);
        if (r.ok) {
            const s = await r.json();
            needLock = s.protected === true && s.unlocked === true;
        }
    } catch (e) { /* сервер недоступен — шифровать нечем, выходим */ }

    const overlay = document.getElementById('vault-lock-overlay');
    let stopPolling = null;

    if (needLock && overlay) {
        _setVaultOverlayIcon('lock');
        document.getElementById('vault-lock-overlay-title').textContent = t('security.encrypting');
        document.getElementById('vault-lock-overlay-hint').textContent = t('security.encryptingHint');
        overlay.classList.add('show');
        stopPolling = startVaultProgressPolling(
            'lock',
            document.getElementById('vault-lock-overlay-fill'),
            document.getElementById('vault-lock-overlay-label')
        );
    }

    try {
        await fetch(`${API_BASE}/system/vault/lock`, { method: 'POST' });
    } catch (e) {
        console.error('Vault lock failed:', e);
    }

    if (stopPolling) stopPolling();
    if (needLock && overlay) {
        // Даем полосе визуально дойти до 100% перед скрытием
        await new Promise(res => setTimeout(res, 250));
        overlay.classList.remove('show');
    }
};

// ============================================================
//  Оверлей «Открытие / Загрузка хранилища»
//  Тот же визуальный язык, что у оверлея шифрования: замок, заголовок,
//  полоса прогресса. Последовательность этапов для зашифрованного хранилища:
//  1) расшифровка (модал пароля, N/M файлов) → 2) «Открытие хранилища...»
//  (инициализация БД, неопределённый прогресс) → 3) «Загрузка хранилища...»
//  (окно доски, ступенчатый прогресс). Для обычного — этапы 2 и 3.
// ============================================================
// Иконка оверлея: замок — только для шифрования/расшифровки,
// открытая папка — для открытия/загрузки хранилища
function _setVaultOverlayIcon(mode) {
    const overlay = document.getElementById('vault-lock-overlay');
    if (!overlay) return;
    const lockIcon = overlay.querySelector('.vlo-icon-lock');
    const folderIcon = overlay.querySelector('.vlo-icon-folder');
    if (lockIcon) lockIcon.style.display = (mode === 'lock') ? '' : 'none';
    if (folderIcon) folderIcon.style.display = (mode === 'lock') ? 'none' : '';
}

let _openingHintTimer = null;

window.showVaultOpeningOverlay = () => {
    const overlay = document.getElementById('vault-lock-overlay');
    if (!overlay) return;
    _setVaultOverlayIcon('folder');
    document.getElementById('vault-lock-overlay-title').textContent = t('security.opening');
    document.getElementById('vault-lock-overlay-hint').textContent = t('security.openingHint');
    const fill = document.getElementById('vault-lock-overlay-fill');
    const label = document.getElementById('vault-lock-overlay-label');
    label.textContent = '';
    fill.style.width = '35%';
    fill.classList.add('indeterminate'); // длительность миграций БД неизвестна

    // Если открытие затянулось (>8с) — вероятно, macOS докачивает файлы
    // хранилища из iCloud. Поясняем, что это не зависание.
    clearTimeout(_openingHintTimer);
    _openingHintTimer = setTimeout(() => {
        if (overlay.classList.contains('show')) {
            document.getElementById('vault-lock-overlay-hint').textContent = t('security.openingLongHint');
        }
    }, 8000);

    overlay.classList.add('show');
};

window.hideVaultOverlay = () => {
    const overlay = document.getElementById('vault-lock-overlay');
    if (!overlay) return;
    clearTimeout(_openingHintTimer);
    overlay.classList.remove('show');
    const fill = document.getElementById('vault-lock-overlay-fill');
    fill.classList.remove('indeterminate');
    fill.style.width = '0%';
    document.getElementById('vault-lock-overlay-label').textContent = '';
};

// Ступенчатый прогресс загрузки доски (окно хранилища)
window.showVaultLoadingOverlay = () => {
    const overlay = document.getElementById('vault-lock-overlay');
    if (!overlay) return () => {};
    _setVaultOverlayIcon('folder');
    document.getElementById('vault-lock-overlay-title').textContent = t('security.loadingBoard');
    document.getElementById('vault-lock-overlay-hint').textContent = '';
    const fill = document.getElementById('vault-lock-overlay-fill');
    const label = document.getElementById('vault-lock-overlay-label');
    fill.classList.remove('indeterminate');
    fill.style.width = '10%';
    label.textContent = t('security.loadStageSettings');
    overlay.classList.add('show');

    // Возвращаем функцию установки этапа: setStage(pct, i18nKey)
    return (pct, stageKey) => {
        fill.style.width = pct + '%';
        label.textContent = stageKey ? t(stageKey) : '';
    };
};

// ============================================================
//  🔐 Ввод пароля защищённого хранилища
// ============================================================
let _vaultUnlockResolve = null;

function _vaultUnlockSetError(msg) {
    const errEl = document.getElementById('vault-unlock-error');
    const input = document.getElementById('vault-unlock-input');
    const lockIcon = document.getElementById('vault-unlock-lock-icon');
    if (msg) {
        errEl.textContent = msg;
        errEl.classList.add('visible');
        input.classList.remove('is-error');
        void input.offsetWidth;
        input.classList.add('is-error');
        lockIcon.classList.remove('is-denied');
        void lockIcon.offsetWidth;
        lockIcon.classList.add('is-denied');
        setTimeout(() => lockIcon.classList.remove('is-denied'), 450);
    } else {
        errEl.textContent = '';
        errEl.classList.remove('visible');
        input.classList.remove('is-error');
    }
}

function _vaultUnlockSetLoading(loading) {
    const btn = document.getElementById('vault-unlock-submit');
    const label = btn.querySelector('.vu-btn-label');
    btn.classList.toggle('is-loading', loading);
    label.textContent = loading ? t('security.unlocking') : t('security.unlockBtn');
    document.getElementById('vault-unlock-input').disabled = loading;
}

function _closeVaultUnlockModal(result) {
    const modal = document.getElementById('vault-unlock-modal');
    modal.classList.remove('show');
    _vaultUnlockSetLoading(false);
    _vaultUnlockSetError(null);
    document.getElementById('vault-unlock-lock-icon').classList.remove('is-open');
    const input = document.getElementById('vault-unlock-input');
    input.value = '';
    input.disabled = false;
    if (_vaultUnlockResolve) {
        const r = _vaultUnlockResolve;
        _vaultUnlockResolve = null;
        r(result);
    }
}

// Открывает красивый модал ввода пароля. Возвращает Promise<boolean>:
// true — пароль верный и файлы расшифрованы, false — отмена.
window.requestVaultUnlock = (path, name) => {
    return new Promise((resolve) => {
        // Если модал уже открыт — отменяем предыдущий запрос
        if (_vaultUnlockResolve) _closeVaultUnlockModal(false);
        _vaultUnlockResolve = resolve;

        const modal = document.getElementById('vault-unlock-modal');
        const input = document.getElementById('vault-unlock-input');
        const desc = document.getElementById('vault-unlock-desc');

        modal.dataset.vaultPath = path;
        desc.textContent = t('security.unlockDesc', name || path.split(/[/\\]/).pop());
        input.placeholder = t('security.passwordPlaceholder');
        input.type = 'password';
        _syncEyeIcon(document.getElementById('vault-unlock-eye'), false);
        _vaultUnlockSetError(null);
        _vaultUnlockSetLoading(false);
        document.getElementById('vault-unlock-lock-icon').classList.remove('is-open');

        // 🫆 Touch ID: показываем кнопку, если включён для этого хранилища
        const tidBtn = document.getElementById('vault-touchid-btn');
        if (tidBtn) {
            tidBtn.style.display = 'none';
            tidBtn.classList.remove('is-busy');
            fetch(`${API_BASE}/system/vault/security/status?path=${encodeURIComponent(path)}&t=${Date.now()}`)
                .then(r => r.ok ? r.json() : null)
                .then(s => {
                    if (s && s.touchid_enabled === true && modal.classList.contains('show')) {
                        tidBtn.style.display = '';
                    }
                })
                .catch(() => {});
        }

        modal.classList.add('show');
        setTimeout(() => input.focus(), 60);
    });
};

async function _submitVaultUnlockBiometric() {
    const modal = document.getElementById('vault-unlock-modal');
    const tidBtn = document.getElementById('vault-touchid-btn');
    _vaultUnlockSetError(null);
    tidBtn.classList.add('is-busy');
    _vaultUnlockSetLoading(true);

    // Прогресс расшифровки — как при входе по паролю
    const progressBox = document.getElementById('vault-unlock-progress');
    const progressFill = document.getElementById('vault-unlock-progress-fill');
    const progressLabel = document.getElementById('vault-unlock-progress-label');
    let stopPolling = null;
    const progressDelay = setTimeout(() => {
        progressBox.classList.add('visible');
        stopPolling = startVaultProgressPolling('unlock', progressFill, progressLabel);
    }, 350);

    const cleanup = () => {
        clearTimeout(progressDelay);
        if (stopPolling) { stopPolling(); stopPolling = null; }
        progressBox.classList.remove('visible');
        progressFill.style.width = '0%';
        progressLabel.textContent = '';
        tidBtn.classList.remove('is-busy');
    };

    try {
        const res = await fetch(`${API_BASE}/system/vault/unlock-biometric`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: modal.dataset.vaultPath })
        });

        if (res.ok) {
            clearTimeout(progressDelay);
            if (stopPolling) { stopPolling(); stopPolling = null; }
            document.getElementById('vault-unlock-lock-icon').classList.add('is-open');
            setTimeout(() => {
                progressBox.classList.remove('visible');
                progressFill.style.width = '0%';
                progressLabel.textContent = '';
                tidBtn.classList.remove('is-busy');
                _closeVaultUnlockModal(true);
            }, 420);
            return;
        }

        cleanup();
        _vaultUnlockSetLoading(false);
        const err = await res.json().catch(() => ({}));
        const detail = err && err.detail;

        if (detail === 'KEY_STALE') {
            _vaultUnlockSetError(t('security.touchidStale'));
        } else if (detail === 'CANCELED') {
            // Пользователь просто закрыл системный диалог — тихо возвращаемся
            _vaultUnlockSetError(null);
        } else if (detail === 'USE_PASSWORD') {
            // Пользователь выбрал «Ввести пароль» — плавно приглашаем в поле:
            // мягкая пульсация-подсветка + фокус, никакой ошибки
            _vaultUnlockSetError(null);
            const input = document.getElementById('vault-unlock-input');
            input.classList.remove('is-attention');
            void input.offsetWidth;
            input.classList.add('is-attention');
            setTimeout(() => input.classList.remove('is-attention'), 1400);
            input.focus();
        } else if (res.status === 403) {
            // Отпечаток действительно не подтверждён
            _vaultUnlockSetError(t('security.touchidFailed'));
        } else {
            _vaultUnlockSetError(t('security.lockError'));
        }
    } catch (e) {
        console.error('Biometric unlock error:', e);
        cleanup();
        _vaultUnlockSetLoading(false);
        _vaultUnlockSetError(t('security.lockError'));
    }
}

async function _submitVaultUnlock() {
    const modal = document.getElementById('vault-unlock-modal');
    const input = document.getElementById('vault-unlock-input');
    const password = input.value;

    if (!password) {
        _vaultUnlockSetError(null);
        input.classList.remove('is-error');
        void input.offsetWidth;
        input.classList.add('is-error');
        input.focus();
        return;
    }

    _vaultUnlockSetLoading(true);
    _vaultUnlockSetError(null);

    // 🔐 Прогресс расшифровки: полоса появляется, как только началась работа с файлами
    // (проверка пароля по хэшу занимает доли секунды, расшифровка может быть долгой)
    const progressBox = document.getElementById('vault-unlock-progress');
    const progressFill = document.getElementById('vault-unlock-progress-fill');
    const progressLabel = document.getElementById('vault-unlock-progress-label');
    let stopPolling = null;
    const progressDelay = setTimeout(() => {
        progressBox.classList.add('visible');
        stopPolling = startVaultProgressPolling('unlock', progressFill, progressLabel);
    }, 350); // короткие операции не мигают полосой

    const hideProgress = () => {
        clearTimeout(progressDelay);
        if (stopPolling) { stopPolling(); stopPolling = null; }
        progressBox.classList.remove('visible');
        progressFill.style.width = '0%';
        progressLabel.textContent = '';
    };

    try {
        const res = await fetch(`${API_BASE}/system/vault/unlock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: modal.dataset.vaultPath, password })
        });

        if (res.ok) {
            clearTimeout(progressDelay);
            if (stopPolling) { stopPolling(); stopPolling = null; } // полоса доедет до 100%
            // Красивая анимация открытия замка перед закрытием модала
            document.getElementById('vault-unlock-lock-icon').classList.add('is-open');
            setTimeout(() => {
                progressBox.classList.remove('visible');
                progressFill.style.width = '0%';
                progressLabel.textContent = '';
                _closeVaultUnlockModal(true);
            }, 420);
            return;
        }

        hideProgress();
        _vaultUnlockSetLoading(false);
        if (res.status === 403) {
            _vaultUnlockSetError(t('security.wrongPassword'));
        } else {
            _vaultUnlockSetError(t('security.lockError'));
        }
        input.select();
        input.focus();
    } catch (e) {
        console.error('Unlock error:', e);
        hideProgress();
        _vaultUnlockSetLoading(false);
        _vaultUnlockSetError(t('security.lockError'));
    }
}

function _syncEyeIcon(btn, visible) {
    if (!btn) return;
    // Иконка отражает ТЕКУЩЕЕ состояние: открытый глаз = пароль видим,
    // перечёркнутый = скрыт (а не действие, которое произойдёт по клику)
    btn.querySelector('.eye-open').style.display = visible ? '' : 'none';
    btn.querySelector('.eye-closed').style.display = visible ? 'none' : '';
}

(function initVaultUnlockModal() {
    const modal = document.getElementById('vault-unlock-modal');
    if (!modal) return;
    const input = document.getElementById('vault-unlock-input');
    const eyeBtn = document.getElementById('vault-unlock-eye');

    document.getElementById('vault-unlock-submit').addEventListener('click', _submitVaultUnlock);
    document.getElementById('vault-unlock-cancel').addEventListener('click', () => _closeVaultUnlockModal(false));
    document.getElementById('vault-touchid-btn')?.addEventListener('click', _submitVaultUnlockBiometric);

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _submitVaultUnlock(); }
        if (e.key === 'Escape') { e.preventDefault(); _closeVaultUnlockModal(false); }
    });
    input.addEventListener('input', () => _vaultUnlockSetError(null));

    eyeBtn.addEventListener('click', () => {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        _syncEyeIcon(eyeBtn, visible);
        input.focus();
    });

    // Закрытие по клику на подложку — как отмена
    modal.addEventListener('click', (e) => {
        if (e.target === modal) _closeVaultUnlockModal(false);
    });
})();

// ============================================================
//  🔐 Настройки «Защита паролем» (активное хранилище)
// ============================================================
let _securityFormMode = null; // 'set' | 'change' | 'remove'

function _secFormError(msg, targetInput) {
    const errEl = document.getElementById('security-form-error');
    if (msg) {
        errEl.textContent = msg;
        errEl.classList.add('visible');
        if (targetInput) {
            targetInput.classList.remove('is-error');
            void targetInput.offsetWidth;
            targetInput.classList.add('is-error');
            targetInput.focus();
        }
    } else {
        errEl.textContent = '';
        errEl.classList.remove('visible');
        ['security-old-input', 'security-new-input', 'security-confirm-input'].forEach(id => {
            document.getElementById(id)?.classList.remove('is-error');
        });
    }
}

async function _renderSecurityStatus() {
    let status = { protected: false, global_attachments: false };
    try {
        const res = await fetch(`${API_BASE}/system/vault/security/status?t=${Date.now()}`);
        if (res.ok) status = await res.json();
    } catch (e) { console.error(e); }

    const isOn = status.protected === true;
    document.getElementById('sec-icon-locked').style.display = isOn ? '' : 'none';
    document.getElementById('sec-icon-unlocked').style.display = isOn ? 'none' : '';
    document.getElementById('security-status-icon').classList.toggle('is-on', isOn);
    document.getElementById('security-status-title').textContent = isOn ? t('security.statusOn') : t('security.statusOff');
    document.getElementById('security-status-desc').textContent = isOn ? t('security.statusOnDesc') : t('security.statusOffDesc');

    document.getElementById('security-set-btn').style.display = isOn ? 'none' : '';
    document.getElementById('security-change-btn').style.display = isOn ? '' : 'none';
    document.getElementById('security-remove-btn').style.display = isOn ? '' : 'none';
    document.getElementById('security-global-att-warning').style.display = (isOn && status.global_attachments) ? '' : 'none';

    // 🫆 Touch ID: карточка видна только на macOS с настроенной биометрией и при установленном пароле
    const tidCard = document.getElementById('security-touchid-card');
    if (tidCard) {
        tidCard.style.display = (isOn && status.touchid_available === true) ? '' : 'none';
        document.getElementById('security-touchid-switch')?.classList.toggle('on', status.touchid_enabled === true);
    }
    return status;
}

function _showSecurityForm(mode) {
    _securityFormMode = mode;
    document.getElementById('security-status-view').style.display = 'none';
    document.getElementById('security-form-view').style.display = '';

    const oldField = document.getElementById('security-old-field');
    const newField = document.getElementById('security-new-field');
    const confirmField = document.getElementById('security-confirm-field');
    const forgetHint = document.getElementById('security-forget-hint');

    oldField.style.display = (mode === 'set') ? 'none' : '';
    newField.style.display = (mode === 'remove') ? 'none' : '';
    confirmField.style.display = (mode === 'remove') ? 'none' : '';
    forgetHint.style.display = (mode === 'remove') ? 'none' : '';

    const oldInput = document.getElementById('security-old-input');
    const newInput = document.getElementById('security-new-input');
    const confirmInput = document.getElementById('security-confirm-input');
    oldInput.value = ''; newInput.value = ''; confirmInput.value = '';
    oldInput.placeholder = t('security.oldPasswordPlaceholder');
    newInput.placeholder = t('security.newPasswordPlaceholder');
    confirmInput.placeholder = t('security.confirmPlaceholder');
    _secFormError(null);

    setTimeout(() => (mode === 'set' ? newInput : oldInput).focus(), 60);
}

function _showSecurityStatusView() {
    _securityFormMode = null;
    document.getElementById('security-form-view').style.display = 'none';
    document.getElementById('security-status-view').style.display = '';
    _renderSecurityStatus();
}

async function _saveSecurityForm() {
    const oldInput = document.getElementById('security-old-input');
    const newInput = document.getElementById('security-new-input');
    const confirmInput = document.getElementById('security-confirm-input');
    const mode = _securityFormMode;

    if (mode === 'remove') {
        if (!oldInput.value) { _secFormError(t('security.wrongPassword'), oldInput); return; }
        try {
            const res = await fetch(`${API_BASE}/system/vault/security/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: oldInput.value })
            });
            if (res.ok) {
                window.showToast(t('security.modalTitle'), t('security.removeSuccess'));
                _showSecurityStatusView();
            } else if (res.status === 403) {
                _secFormError(t('security.wrongPassword'), oldInput);
            } else if (res.status === 409) {
                _secFormError(t('security.leftoverLocked'), null);
            } else {
                _secFormError(t('security.lockError'), oldInput);
            }
        } catch (e) { console.error(e); _secFormError(t('security.lockError'), oldInput); }
        return;
    }

    // set / change
    if (newInput.value.length < 4) { _secFormError(t('security.tooShort'), newInput); return; }
    if (newInput.value !== confirmInput.value) { _secFormError(t('security.mismatch'), confirmInput); return; }
    if (mode === 'change' && !oldInput.value) { _secFormError(t('security.wrongPassword'), oldInput); return; }

    try {
        const res = await fetch(`${API_BASE}/system/vault/security/set`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password: newInput.value,
                old_password: mode === 'change' ? oldInput.value : null
            })
        });
        if (res.ok) {
            window.showToast(t('security.modalTitle'), mode === 'change' ? t('security.changeSuccess') : t('security.setSuccess'));
            _showSecurityStatusView();
        } else if (res.status === 403) {
            _secFormError(t('security.wrongPassword'), oldInput);
        } else if (res.status === 409) {
            _secFormError(t('security.leftoverLocked'), null);
        } else {
            _secFormError(t('security.lockError'), newInput);
        }
    } catch (e) { console.error(e); _secFormError(t('security.lockError'), newInput); }
}

window.openSecuritySettings = async () => {
    _showSecurityStatusView();
    await _renderSecurityStatus();
    document.getElementById('security-settings-modal').classList.add('show');
};

(function initSecuritySettingsModal() {
    const modal = document.getElementById('security-settings-modal');
    if (!modal) return;

    document.getElementById('security-set-btn').addEventListener('click', () => _showSecurityForm('set'));
    document.getElementById('security-change-btn').addEventListener('click', () => _showSecurityForm('change'));
    document.getElementById('security-remove-btn').addEventListener('click', () => _showSecurityForm('remove'));

    // 🫆 Переключатель Touch ID
    document.getElementById('security-touchid-row')?.addEventListener('click', async () => {
        const sw = document.getElementById('security-touchid-switch');
        const enable = !sw.classList.contains('on');
        try {
            const res = await fetch(`${API_BASE}/system/vault/security/touchid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: enable })
            });
            if (res.ok) {
                sw.classList.toggle('on', enable);
                window.showToast(t('security.modalTitle'), enable ? t('security.touchidOn') : t('security.touchidOff'));
            } else {
                window.showToast(t('alerts.error'), t('security.touchidFailed'), true);
            }
        } catch (e) {
            console.error(e);
            window.showToast(t('alerts.error'), t('security.touchidFailed'), true);
        }
    });
    document.getElementById('security-form-cancel').addEventListener('click', _showSecurityStatusView);
    document.getElementById('security-form-save').addEventListener('click', _saveSecurityForm);

    ['security-old-input', 'security-new-input', 'security-confirm-input'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); _saveSecurityForm(); }
            if (e.key === 'Escape') { e.preventDefault(); _showSecurityStatusView(); }
        });
        el.addEventListener('input', () => _secFormError(null));
    });
})();

async function fetchVaultHistory() {
    try {
        const res = await fetch(`${API_BASE}/system/vault/history?t=${Date.now()}`, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        if (res.ok) return await res.json();
    } catch (e) { console.error(e); }
    return [];
}

function updateVaultHistoryScrollState() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    if (list.scrollHeight > list.clientHeight) {
        list.classList.add('is-scrollable');
    } else {
        list.classList.remove('is-scrollable');
    }
}

async function renderVaultHistory() {
    const list = document.getElementById('vault-history-list');
    if (!list) return;
    list.innerHTML = '';

    const history = await fetchVaultHistory();

    if (history.length === 0) {
        list.innerHTML = `
            <div style="text-align:center; padding: 24px; color: var(--text-secondary); font-size: 13px; opacity: 0.6;" data-i18n="vault.recentEmpty">
                ${t('vault.recentEmpty')}
            </div>`;
        return;
    }

    const folderIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    const revealIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    const missingIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    history.forEach(item => {
        const div = document.createElement('div');
        const isMissing = item.exists === false;
        div.className = `subtask-item vault-history-item${isMissing ? ' is-missing' : ''}`;
        div.dataset.path = item.path;

        let dateStr = '';
        if (item.last_opened) {
            dateStr = formatDateTime(item.last_opened);
        } else {
            dateStr = currentLang === 'ru' ? 'Ранее' : 'Earlier';
        }

        const missingTooltip = currentLang === 'ru' ? 'Хранилище не найдено. Нажмите, чтобы перепривязать' : 'Vault not found. Click to relink';
        const isProtected = item.protected === true;
        const lockBadge = isProtected
            ? `<span class="vault-protected-badge" title="${t('security.protectedTooltip')}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>`
            : '';

        div.innerHTML = `
            <div class="subtask-checkbox ${isMissing ? 'missing' : ''}" style="border:none; color: var(--brand-pine); opacity: 0.8; cursor: inherit;" ${isMissing ? `title="${missingTooltip}"` : ''}>
                ${isMissing ? missingIcon : folderIcon}
            </div>
            <div class="vault-history-info">
                <div class="vault-history-name-row">
                    <div class="vault-history-name ${isMissing ? 'missing-text' : ''}" data-full-title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                    ${lockBadge}
                </div>
                <div class="vault-history-meta">
                    <div class="vault-history-path ${isMissing ? 'missing-text' : ''}" title="${escapeHtml(item.path)}">${escapeHtml(item.path)}</div>
                    <!-- Теперь блок даты есть в DOM всегда, поэтому он без проблем копируется в Drag&Drop клон -->
                    <div class="vault-history-date" data-timestamp="${item.last_opened || ''}">${dateStr}</div>
                </div>
            </div>
            <div class="subtask-actions">
                <button class="subtask-open-btn vault-hist-reveal" title="${currentLang === 'ru' ? 'Показать в папке' : 'Reveal in folder'}" style="${isMissing ? 'display: none;' : ''}">${revealIcon}</button>
                <button class="subtask-delete-btn vault-hist-del" title="${t('menu.delete')}">${trashIcon}</button>
            </div>
        `;

        div.querySelector('.vault-hist-reveal').addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                if (window.pywebview && window.pywebview.api && window.pywebview.api.reveal_local_path) {
                    await window.pywebview.api.reveal_local_path(item.path);
                } else {
                    await fetch(`${API_BASE}/system/reveal-folder`, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({path: item.path})
                    });
                }
            } catch (err) {
                console.error("Failed to reveal folder:", err);
            }
        });

        div.addEventListener('click', async (e) => {
            if (window._isAfterDrag) return;
            if (e.target.closest('.vault-hist-del')) return;
            if (e.target.closest('.vault-hist-reveal')) return;

            const currentlyMissing = div.querySelector('.subtask-checkbox').classList.contains('missing');

            if (currentlyMissing) {
                try {
                    let newPath = null;
                    if (window.pywebview && window.pywebview.api && window.pywebview.api.choose_directory) {
                        newPath = await window.pywebview.api.choose_directory();
                    }
                    if (!newPath) return;

                    const res = await fetch(`${API_BASE}/system/vault/history/relink`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ old_path: item.path, new_path: newPath })
                    });

                    if (res.ok) {
                        renderVaultHistory();
                    } else {
                        div.classList.remove('is-error');
                        void div.offsetWidth;
                        div.classList.add('is-error');
                        setTimeout(() => div.classList.remove('is-error'), 400);
                    }
                } catch (err) {
                    console.error(err);
                }
                return;
            }

            try {
                // 🔐 Защищённое хранилище: сначала красивый запрос пароля
                if (isProtected) {
                    const unlocked = await window.requestVaultUnlock(item.path, item.name);
                    if (!unlocked) return;
                }

                div.style.opacity = '0.5';
                div.style.pointerEvents = 'none';

                // Этап «Открытие хранилища...» — на время инициализации/миграций БД
                window.showVaultOpeningOverlay();

                let res = await fetch(`${API_BASE}/system/vault/switch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ new_path: item.path })
                });

                // 🔐 Страховка: бэкенд сообщил, что нужен пароль (например, флаг protected устарел)
                if (res.status === 423) {
                    window.hideVaultOverlay();
                    div.style.opacity = '1';
                    div.style.pointerEvents = 'auto';
                    const unlocked = await window.requestVaultUnlock(item.path, item.name);
                    if (!unlocked) return;
                    div.style.opacity = '0.5';
                    div.style.pointerEvents = 'none';
                    window.showVaultOpeningOverlay();
                    res = await fetch(`${API_BASE}/system/vault/switch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ new_path: item.path })
                    });
                }

                if (res.ok) {
                    const result = await res.json();

                updateVaultName(result.name);
                const settings = await fetchSettings().catch(() => ({}));
                state.activeWorkspaceId = settings.active_workspace_id || null;
                // Оверлей НЕ прячем: окно селектора сейчас заменится окном доски,
                // которое продолжит ту же картину этапом «Загрузка хранилища...»
                await transitionToApp();
            } else if (res.status === 400) {
                window.hideVaultOverlay();
                div.style.opacity = '1';
                div.style.pointerEvents = 'auto';
                div.classList.add('is-error');
                    setTimeout(() => {
                        div.classList.remove('is-error');
                        renderVaultHistory();
                    }, 400);
            } else {
                window.hideVaultOverlay();
                div.style.opacity = '1';
                div.style.pointerEvents = 'auto';
                if (window.showToast) window.showToast(t('alerts.error'), 'Не удалось открыть хранилище', true);
            }
            } catch (err) {
                console.error(err);
                window.hideVaultOverlay();
                div.style.opacity = '1';
                div.style.pointerEvents = 'auto';
            }
        });

        div.querySelector('.vault-hist-del').addEventListener('click', async (e) => {
            e.stopPropagation();

            const rect = div.getBoundingClientRect();

            const clone = div.cloneNode(true);
            clone.classList.add('vault-deleting-clone');
            clone.style.left = `${rect.left}px`;
            clone.style.top = `${rect.top}px`;
            clone.style.width = `${rect.width}px`;
            clone.style.height = `${rect.height}px`;
            document.body.appendChild(clone);

            const spacer = document.createElement('div');
            spacer.className = 'vault-history-spacer';
            spacer.style.height = `${rect.height}px`;

            div.replaceWith(spacer);

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    clone.classList.add('is-animating');
                    spacer.classList.add('is-shrinking');
                });
            });

            setTimeout(() => {
                if (clone.parentNode) clone.remove();
                if (spacer.parentNode) spacer.remove();

                updateVaultHistoryScrollState();

                if (list.querySelectorAll('.vault-history-item').length === 0) {
                    renderVaultHistory();
                }
            }, 450);

            try {
                await fetch(`${API_BASE}/system/vault/history/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: item.path })
                });
            } catch (err) {
                console.error("Ошибка удаления из истории:", err);
            }
        });

        list.appendChild(div);
    });

    requestAnimationFrame(updateVaultHistoryScrollState);
}

