// ══════════════════════════════════════════════════════════════
//  TODO.JS  –  Golden Goat Capital
// ══════════════════════════════════════════════════════════════

let allTodos    = [];
let activeFilter = 'alle';
let selPrio      = 'mittel';

const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short' });

// ── Init ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadTodos();
});

async function loadTodos() {
    try {
        const res = await fetch('/users/todos', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error();
        allTodos = await res.json();
    } catch {
        allTodos = [];
    }
    renderStats();
    renderTodos();
}

// ── Stats ─────────────────────────────────────────────────────

function renderStats() {
    const total   = allTodos.length;
    const open    = allTodos.filter(t => !t.completed).length;
    const done    = allTodos.filter(t =>  t.completed).length;
    const today   = todayStr();
    const overdue = allTodos.filter(t => !t.completed && t.due_date && t.due_date < today).length;

    setText('statTotal',   total);
    setText('statOpen',    open);
    setText('statDone',    done);
    setText('statOverdue', overdue);

    const overdueEl = document.getElementById('statOverdue');
    if (overdueEl) overdueEl.style.color = overdue > 0 ? '#ef4444' : '';
}

// ── Filter & Sort ─────────────────────────────────────────────

function setFilter(f, el) {
    activeFilter = f;
    document.querySelectorAll('.todo-filter-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderTodos();
}

function getFilteredSorted() {
    const search = (document.getElementById('todoSearch')?.value || '').toLowerCase();
    const sort   = document.getElementById('todoSort')?.value || 'prio';
    const today  = todayStr();

    let list = allTodos.filter(t => {
        if (search && !t.task.toLowerCase().includes(search) &&
            !(t.notes || '').toLowerCase().includes(search) &&
            !(t.label || '').toLowerCase().includes(search)) return false;

        if (activeFilter === 'offen')    return !t.completed;
        if (activeFilter === 'erledigt') return  t.completed;
        if (activeFilter === 'heute')    return !t.completed && t.due_date === today;
        if (activeFilter === 'hoch')     return !t.completed && t.priority === 'hoch';
        return true;
    });

    const prioOrder = { hoch: 0, mittel: 1, niedrig: 2 };
    list.sort((a, b) => {
        // Erledigte immer nach unten
        if ( a.completed && !b.completed) return  1;
        if (!a.completed &&  b.completed) return -1;

        if (sort === 'prio') {
            const pd = (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1);
            if (pd !== 0) return pd;
            // bei gleicher prio: fällige zuerst
            if (a.due_date && !b.due_date) return -1;
            if (!a.due_date && b.due_date) return  1;
            return (a.due_date || '').localeCompare(b.due_date || '');
        }
        if (sort === 'due') {
            if (a.due_date && !b.due_date) return -1;
            if (!a.due_date && b.due_date) return  1;
            return (a.due_date || '').localeCompare(b.due_date || '');
        }
        if (sort === 'name') return (a.task || '').localeCompare(b.task || '');
        if (sort === 'created') return (b.id || 0) - (a.id || 0);
        return 0;
    });

    return list;
}

// ── Render ────────────────────────────────────────────────────

function renderTodos() {
    const wrap  = document.getElementById('todoListWrap');
    if (!wrap) return;

    const list  = getFilteredSorted();
    const today = todayStr();

    if (!list.length) {
        wrap.innerHTML =
            '<div class="todo-empty">' +
                '<i class="ri-checkbox-line"></i>' +
                '<h3>' + (activeFilter === 'erledigt' ? 'Noch nichts erledigt' : 'Keine Aufgaben') + '</h3>' +
                '<p>' + (activeFilter === 'alle' ? 'Füge deine erste Aufgabe hinzu.' : 'Keine Einträge für diesen Filter.') + '</p>' +
            '</div>';
        return;
    }

    // Gruppierung: Überfällig / Heute / Diese Woche / Später / Kein Datum / Erledigt
    const groups = [
        { key: 'overdue',  label: 'Überfällig',   items: [] },
        { key: 'today',    label: 'Heute',         items: [] },
        { key: 'week',     label: 'Diese Woche',   items: [] },
        { key: 'later',    label: 'Später',        items: [] },
        { key: 'nodate',   label: 'Kein Datum',    items: [] },
        { key: 'done',     label: 'Erledigt',      items: [] },
    ];

    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    list.forEach(t => {
        if (t.completed)                                   { groups[5].items.push(t); return; }
        if (t.due_date && t.due_date < today)              { groups[0].items.push(t); return; }
        if (t.due_date && t.due_date === today)            { groups[1].items.push(t); return; }
        if (t.due_date && t.due_date <= weekEndStr)        { groups[2].items.push(t); return; }
        if (t.due_date)                                    { groups[3].items.push(t); return; }
        groups[4].items.push(t);
    });

    let html = '';
    groups.forEach(g => {
        if (!g.items.length) return;
        html += '<div class="todo-section-label">' + g.label + ' <span style="color:var(--text-3);font-weight:500;">(' + g.items.length + ')</span></div>';
        g.items.forEach(t => { html += renderTodoCard(t, today); });
    });

    wrap.innerHTML = html;
    renderStats();
}

function renderTodoCard(t, today) {
    const prio      = t.priority || 'mittel';
    const completed = !!t.completed;
    const isOverdue = !completed && t.due_date && t.due_date < today;

    // Due date badge
    let dueBadge = '';
    if (t.due_date && !completed) {
        const d     = new Date(t.due_date);
        const label = fmt.format(d);
        let cls = 'ok';
        if (t.due_date < today)  cls = 'overdue';
        else if (t.due_date === today) cls = 'today';
        else {
            const diff = Math.ceil((d - new Date()) / 86400000);
            if (diff <= 3) cls = 'soon';
        }
        const prefix = cls === 'overdue' ? '⚠ ' : cls === 'today' ? '● ' : '';
        dueBadge = '<span class="todo-due-badge ' + cls + '"><i class="ri-calendar-line"></i>' + prefix + label + '</span>';
    }

    // Label badge
    const labelBadge = t.label
        ? '<span class="todo-label-badge"><i class="ri-price-tag-3-line"></i>' + escHtml(t.label) + '</span>'
        : '';

    // Prio badge
    const prioBadge = '<span class="prio-badge ' + prio + '"><span class="prio-dot ' + prio + '"></span>' + cap(prio) + '</span>';

    // Progress bar
    let progressHtml = '';
    if (t.quantity > 0) {
        const pct = Math.round((t.current_count / t.quantity) * 100);
        progressHtml =
            '<div class="todo-progress-wrap">' +
                '<div style="display:flex;justify-content:space-between;font-size:0.71rem;color:var(--text-3);">' +
                    '<span>Fortschritt</span><span>' + t.current_count + ' / ' + t.quantity + '</span>' +
                '</div>' +
                '<div class="todo-progress-track">' +
                    '<div class="todo-progress-fill" style="width:' + pct + '%;"></div>' +
                '</div>' +
            '</div>';
    }

    // Actions
    let actions = '';
    if (!completed && t.quantity > 0) {
        actions += '<button class="todo-act-btn inc" onclick="incrementTodo(' + t.id + ')" title="Zähler erhöhen"><i class="ri-add-line"></i></button>';
    }
    actions += '<button class="todo-act-btn" onclick="openEditModal(' + t.id + ')" title="Bearbeiten"><i class="ri-edit-line"></i></button>';
    actions += '<button class="todo-act-btn del" onclick="deleteTodo(' + t.id + ')" title="Löschen"><i class="ri-delete-bin-line"></i></button>';

    return '<div class="todo-card prio-' + prio + (completed ? ' completed' : '') + (isOverdue ? ' overdue' : '') + '" id="todo-' + t.id + '">' +
        // Checkbox
        '<div class="todo-checkbox ' + (completed ? 'checked' : '') + '" onclick="toggleComplete(' + t.id + ',' + (completed ? 'true' : 'false') + ')">' +
            (completed ? '<i class="ri-check-line"></i>' : '') +
        '</div>' +
        // Content
        '<div class="todo-card-content">' +
            '<div class="todo-card-title">' + escHtml(t.task) + '</div>' +
            (t.notes ? '<div class="todo-card-notes">' + escHtml(t.notes) + '</div>' : '') +
            progressHtml +
            '<div class="todo-card-meta">' +
                prioBadge +
                dueBadge +
                labelBadge +
            '</div>' +
        '</div>' +
        // Actions
        '<div class="todo-card-actions">' + actions + '</div>' +
    '</div>';
}

// ── Modal ─────────────────────────────────────────────────────

function openAddModal() {
    document.getElementById('editId').value    = '';
    document.getElementById('fTask').value     = '';
    document.getElementById('fNotes').value    = '';
    document.getElementById('fDueDate').value  = '';
    document.getElementById('fLabel').value    = '';
    document.getElementById('fQuantity').value = '';
    document.getElementById('modalTitle').innerHTML = '<i class="ri-add-circle-line"></i> Aufgabe hinzufügen';
    pickPrio('mittel');
    document.getElementById('todoModal').classList.add('active');
    setTimeout(() => document.getElementById('fTask').focus(), 100);
}

function openEditModal(id) {
    const t = allTodos.find(x => x.id === id);
    if (!t) return;
    document.getElementById('editId').value    = t.id;
    document.getElementById('fTask').value     = t.task || '';
    document.getElementById('fNotes').value    = t.notes || '';
    document.getElementById('fDueDate').value  = t.due_date || '';
    document.getElementById('fLabel').value    = t.label || '';
    document.getElementById('fQuantity').value = t.quantity > 0 ? t.quantity : '';
    document.getElementById('modalTitle').innerHTML = '<i class="ri-edit-line"></i> Aufgabe bearbeiten';
    pickPrio(t.priority || 'mittel');
    document.getElementById('todoModal').classList.add('active');
    setTimeout(() => document.getElementById('fTask').focus(), 100);
}

function closeModal(e) {
    if (e && e.target !== document.getElementById('todoModal')) return;
    document.getElementById('todoModal').classList.remove('active');
}

function pickPrio(p) {
    selPrio = p;
    document.querySelectorAll('.todo-prio-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.prio === p);
    });
}

// ── CRUD ─────────────────────────────────────────────────────

async function saveTodo() {
    const btn  = document.getElementById('saveBtn');
    const task = document.getElementById('fTask').value.trim();
    if (!task) { document.getElementById('fTask').focus(); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block;"></i> Speichern…';

    const payload = {
        task,
        priority: selPrio,
        due_date:  document.getElementById('fDueDate').value  || null,
        label:     document.getElementById('fLabel').value.trim(),
        notes:     document.getElementById('fNotes').value.trim(),
        quantity:  parseInt(document.getElementById('fQuantity').value) || 0,
    };

    const editId = document.getElementById('editId').value;
    try {
        const url    = editId ? '/users/todos/' + editId : '/users/todos/add';
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
        document.getElementById('todoModal').classList.remove('active');
        await loadTodos();
    } catch {
        alert('Fehler beim Speichern.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="ri-save-line"></i> Speichern';
    }
}

async function toggleComplete(id, isCurrentlyCompleted) {
    const card = document.getElementById('todo-' + id);
    if (card) card.style.opacity = '0.5';
    try {
        const res = await fetch('/users/todos/' + id, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: !isCurrentlyCompleted })
        });
        if (!res.ok) throw new Error();
        await loadTodos();
    } catch {
        if (card) card.style.opacity = '';
        alert('Fehler beim Aktualisieren.');
    }
}

async function incrementTodo(id) {
    try {
        const res = await fetch('/users/todos/' + id + '/increment', { method: 'POST' });
        if (!res.ok) throw new Error();
        await loadTodos();
    } catch {
        alert('Fehler beim Erhöhen des Zählers.');
    }
}

async function deleteTodo(id) {
    if (!confirm('Aufgabe wirklich löschen?')) return;
    try {
        const res = await fetch('/users/todos/' + id, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        // Optimistisch aus der Liste entfernen
        allTodos = allTodos.filter(t => t.id !== id);
        renderStats();
        renderTodos();
    } catch {
        alert('Fehler beim Löschen.');
        await loadTodos();
    }
}

// ── Keyboard shortcuts ────────────────────────────────────────

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.getElementById('todoModal').classList.remove('active');
    }
    // Ctrl/Cmd + N → neue Aufgabe
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAddModal();
    }
});

// Enter im Formular speichert
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('fTask')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') saveTodo();
    });
});

// ── Helpers ──────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().split('T')[0];
}
function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function cap(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}