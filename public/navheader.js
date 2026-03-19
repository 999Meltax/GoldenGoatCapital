document.addEventListener('DOMContentLoaded', () => {
    const currentPath = window.location.pathname;

    // ── Plan-Badge laden ──────────────────────────────────────────
    if (currentPath.startsWith('/users/')) {
        fetch('/users/me/plan')
            .then(r => r.json())
            .then(({ plan }) => {
                const badge = document.getElementById('sidebarPlanBadge');
                if (!badge) return;
                if (plan === 'pro') {
                    badge.textContent = 'Pro';
                    badge.className = 'sidebar-plan-badge pro';
                } else {
                    badge.textContent = 'Free';
                    badge.className = 'sidebar-plan-badge free';
                }
                badge.style.display = 'inline-block';
            })
            .catch(() => {});
    }

    // ── Modus-Erkennung ───────────────────────────────────────────
    // Automatisch Haushalt-Modus aktivieren wenn auf Haushalt-Seite
    const isHaushaltPage = currentPath.startsWith('/users/haushalt');
    if (isHaushaltPage) {
        localStorage.setItem('ggc_mode', 'haushalt');
    }

    const savedMode = localStorage.getItem('ggc_mode') || 'privat';
    applyMode(savedMode, false);

    // ── Aktiven Link markieren ────────────────────────────────────
    document.querySelectorAll('.sidebar-link').forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        if (currentPath === href) {
            link.classList.add('active');
        } else if (href !== '/users/overview' && href !== '/users/haushalt' && currentPath.startsWith(href)) {
            // Only active if next char is '/' (subpath) or end of string
            const nextChar = currentPath[href.length];
            if (!nextChar || nextChar === '/') link.classList.add('active');
        }
    });

    // ── Sektionen-Mapping ─────────────────────────────────────────
    const sectionMap = {
        finanzSection: ['/meine-finanzen', '/ausgabentracker', '/import', '/budget', '/schulden', '/fixkosten', '/steuern', '/regeln', '/activity'],
        verwaltungSection: ['/versicherungen', '/dokumente'],
    };

    Object.entries(sectionMap).forEach(([sectionId, paths]) => {
        const isActive = paths.some(p => currentPath.includes(p));
        if (isActive) {
            const section = document.getElementById(sectionId);
            if (section) {
                section.classList.add('open');
                const toggle = section.previousElementSibling;
                if (toggle) toggle.classList.add('open');
            }
        }
    });

    // Gespeicherte offene Sektionen wiederherstellen
    const saved = JSON.parse(localStorage.getItem('sidebar_open_sections') || '[]');
    saved.forEach(id => {
        const section = document.getElementById(id);
        if (section && !section.classList.contains('open')) {
            section.classList.add('open');
            const toggle = section.previousElementSibling;
            if (toggle) toggle.classList.add('open');
        }
    });
});

function applyMode(mode, navigate) {
    const privatNav   = document.getElementById('privatNav');
    const haushaltNav = document.getElementById('haushaltNav');
    const btnPrivat   = document.getElementById('modeBtnPrivat');
    const btnHaushalt = document.getElementById('modeBtnHaushalt');
    const sidebar     = document.getElementById('sidebar');

    if (mode === 'haushalt') {
        if (privatNav)   privatNav.style.display   = 'none';
        if (haushaltNav) haushaltNav.style.display  = '';
        if (btnPrivat)   btnPrivat.classList.remove('active');
        if (btnHaushalt) btnHaushalt.classList.add('active');
        if (sidebar)     sidebar.classList.add('sidebar-haushalt');
    } else {
        if (privatNav)   privatNav.style.display   = '';
        if (haushaltNav) haushaltNav.style.display  = 'none';
        if (btnPrivat)   btnPrivat.classList.add('active');
        if (btnHaushalt) btnHaushalt.classList.remove('active');
        if (sidebar)     sidebar.classList.remove('sidebar-haushalt');
    }

    localStorage.setItem('ggc_mode', mode);

    if (navigate) {
        if (mode === 'haushalt') {
            window.location.href = '/users/haushalt';
        } else {
            window.location.href = '/users/overview';
        }
    }
}

function setMode(mode) {
    const currentPath = window.location.pathname;
    const isHaushaltPage = currentPath.startsWith('/users/haushalt');
    const isPrivatPage   = !isHaushaltPage;

    // Nur navigieren wenn wirklich Moduswechsel nötig
    if (mode === 'haushalt' && isPrivatPage) {
        applyMode('haushalt', true);
    } else if (mode === 'privat' && isHaushaltPage) {
        applyMode('privat', true);
    } else {
        applyMode(mode, false);
    }
}

function toggleSidebarSection(sectionId, btn) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    const isOpen = section.classList.toggle('open');
    btn.classList.toggle('open', isOpen);

    const allSections = ['finanzSection', 'verwaltungSection'];
    const openSections = allSections.filter(id => {
        const el = document.getElementById(id);
        return el && el.classList.contains('open');
    });
    localStorage.setItem('sidebar_open_sections', JSON.stringify(openSections));
}
// ── Globale Suche ──────────────────────────────────────────────
let _ggcSearchTimer  = null;
let _ggcSearchActive = -1; // aktiv markierter Ergebnis-Index

// Strg+K öffnet, Escape schließt
document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openGgcSearch();
    }
    if (e.key === 'Escape') closeGgcSearch();
});

function openGgcSearch() {
    const overlay = document.getElementById('ggcSearchOverlay');
    if (!overlay) return;
    overlay.classList.add('active');
    _ggcSearchActive = -1;
    setTimeout(() => {
        const input = document.getElementById('ggcSearchInput');
        if (input) { input.focus(); input.select(); }
    }, 60);
}

function closeGgcSearch(e) {
    if (e && e.target !== document.getElementById('ggcSearchOverlay')) return;
    const overlay = document.getElementById('ggcSearchOverlay');
    if (overlay) overlay.classList.remove('active');
    if (!e) {
        // direkt geschlossen (Esc / Klick auf Schließen)
    }
}

function onGgcSearchInput(val) {
    clearTimeout(_ggcSearchTimer);
    _ggcSearchActive = -1;
    if (val.trim().length < 2) {
        renderGgcResults(null, val);
        return;
    }
    _ggcSearchTimer = setTimeout(() => runGgcSearch(val.trim()), 220);
}

async function runGgcSearch(q) {
    renderGgcResults('loading');
    try {
        const res = await fetch('/users/search?q=' + encodeURIComponent(q));
        const { results } = await res.json();
        renderGgcResults(results, q);
    } catch {
        renderGgcResults([], q);
    }
}

const GGC_TYPE_LABELS = {
    transaktion:  'Transaktionen',
    sparziel:     'Sparziele',
    dokument:     'Dokumente',
    versicherung: 'Versicherungen',
    notiz:        'Notizen',
    schuld:       'Schulden',
    todo:         'Todos',
};

function renderGgcResults(results, q) {
    const el = document.getElementById('ggcSearchResults');
    if (!el) return;

    if (results === 'loading') {
        el.innerHTML = '<div class="ggc-search-hint"><i class="ri-loader-4-line" style="animation:ggcSpin 0.8s linear infinite;display:inline-block;"></i> Suche läuft…</div>';
        return;
    }

    if (results === null || (q && q.length < 2)) {
        el.innerHTML = '<div class="ggc-search-hint"><i class="ri-command-line"></i> Strg+K zum Öffnen · Pfeiltasten zum Navigieren · Enter zum Öffnen</div>';
        return;
    }

    if (results.length === 0) {
        el.innerHTML = '<div class="ggc-search-hint"><i class="ri-search-line"></i> Keine Ergebnisse für <b>"' + escGgc(q) + '"</b></div>';
        return;
    }

    // Gruppiere nach type
    const groups = {};
    results.forEach((r, i) => {
        if (!groups[r.type]) groups[r.type] = [];
        groups[r.type].push({ ...r, _idx: i });
    });

    let html = '';
    Object.entries(groups).forEach(([type, items]) => {
        html += `<div class="ggc-search-group-label">${GGC_TYPE_LABELS[type] || type}</div>`;
        items.forEach(item => {
            const qLower = q.toLowerCase();
            const titleHl = highlightGgc(item.title || '', qLower);
            const subHl   = highlightGgc(item.sub   || '', qLower);
            html += `<div class="ggc-search-result" data-idx="${item._idx}" data-url="${escGgc(item.url)}" onclick="goGgcResult('${escGgc(item.url)}')" onmouseenter="setGgcActive(${item._idx})">
                <div class="ggc-result-icon" style="color:${item.color};background:${item.color}18;">
                    <i class="${item.icon}"></i>
                </div>
                <div class="ggc-result-body">
                    <div class="ggc-result-title">${titleHl}</div>
                    ${subHl ? `<div class="ggc-result-sub">${subHl}</div>` : ''}
                </div>
                ${item.date ? `<div class="ggc-result-date">${item.date}</div>` : ''}
            </div>`;
        });
    });

    el.innerHTML = html;
    _ggcSearchActive = -1;
}

function setGgcActive(idx) {
    _ggcSearchActive = idx;
    document.querySelectorAll('.ggc-search-result').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.idx) === idx);
    });
}

function onGgcSearchKey(e) {
    const items = document.querySelectorAll('.ggc-search-result');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = Math.min(_ggcSearchActive + 1, items.length - 1);
        setGgcActive(parseInt(items[next]?.dataset.idx ?? next));
        items[next]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = Math.max(_ggcSearchActive - 1, 0);
        setGgcActive(parseInt(items[prev]?.dataset.idx ?? prev));
        items[prev]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
        const active = document.querySelector('.ggc-search-result.active');
        if (active) goGgcResult(active.dataset.url);
    }
}

function goGgcResult(url) {
    const overlay = document.getElementById('ggcSearchOverlay');
    if (overlay) overlay.classList.remove('active');
    window.location.href = url;
}

function escGgc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function highlightGgc(text, q) {
    if (!q) return escGgc(text);
    const escaped = escGgc(text);
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp('(' + escapedQ + ')', 'gi'), '<mark class="ggc-hl">$1</mark>');
}

// Toast-Benachrichtigung (ersetzt alert() für Feedback-Meldungen)
function ggcToast(msg, isError = false) {
    let el = document.getElementById('ggcToastEl');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ggcToastEl';
        el.style.cssText = [
            'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
            'padding:10px 20px', 'border-radius:10px', 'font-size:0.88rem',
            'font-family:\'Plus Jakarta Sans\',sans-serif', 'font-weight:600',
            'z-index:9999', 'pointer-events:none', 'transition:opacity 0.3s',
            'max-width:90vw', 'text-align:center', 'box-shadow:0 4px 20px rgba(0,0,0,0.25)'
        ].join(';');
        document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.background = isError ? '#ef4444' : '#22c55e';
    el.style.color = '#fff';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// Bestätigungs-Dialog (ersetzt confirm())
function ggcConfirm(msg, onConfirm, opts = {}) {
    let overlay = document.getElementById('ggcConfirmOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'ggcConfirmOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
        overlay.innerHTML = `
            <div style="background:var(--surface,#1a1a2e);border:1px solid var(--border,#2a2a3a);border-radius:16px;padding:28px;width:min(400px,90vw);font-family:'Plus Jakarta Sans',sans-serif;">
                <p id="ggcConfirmMsg" style="margin:0 0 22px;color:var(--text-1,#fff);font-size:0.95rem;line-height:1.5;"></p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button id="ggcConfirmCancel" style="padding:9px 18px;border-radius:9px;background:var(--surface-2,#252538);border:1px solid var(--border,#2a2a3a);color:var(--text-2,#aaa);font-size:0.85rem;cursor:pointer;font-family:inherit;">Abbrechen</button>
                    <button id="ggcConfirmOk" style="padding:9px 18px;border-radius:9px;background:#ef4444;border:none;color:#fff;font-size:0.85rem;cursor:pointer;font-weight:600;font-family:inherit;">Löschen</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }
    document.getElementById('ggcConfirmMsg').textContent = msg;
    const okBtn = document.getElementById('ggcConfirmOk');
    okBtn.textContent = opts.confirmLabel || 'Löschen';
    okBtn.style.background = opts.danger === false ? 'var(--accent,#6358e6)' : '#ef4444';
    overlay.style.display = 'flex';
    const close = () => { overlay.style.display = 'none'; };
    okBtn.onclick = () => { close(); onConfirm(); };
    document.getElementById('ggcConfirmCancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

// ── Undo-Toast ─────────────────────────────────────────────────
// showUndoToast(msg, onUndo, timeout?)
// Rufe NACH dem Löschen auf. Zeigt einen Toast mit "Rückgängig".
// Wenn der User klickt, wird onUndo() aufgerufen (z.B. Item wiederherstellen).
let _undoTimer   = null;
let _undoAnim    = null;

function showUndoToast(msg, onUndo, timeout = 5000) {
    clearTimeout(_undoTimer);
    cancelAnimationFrame(_undoAnim);

    let el = document.getElementById('ggcUndoToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'ggcUndoToast';
        el.style.cssText = [
            'position:fixed', 'bottom:28px', 'left:50%', 'transform:translateX(-50%) translateY(80px)',
            'background:var(--surface,#1a1a2e)', 'border:1px solid var(--border,#2a2a3a)',
            'border-radius:12px', 'padding:12px 16px',
            'display:flex', 'align-items:center', 'gap:14px',
            'font-family:\'Plus Jakarta Sans\',sans-serif', 'font-size:0.88rem',
            'z-index:9998', 'box-shadow:0 8px 32px rgba(0,0,0,0.4)',
            'min-width:280px', 'max-width:90vw',
            'transition:transform 0.28s cubic-bezier(.34,1.56,.64,1), opacity 0.25s'
        ].join(';');
        el.innerHTML = `
            <i class="ri-delete-bin-line" style="color:#ef4444;font-size:1rem;flex-shrink:0;"></i>
            <span id="ggcUndoMsg" style="flex:1;color:var(--text-1,#fff);"></span>
            <button id="ggcUndoBtn" style="
                background:rgba(99,88,230,0.18);border:1px solid rgba(99,88,230,0.4);
                color:var(--accent,#6358e6);padding:5px 13px;border-radius:8px;
                cursor:pointer;font-size:0.82rem;font-weight:700;font-family:inherit;
                flex-shrink:0;white-space:nowrap;">
                Rückgängig
            </button>
            <div id="ggcUndoBar" style="
                position:absolute;bottom:0;left:0;height:3px;border-radius:0 0 12px 12px;
                background:var(--accent,#6358e6);width:100%;transform-origin:left;"></div>`;
        document.body.appendChild(el);
    }

    document.getElementById('ggcUndoMsg').textContent = msg;

    // Undo-Button Listener (einmalig, neu setzen)
    const btn = document.getElementById('ggcUndoBtn');
    btn.onclick = () => {
        clearTimeout(_undoTimer);
        cancelAnimationFrame(_undoAnim);
        hide();
        if (onUndo) onUndo();
    };

    // Einblenden
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';

    // Progress-Bar-Animation
    const bar   = document.getElementById('ggcUndoBar');
    const start = performance.now();
    function animBar(now) {
        const elapsed = now - start;
        const pct = Math.max(0, 1 - elapsed / timeout);
        bar.style.transform = `scaleX(${pct})`;
        if (pct > 0) _undoAnim = requestAnimationFrame(animBar);
    }
    _undoAnim = requestAnimationFrame(animBar);

    // Auto-hide
    _undoTimer = setTimeout(hide, timeout);

    function hide() {
        el.style.transform = 'translateX(-50%) translateY(80px)';
        el.style.opacity   = '0';
    }
}