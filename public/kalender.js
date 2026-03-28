document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('calendar');
    const tooltip    = document.getElementById('eventTooltip');

    const fmt = new Intl.NumberFormat(window.GGC_LOCALE||'de-DE', { style: 'currency', currency: (window.GGC_CURRENCY||'EUR') });

    // ── Outlook-Status prüfen ──────────────────────────────────
    let outlookConnected = false;

    async function checkOutlookStatus() {
        const loadingEl      = document.getElementById('outlookLoading');
        const connectedEl    = document.getElementById('outlookConnected');
        const disconnectedEl = document.getElementById('outlookDisconnected');
        const proGateEl      = document.getElementById('outlookProGate');
        const bannerEl       = document.getElementById('outlookBanner');
        const legendItem     = document.getElementById('outlookLegendItem');

        const params = new URLSearchParams(window.location.search);
        if (params.has('outlook')) {
            window.history.replaceState({}, '', '/users/kalender');
        }

        try {
            const planRes = await fetch('/users/me/plan');
            const { plan } = await planRes.json();

            if (plan === 'free') {
                if (loadingEl)      loadingEl.style.display      = 'none';
                if (connectedEl)    connectedEl.style.display     = 'none';
                if (disconnectedEl) disconnectedEl.style.display  = 'none';
                if (proGateEl)      proGateEl.style.display       = '';
                outlookConnected = false;
                return;
            }

            const res  = await fetch('/users/outlook/status');
            const data = await res.json();
            outlookConnected = data.connected;
        } catch {
            outlookConnected = false;
        }

        if (loadingEl)      loadingEl.style.display      = 'none';
        if (proGateEl)      proGateEl.style.display       = 'none';
        if (connectedEl)    connectedEl.style.display     = outlookConnected ? '' : 'none';
        if (disconnectedEl) disconnectedEl.style.display  = outlookConnected ? 'none' : '';
        if (bannerEl)       bannerEl.style.display        = outlookConnected ? 'flex' : 'none';
        if (legendItem)     legendItem.style.display      = outlookConnected ? 'flex' : 'none';
    }

    const disconnectBtn = document.getElementById('outlookDisconnectBtn');
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', async () => {
            if (!confirm('Outlook-Verbindung wirklich trennen?')) return;
            await fetch('/users/outlook/disconnect');
            window.location.reload();
        });
    }

    // ── Events laden ──────────────────────────────────────────

    async function loadAllEvents() {
        const [fixkostenEvts, schuldenEvts, sparzieleEvts] = await Promise.all([
            loadFixkostenEvents(),
            loadSchuldenEvents(),
            loadSparzieleEvents()
        ]);
        if (!outlookConnected) return [...fixkostenEvts, ...schuldenEvts, ...sparzieleEvts];
        const outlookEvts = await loadOutlookEvents();
        return [...fixkostenEvts, ...schuldenEvts, ...sparzieleEvts, ...outlookEvts];
    }

    async function loadFixkostenEvents() {
        try {
            const res = await fetch('/users/fixkosten/unified');
            if (!res.ok) return [];
            const fixkosten = await res.json();
            const today  = new Date();
            const yearAhead = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
            const events = [];

            function pushEvent(fix, dateStr) {
                events.push({
                    id:              `fixkost-${fix.id}-${dateStr}`,
                    title:           `${fix.name} (${fmt.format(fix.betrag)})`,
                    start:           dateStr,
                    allDay:          true,
                    backgroundColor: '#7c3aed',
                    borderColor:     '#7c3aed',
                    editable:        false,
                    extendedProps:   { source: 'fixkost', betrag: fix.betrag, kategorie: fix.kategorie }
                });
            }

            function monthlyEvents(fix, tag) {
                for (let m = 0; m < 12; m++) {
                    const baseDate  = new Date(today.getFullYear(), today.getMonth() + m, 1);
                    const maxDay    = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
                    const actualDay = Math.min(tag, maxDay);
                    const dateStr   = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
                    pushEvent(fix, dateStr);
                }
            }

            for (const fix of fixkosten) {
                if (fix.aktiv === 0 || fix.aktiv === false) continue;

                const haeuf   = fix.haeufigkeit || 'monatlich';
                const subtyp  = fix.subtyp || 'fixkosten';

                // For abo/recurring the real date is naechste_faelligkeit (datum_tag defaults to 1).
                // For fixkosten the user sets datum_tag explicitly.
                let tag;
                if (subtyp === 'fixkosten') {
                    tag = parseInt(fix.datum_tag);
                    if (!tag || tag < 1 || tag > 31) continue;
                } else {
                    if (!fix.naechste_faelligkeit) continue;
                    tag = new Date(fix.naechste_faelligkeit).getDate();
                }

                if (haeuf === 'monatlich') {
                    monthlyEvents(fix, tag);
                } else if (haeuf === 'woechentlich') {
                    const anchor = fix.naechste_faelligkeit
                        ? new Date(fix.naechste_faelligkeit)
                        : new Date(today.getFullYear(), today.getMonth(), tag);
                    let cur = new Date(anchor);
                    while (cur < today) cur.setDate(cur.getDate() + 7);
                    while (cur <= yearAhead) {
                        pushEvent(fix, cur.toISOString().substring(0, 10));
                        cur.setDate(cur.getDate() + 7);
                    }
                } else {
                    // viertelj, halbjaehrl, jaehrlich — show next occurrences within 12 months
                    const anchor = fix.naechste_faelligkeit
                        ? new Date(fix.naechste_faelligkeit)
                        : new Date(today.getFullYear(), today.getMonth(), tag);
                    let cur = new Date(anchor);
                    const step = (d) => {
                        if (haeuf === 'viertelj')    d.setMonth(d.getMonth() + 3);
                        else if (haeuf === 'halbjaehrl') d.setMonth(d.getMonth() + 6);
                        else                              d.setFullYear(d.getFullYear() + 1);
                    };
                    while (cur < today) step(cur);
                    while (cur <= yearAhead) {
                        pushEvent(fix, cur.toISOString().substring(0, 10));
                        step(cur);
                    }
                }
            }
            return events;
        } catch (err) {
            console.error('Fixkosten-Events Fehler:', err);
            return [];
        }
    }

    async function loadSchuldenEvents() {
        try {
            const res = await fetch('/users/schulden/data');
            if (!res.ok) return [];
            const schulden = await res.json();
            const today  = new Date();
            const events = [];

            for (let m = 0; m < 12; m++) {
                const baseDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
                for (const s of schulden) {
                    if (!s.monatsrate || !s.faelligkeitstag) continue;
                    const tag = parseInt(s.faelligkeitstag);
                    if (!tag || tag < 1 || tag > 31) continue;
                    const maxDay    = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
                    const actualDay = Math.min(tag, maxDay);
                    const dateStr   = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
                    events.push({
                        id:              `schuld-${s.id}-${dateStr}`,
                        title:           `${s.name} – Rate ${fmt.format(s.monatsrate)}`,
                        start:           dateStr,
                        allDay:          true,
                        backgroundColor: '#ef4444',
                        borderColor:     '#ef4444',
                        editable:        false,
                        extendedProps:   { source: 'schuld', betrag: s.monatsrate }
                    });
                }
            }
            return events;
        } catch (err) {
            console.error('Schulden-Events Fehler:', err);
            return [];
        }
    }

    async function loadSparzieleEvents() {
        try {
            const res = await fetch('/users/sparziele');
            if (!res.ok) return [];
            const sparziele = await res.json();
            return sparziele
                .filter(sz => sz.datum && sz.gespart < sz.zielbetrag)
                .map(sz => ({
                    id:              `sparziel-${sz.id}`,
                    title:           `Ziel: ${sz.name} (${fmt.format(sz.zielbetrag)})`,
                    start:           sz.datum,
                    allDay:          true,
                    backgroundColor: sz.farbe || '#22c55e',
                    borderColor:     sz.farbe || '#22c55e',
                    editable:        false,
                    extendedProps:   { source: 'sparziel', betrag: sz.zielbetrag, gespart: sz.gespart }
                }));
        } catch (err) {
            console.error('Sparziele-Events Fehler:', err);
            return [];
        }
    }

    async function loadOutlookEvents() {
        try {
            const res  = await fetch('/users/outlook/events');
            const data = await res.json();
            if (!data.connected) return [];
            return (data.events || []).map(e => ({
                id:              e.id,
                title:           e.title,
                start:           e.start,
                end:             e.end || null,
                backgroundColor: '#0078d4',
                borderColor:     '#0078d4',
                allDay:          !e.start?.includes('T'),
                editable:        false,
                extendedProps:   { source: 'outlook' }
            }));
        } catch {
            return [];
        }
    }

    // ── Kalender aufbauen ─────────────────────────────────────

    await checkOutlookStatus();
    const allEvents = await loadAllEvents();

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView:   'dayGridMonth',
        initialDate:   new Date(),
        locale:        'de',
        headerToolbar: {
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,listMonth'
        },
        editable:   false,
        firstDay:   1,
        allDaySlot: false,
        events:     allEvents,

        eventTimeFormat: {
            hour: '2-digit', minute: '2-digit', hour12: false
        },

        eventClick: function(info) {
            const src    = info.event.extendedProps?.source;
            const betrag = info.event.extendedProps?.betrag;
            const msg = betrag ? `${info.event.title} — ${fmt.format(betrag)}` : info.event.title;
            // Outlook events: nothing interactive
            if (src === 'sparziel') {
                const gespart   = info.event.extendedProps?.gespart || 0;
                const pct       = betrag > 0 ? Math.round(gespart / betrag * 100) : 0;
                alert(`${info.event.title}\n${pct}% erreicht (${fmt.format(gespart)} von ${fmt.format(betrag)})`);
            }
        },

        eventMouseEnter: function(info) {
            const e   = info.event;
            const src = e.extendedProps?.source;
            let label = e.title;
            if (src === 'fixkost') label = `Fixkosten: ${e.title}`;
            if (src === 'schuld')  label = `Schuldenrate: ${e.title}`;
            if (src === 'sparziel') {
                const gespart = e.extendedProps?.gespart || 0;
                const betrag  = e.extendedProps?.betrag  || 0;
                const pct     = betrag > 0 ? Math.round(gespart / betrag * 100) : 0;
                label = `Sparziel-Fälligkeiten: ${e.title} · ${pct}% erreicht`;
            }
            if (src === 'outlook') label = `Outlook: ${e.title}`;
            if (tooltip) {
                tooltip.textContent           = label;
                tooltip.style.display         = 'block';
                tooltip.style.backgroundColor = e.backgroundColor || '#3788d8';
                tooltip.style.left            = `${info.jsEvent.pageX + 12}px`;
                tooltip.style.top             = `${info.jsEvent.pageY + 12}px`;
            }
        },

        eventMouseLeave: () => { if (tooltip) tooltip.style.display = 'none'; },

        eventContent: function(arg) {
            const e  = arg.event;
            const el = document.createElement('div');
            el.className = 'fc-daygrid-event fc-daygrid-dot-event';
            const dot           = document.createElement('div');
            dot.className       = 'fc-daygrid-event-dot';
            dot.style.borderColor = e.backgroundColor;
            el.appendChild(dot);
            const titleEl     = document.createElement('div');
            titleEl.className = 'fc-event-title';
            titleEl.innerText = e.title;
            el.appendChild(titleEl);
            return { domNodes: [el] };
        }
    });

    calendar.render();
});
