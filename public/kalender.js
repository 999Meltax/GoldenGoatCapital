document.addEventListener('DOMContentLoaded', async () => {
    const calendarEl          = document.getElementById('calendar');
    const eventForm           = document.getElementById('eventForm');
    const eventIdInput        = document.getElementById('eventId');
    const eventDateInput      = document.getElementById('eventDate');
    const eventStartTimeInput = document.getElementById('eventStartTime');
    const eventEndTimeInput   = document.getElementById('eventEndTime');
    const eventTextInput      = document.getElementById('eventText');
    const eventColorSelect    = document.getElementById('eventColor');
    const deleteButton        = document.getElementById('deleteEvent');
    const statusMessage       = document.getElementById('statusMessage');
    const tooltip             = document.getElementById('eventTooltip');

    // ── Outlook-Status prüfen ──────────────────────────────────
    let outlookConnected = false;

    async function checkOutlookStatus() {
        const loadingEl      = document.getElementById('outlookLoading');
        const connectedEl    = document.getElementById('outlookConnected');
        const disconnectedEl = document.getElementById('outlookDisconnected');
        const proGateEl      = document.getElementById('outlookProGate');
        const bannerEl       = document.getElementById('outlookBanner');

        // URL-Parameter nach OAuth-Redirect bereinigen
        const params = new URLSearchParams(window.location.search);
        if (params.has('outlook')) {
            window.history.replaceState({}, '', '/users/kalender');
        }

        try {
            // Plan prüfen
            const planRes = await fetch('/users/me/plan');
            const { plan } = await planRes.json();

            if (plan === 'free') {
                // Free-Nutzer: Pro-Gate anzeigen, alles andere ausblenden
                if (loadingEl)      loadingEl.style.display      = 'none';
                if (connectedEl)    connectedEl.style.display     = 'none';
                if (disconnectedEl) disconnectedEl.style.display  = 'none';
                if (proGateEl)      proGateEl.style.display       = '';
                outlookConnected = false;
                return;
            }

            // Pro-Nutzer: echten Status laden
            const res = await fetch('/users/outlook/status');
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
    }

    // Outlook trennen
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
        const own = await loadOwnEvents();
        const fixkostenEvts = await loadFixkostenEvents();
        if (!outlookConnected) return [...own, ...fixkostenEvts];
        const outlook = await loadOutlookEvents();
        return [...own, ...outlook, ...fixkostenEvts];
    }

    async function loadFixkostenEvents() {
        try {
            const res = await fetch('/users/fixkosten');
            if (!res.ok) return [];
            const fixkosten = await res.json();

            const today = new Date();
            const events = [];

            // Für die nächsten 12 Monate Fälligkeitstermine generieren
            for (let m = 0; m < 12; m++) {
                const baseDate = new Date(today.getFullYear(), today.getMonth() + m, 1);
                for (const fix of fixkosten) {
                    if (fix.haeufigkeit !== 'monatlich') continue;
                    const tag = parseInt(fix.datum_tag);
                    if (!tag || tag < 1 || tag > 31) continue;

                    // Sicherstellen dass der Tag im Monat existiert
                    const maxDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
                    const actualDay = Math.min(tag, maxDay);
                    const dateStr = `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

                    events.push({
                        id:              `fixkost-${fix.id}-${dateStr}`,
                        title:           `💳 ${fix.name} (${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(fix.betrag)})`,
                        start:           dateStr,
                        allDay:          true,
                        backgroundColor: '#7c3aed',
                        borderColor:     '#7c3aed',
                        editable:        false,
                        extendedProps:   { source: 'fixkost', betrag: fix.betrag, kategorie: fix.kategorie }
                    });
                }
            }
            return events;
        } catch (err) {
            console.error('Fixkosten-Events Fehler:', err);
            return [];
        }
    }

    async function loadOwnEvents() {
        try {
            const res = await fetch('/users/events');
            if (!res.ok) return [];
            const events = await res.json();
            return events.map(e => ({
                id:              e.id,
                title:           e.text,
                start:           e.start,
                end:             e.end || null,
                backgroundColor: e.color,
                borderColor:     e.color,
                allDay:          !e.start.includes('T'),
                extendedProps:   { source: 'own' }
            }));
        } catch (err) {
            console.error('Eigene Events Fehler:', err);
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
        } catch (err) {
            console.error('Outlook Events Fehler:', err);
            return [];
        }
    }

    // ── Kalender aufbauen ─────────────────────────────────────

    await checkOutlookStatus();
    const allEvents = await loadAllEvents();

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        initialDate: new Date(),
        locale:      'de',
        headerToolbar: {
            left:   'prev,next today',
            center: 'title',
            right:  'dayGridMonth,timeGridWeek,timeGridDay'
        },
        editable:   true,
        firstDay:   1,
        allDaySlot: false,
        events:     allEvents,

        eventTimeFormat: {
            hour: '2-digit', minute: '2-digit', hour12: false
        },

        eventClick: function(info) {
            if (info.event.extendedProps?.source === 'outlook') {
                showStatus(`📅 ${info.event.title}`, false);
                return;
            }
            if (info.event.extendedProps?.source === 'fixkost') {
                showStatus(`💳 Fixkosten-Termin: ${info.event.title.replace(/^💳 /, '')}`, false);
                return;
            }
            populateForm(info.event);
            deleteButton.style.display = 'block';
        },

        dateClick: function(info) {
            resetForm();
            const d = info.date;
            eventDateInput.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        },

        eventMouseEnter: function(info) {
            const e   = info.event;
            const fmt = t => t?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }) || '';
            const isOutlook  = e.extendedProps?.source === 'outlook';
            const isFixkost  = e.extendedProps?.source === 'fixkost';
            let label = e.title;
            if (isOutlook)  label = `📅 ${e.title}`;
            if (isFixkost)  label = `${e.title} · Fälligkeitstermin`;
            tooltip.textContent           = `${label}${e.start && !isFixkost ? ' · ' + fmt(e.start) : ''}${e.end ? ' – ' + fmt(e.end) : ''}`;
            tooltip.style.display         = 'block';
            tooltip.style.backgroundColor = e.backgroundColor || '#3788d8';
            tooltip.style.left            = `${info.jsEvent.pageX + 12}px`;
            tooltip.style.top             = `${info.jsEvent.pageY + 12}px`;
        },

        eventMouseLeave: () => { tooltip.style.display = 'none'; },

        eventContent: function(arg) {
            const e          = arg.event;
            const isTimeGrid = arg.view.type === 'timeGridWeek' || arg.view.type === 'timeGridDay';
            const el         = document.createElement('div');

            if (isTimeGrid && e.end) {
                const mins    = (e.end - e.start) / 60000;
                el.className  = mins < 60 ? 'fc-event-short' : 'fc-event-long';
                if (mins < 60) {
                    el.innerText = `${arg.timeText} ${e.title}`;
                } else {
                    el.innerHTML = `<div class="fc-event-time">${arg.timeText}</div><div class="fc-event-title">${e.title}</div>`;
                }
            } else {
                el.className = 'fc-daygrid-event fc-daygrid-dot-event';
                const dot    = document.createElement('div');
                dot.className         = 'fc-daygrid-event-dot';
                dot.style.borderColor = e.backgroundColor;
                el.appendChild(dot);
                if (e.start && !e.allDay) {
                    const timeEl     = document.createElement('div');
                    timeEl.className = 'fc-event-time';
                    timeEl.innerText = e.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', hour12: false });
                    el.appendChild(timeEl);
                }
                const titleEl     = document.createElement('div');
                titleEl.className = 'fc-event-title';
                titleEl.innerText = e.title;
                el.appendChild(titleEl);
            }
            return { domNodes: [el] };
        }
    });

    calendar.render();

    // ── Speichern ─────────────────────────────────────────────

    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id        = eventIdInput.value;
        const date      = eventDateInput.value;
        const startTime = eventStartTimeInput.value;
        const endTime   = eventEndTimeInput.value;
        const text      = eventTextInput.value.trim();
        const color     = eventColorSelect.value;

        if (!date || !startTime || !text || !color) {
            showStatus('Bitte alle Pflichtfelder ausfüllen.', true);
            return;
        }

        const start   = `${date}T${startTime}:00`;
        const end     = endTime ? `${date}T${endTime}:00` : null;
        const payload = { start, end, text, color };

        try {
            let res;
            if (id) {
                res = await fetch(`/users/events/${id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/users/events/add', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Fehler');

            showStatus(id ? 'Gespeichert!' : 'Hinzugefügt!', false);

            if (id) {
                const existing = calendar.getEventById(id);
                if (existing) {
                    existing.setProp('title', text);
                    existing.setStart(start);
                    existing.setEnd(end);
                    existing.setProp('backgroundColor', color);
                    existing.setProp('borderColor', color);
                }
            } else {
                calendar.addEvent({
                    id:              data.id,
                    title:           text,
                    start, end,
                    backgroundColor: color,
                    borderColor:     color,
                    extendedProps:   { source: 'own' }
                });
            }
            resetForm();
        } catch (err) {
            showStatus('Fehler: ' + err.message, true);
        }
    });

    // ── Löschen ───────────────────────────────────────────────

    deleteButton.addEventListener('click', async () => {
        const id = eventIdInput.value;
        if (!id) return;
        try {
            const res = await fetch(`/users/events/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Fehler beim Löschen');
            calendar.getEventById(id)?.remove();
            showStatus('Event gelöscht.', false);
            resetForm();
        } catch (err) {
            showStatus('Fehler: ' + err.message, true);
        }
    });

    // ── Hilfsfunktionen ───────────────────────────────────────

    function populateForm(event) {
        const s = event.start;
        eventIdInput.value        = event.id;
        eventDateInput.value      = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
        eventStartTimeInput.value = `${String(s.getHours()).padStart(2,'0')}:${String(s.getMinutes()).padStart(2,'0')}`;
        if (event.end) {
            const en = event.end;
            eventEndTimeInput.value = `${String(en.getHours()).padStart(2,'0')}:${String(en.getMinutes()).padStart(2,'0')}`;
        } else {
            eventEndTimeInput.value = '';
        }
        eventTextInput.value   = event.title;
        eventColorSelect.value = event.backgroundColor;
    }

    function resetForm() {
        eventIdInput.value         = '';
        eventDateInput.value       = '';
        eventStartTimeInput.value  = '';
        eventEndTimeInput.value    = '';
        eventTextInput.value       = '';
        eventColorSelect.value     = '#3788d8';
        deleteButton.style.display = 'none';
        statusMessage.textContent  = '';
    }

    function showStatus(msg, isError) {
        statusMessage.textContent = msg;
        statusMessage.style.color = isError ? 'var(--red)' : 'var(--green)';
        setTimeout(() => { statusMessage.textContent = ''; }, 3000);
    }
});