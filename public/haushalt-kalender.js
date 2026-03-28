document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl = document.getElementById('calendar');
    const tooltip    = document.getElementById('eventTooltip');

    const fmt = new Intl.NumberFormat(window.GGC_LOCALE || 'de-DE', {
        style: 'currency', currency: window.GGC_CURRENCY || 'EUR'
    });

    // ── Gemeinsame Fixkosten ──────────────────────────────────
    async function loadFixkostenEvents() {
        try {
            const res = await fetch('/users/haushalt/fixkosten');
            if (!res.ok) return [];
            const fixkosten = await res.json();
            const today  = new Date();
            const events = [];

            for (let m = 0; m < 12; m++) {
                const baseDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
                for (const fix of fixkosten) {
                    // Nur monatliche Fixkosten im Kalender anzeigen
                    if (fix.rhythmus && fix.rhythmus !== 'monatlich') {
                        // Für nicht-monatliche: nur einmalig zum richtigen Zeitpunkt zeigen
                        if (m !== 0) continue;
                    }
                    const tag = parseInt(fix.datum_tag) || 1;
                    const maxDay    = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
                    const actualDay = Math.min(tag, maxDay);
                    const dateStr   = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
                    events.push({
                        id:              `hausfix-${fix.id}-${dateStr}`,
                        title:           `${fix.name} (${fmt.format(fix.betrag)})`,
                        start:           dateStr,
                        allDay:          true,
                        backgroundColor: '#10b981',
                        borderColor:     '#10b981',
                        editable:        false,
                        extendedProps:   { source: 'hausfix', betrag: fix.betrag, rhythmus: fix.rhythmus }
                    });
                }
            }
            return events;
        } catch (err) {
            console.error('Haushalt-Fixkosten-Events Fehler:', err);
            return [];
        }
    }

    // ── Haushalt-Sparziele ───────────────────────────────────
    async function loadSparzieleEvents() {
        try {
            const res = await fetch('/users/haushalt/sparziele');
            if (!res.ok) return [];
            const sparziele = await res.json();
            return sparziele
                .filter(sz => sz.faellig_datum && (sz.aktuell || 0) < sz.zielbetrag)
                .map(sz => ({
                    id:              `haussparziel-${sz.id}`,
                    title:           `Ziel: ${sz.name} (${fmt.format(sz.zielbetrag)})`,
                    start:           sz.faellig_datum,
                    allDay:          true,
                    backgroundColor: sz.farbe || '#f59e0b',
                    borderColor:     sz.farbe || '#f59e0b',
                    editable:        false,
                    extendedProps:   { source: 'sparziel', betrag: sz.zielbetrag, gespart: sz.aktuell || 0 }
                }));
        } catch (err) {
            console.error('Haushalt-Sparziele-Events Fehler:', err);
            return [];
        }
    }

    // ── Alle Events laden ────────────────────────────────────
    const [fixEvents, sparEvents] = await Promise.all([
        loadFixkostenEvents(),
        loadSparzieleEvents()
    ]);
    const allEvents = [...fixEvents, ...sparEvents];

    // ── Kalender aufbauen ────────────────────────────────────
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

        eventClick: function(info) {
            const src    = info.event.extendedProps?.source;
            const betrag = info.event.extendedProps?.betrag;
            if (src === 'sparziel') {
                const gespart = info.event.extendedProps?.gespart || 0;
                const pct     = betrag > 0 ? Math.round(gespart / betrag * 100) : 0;
                alert(`${info.event.title}\n${pct}% erreicht (${fmt.format(gespart)} von ${fmt.format(betrag)})`);
            }
        },

        eventMouseEnter: function(info) {
            const e   = info.event;
            const src = e.extendedProps?.source;
            let label = e.title;
            if (src === 'hausfix')  label = `Haushalt-Fixkosten: ${e.title}`;
            if (src === 'persfx')   label = `Persönliche Fixkosten: ${e.title}`;
            if (src === 'sparziel') {
                const gespart = e.extendedProps?.gespart || 0;
                const betrag  = e.extendedProps?.betrag  || 0;
                const pct     = betrag > 0 ? Math.round(gespart / betrag * 100) : 0;
                label = `Sparziel-Fälligkeit: ${e.title} · ${pct}% erreicht`;
            }
            if (tooltip) {
                tooltip.textContent           = label;
                tooltip.style.display         = 'block';
                tooltip.style.backgroundColor = e.backgroundColor || '#10b981';
                tooltip.style.left            = `${info.jsEvent.pageX + 12}px`;
                tooltip.style.top             = `${info.jsEvent.pageY + 12}px`;
            }
        },

        eventMouseLeave: () => { if (tooltip) tooltip.style.display = 'none'; },

        eventContent: function(arg) {
            const e  = arg.event;
            const el = document.createElement('div');
            el.className = 'fc-daygrid-event fc-daygrid-dot-event';
            const dot         = document.createElement('div');
            dot.className     = 'fc-daygrid-event-dot';
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
