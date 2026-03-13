// ─────────────────────────────────────────────────────────────
//  upgrade-modal.js  –  Golden Goat Capital
//  Wiederverwendbares Upgrade-Modal für Tarif-Gating
//
//  Verwendung:
//    showUpgradeModal('Unbegrenzte Konten', 'Im Free-Tarif sind maximal 3 Konten erlaubt.');
//    oder automatisch bei fetch-Responses mit limitReached: true:
//    const data = await checkPlanLimit(res);
//    if (!data) return; // war limitReached, Modal wurde gezeigt
// ─────────────────────────────────────────────────────────────

(function () {
    // Modal einmalig ins DOM einfügen
    function ensureModal() {
        if (document.getElementById('upgradePlanModal')) return;

        const el = document.createElement('div');
        el.id = 'upgradePlanModal';
        el.style.cssText = 'display:none;position:fixed;inset:0;z-index:9998;';
        el.innerHTML = `
            <div style="position:absolute;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);"
                 onclick="hideUpgradeModal()"></div>
            <div style="
                position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
                background:var(--surface,#1a1d27);
                border:1px solid var(--border,#2a2d3a);
                border-radius:1.25rem;
                padding:2rem;
                max-width:420px;
                width:calc(100% - 2rem);
                text-align:center;
                box-shadow:0 24px 64px rgba(0,0,0,0.5);
            ">
                <div style="
                    width:64px;height:64px;border-radius:1rem;
                    background:rgba(108,99,255,0.15);
                    display:flex;align-items:center;justify-content:center;
                    font-size:1.75rem;margin:0 auto 1rem;
                ">🔒</div>
                <h3 id="upgradeModalTitle" style="font-size:1.2rem;font-weight:800;margin:0 0 0.5rem;color:var(--text,#e2e8f0);"></h3>
                <p id="upgradeModalText" style="font-size:0.875rem;color:var(--text-muted,#8892a4);line-height:1.6;margin:0 0 1.5rem;"></p>
                <div style="display:flex;gap:0.75rem;">
                    <button onclick="hideUpgradeModal()" style="
                        flex:1;padding:0.75rem;border-radius:0.625rem;
                        background:transparent;color:var(--text-muted,#8892a4);
                        border:1px solid var(--border,#2a2d3a);
                        font-family:inherit;font-size:0.875rem;cursor:pointer;
                    ">Abbrechen</button>
                    <button onclick="window.location.href='/users/tarife'" style="
                        flex:1;padding:0.75rem;border-radius:0.625rem;
                        background:var(--accent,#6c63ff);color:#fff;border:none;
                        font-family:inherit;font-size:0.875rem;font-weight:700;cursor:pointer;
                        display:flex;align-items:center;justify-content:center;gap:0.4rem;
                    "><i class="ri-rocket-line"></i> Jetzt upgraden</button>
                </div>
            </div>
        `;
        document.body.appendChild(el);
    }

    window.showUpgradeModal = function (title, text) {
        ensureModal();
        document.getElementById('upgradeModalTitle').textContent = title || 'Pro-Feature';
        document.getElementById('upgradeModalText').textContent  = text  || 'Dieses Feature ist ab dem Pro-Tarif verfügbar.';
        document.getElementById('upgradePlanModal').style.display = 'block';
    };

    window.hideUpgradeModal = function () {
        const m = document.getElementById('upgradePlanModal');
        if (m) m.style.display = 'none';
    };

    // Hilfsfunktion: fetch-Response auf limitReached prüfen
    // Gibt geparste Daten zurück oder null wenn Modal gezeigt wurde
    window.checkPlanLimit = async function (response) {
        if (response.status === 403) {
            try {
                const data = await response.json();
                if (data.limitReached) {
                    showUpgradeModal('Free-Limit erreicht', data.message || 'Dieses Feature ist im Free-Tarif nicht verfügbar.');
                    return null;
                }
            } catch {}
        }
        return response;
    };

    // Tastatur: Escape schließt Modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideUpgradeModal();
    });
})();