// Öffnen der Startseite beim Laden der Seite
window.onload = function () {
    openPage(event, 'Startseite');
}


// Funktion, um die ausgewählte Seite zu öffnen


function openPage(evt, pageName) {
    var i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tabcontent");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablink");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

}

function resetSelects() {
    var selects = document.querySelectorAll('select'); // Alle Select-Elemente auswählen

    selects.forEach(function (select) {
        select.selectedIndex = 0; // Das erste Element als ausgewählt setzen
    });
}
















document.addEventListener('DOMContentLoaded', (event) => {
    updateChart();
});


// Event-Listener für den <select>-Element

// Funktion für die Berechnung des Zinseszinses
function updateChart() {
    var amountElement = document.getElementById("amount");
    var yearsElement = document.getElementById("years");
    var percentageElement = document.getElementById("percentage");
    var saveMoneyElement = document.getElementById("saveMoney");

    // Überprüfung, ob alle Elemente nicht null sind
    if (amountElement && yearsElement && percentageElement && saveMoneyElement) {
        var amount = parseFloat(amountElement.value);
        var years = parseFloat(yearsElement.value);
        var percentage = parseFloat(percentageElement.value);
        var saveMoney = parseFloat(saveMoneyElement.value);

    }

    // Ein Array mit den Jahren erstellen
    var labels = [];
    for (var i = 0; i <= years; i++) {
        labels.push((new Date().getFullYear() + i).toString());
    }

    // Die Daten für den Graphen berechnen
    var data = [];
    var currentValue = amount;

    labels.forEach(function (label, index) {
        currentValue = parseFloat(currentValue.toFixed(2)); // Rundet den aktuellen Wert auf zwei Dezimalstellen
        data.push(currentValue); // Fügt den aktuellen Wert zum Datenarray hinzu
        for (let year = 0; year < 12; year++) {
            currentValue *= (1 + (percentage / 100) / 12); // Berücksichtigt den monatlichen Zinseszins
            currentValue += saveMoney; // Fügt das monatliche gesparte Geld hinzu
        }
    });

    var eingezahlt = amount + saveMoney * years * 12; // Berechnung des eingezahlten Betrags
    var gewinn = data[data.length - 1] - eingezahlt; // Berechnung des Gewinns aus dem letzten Eintrag im Graphen
    var gesamt = eingezahlt + gewinn;

    if (isNaN(gewinn) || isNaN(eingezahlt) || isNaN(gesamt)) {
        gewinn = 0;
        eingezahlt = 0;
        gesamt = 0;
    }

    if (eingezahlt === null) eingezahlt = 0;
    if (gewinn === null) gewinn = 0;
    if (gesamt === null) gesamt = 0;
    console.log(eingezahlt, gewinn, gesamt);

    // Werte im Header aktualisieren
    document.getElementById("eingezahltZins").innerHTML = eingezahlt.toFixed(2) + " €";
    document.getElementById("gesamtgewinnZins").innerHTML = gewinn.toFixed(2) + " €";
    document.getElementById("zinseszinsGesamt").innerHTML = gesamt.toFixed(2) + " €";

    // Zuvor erstellten Chart entfernen, falls vorhanden
    var chartElement = document.getElementById("myChart");
    if (chartElement) {
        chartElement.remove();
    }

    // Neue Canvas-Element erstellen und dem Container hinzufügen
    var canvas = document.createElement('canvas');
    canvas.id = "myChart";
    document.getElementById("chartContainer").appendChild(canvas);

    // Chart erstellen
    var ctx = canvas.getContext('2d');
    var myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Finanzverlauf',
                data: data,
                borderColor: 'rgb(255, 255, 255)',
                tension: 0.1
            }]
        },
        options: {
            plugins: {
                legend: {
                    labels: {
                        color: 'white' // Farbe für die Legende
                    }
                }
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Betrag',
                        color: 'rgb(255, 255, 255)'
                    },
                    ticks: {
                        color: 'rgb(255, 255, 255)'
                    },
                    grid: {
                        color: 'rgb(91, 91, 91)' // Helles Grau für das Gitter
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Jahr',
                        color: 'rgb(255, 255, 255)'
                    },
                    ticks: {
                        color: 'rgb(255, 255, 255)'
                    },
                    grid: {
                        color: 'rgb(91, 91, 91)' // Helles Grau für das Gitter
                    }
                }
            }
        }
    });
}










// Ausgabetracker
const formatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    signDisplay: "always",
});

const list = document.getElementById("transactionList");
const form = document.getElementById("transactionForm");
const status = document.getElementById("status");
const balance = document.getElementById("balance");
const income = document.getElementById("income");
const expense = document.getElementById("expense");
const categorySelect = document.getElementById('categorySelect');
const monthFilter = document.getElementById('monthFilter');
const categoryFilter = document.getElementById('categoryFilter');

let transactions = [];

form.addEventListener("submit", addTransaction);
monthFilter.addEventListener("change", renderList);
categoryFilter.addEventListener("change", renderList);

window.addEventListener("load", function () {
    loadTransactions();
});

async function loadTransactions() {
    try {
        const response = await fetch('/users/getTransactions'); // Endpunkt zum Abrufen der Transaktionen
        transactions = await response.json();
        populateMonthFilter();
        populateCategoryFilter();
        renderList();
    } catch (error) {
        console.error('Fehler beim Laden der Transaktionen:', error);
    }
}

function renderList() {
    const selectedMonth = monthFilter.value;
    const selectedCategory = categoryFilter.value;
    const filteredTransactions = transactions.filter(transaction => {
        const trxDate = new Date(transaction.date);
        const monthMatch = !selectedMonth || selectedMonth === `${trxDate.getFullYear()}-${String(trxDate.getMonth() + 1).padStart(2, '0')}`;
        const categoryMatch = !selectedCategory || selectedCategory === transaction.category;
        return monthMatch && categoryMatch;
    });

    list.innerHTML = "";
    status.textContent = "";

    if (filteredTransactions.length === 0) {
        status.textContent = "Keine Transaktionen.";
        return;
    }

    let incomeTotal = 0;
    let expenseTotal = 0;

    filteredTransactions.forEach((transaction) => {
        const sign = transaction.type === "Einnahmen" ? 1 : -1;

        const li = document.createElement("li");
        li.classList.add("transaction");

        const amountColor = transaction.type === "Einnahmen" ? "rgb(8, 195, 8)" : "rgb(212, 4, 4)";

        li.innerHTML = `
            <div class="name">
                <h4>${transaction.name}</h4>
                <p>${new Date(transaction.date).toLocaleDateString()}</p>
            </div>
            <div class="category">
                <h4>${transaction.category}</h4>
            </div>
            <div class="amount ${transaction.type}" style="color: ${amountColor};">
                <span>${formatter.format(transaction.amount * sign)}</span>
            </div>
            <div class="action">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" onclick="deleteTransaction(${transaction.id})">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        `;

        list.appendChild(li);

        if (transaction.type === "Einnahmen") {
            incomeTotal += transaction.amount;
        } else {
            expenseTotal += transaction.amount;
        }
    });

    const balanceTotal = incomeTotal - expenseTotal;

    balance.textContent = formatter.format(balanceTotal);
    income.textContent = formatter.format(incomeTotal);
    expense.textContent = formatter.format(expenseTotal * -1);

    // Werte in localStorage speichern
    localStorage.setItem('balance', balanceTotal);
    localStorage.setItem('income', incomeTotal);
    localStorage.setItem('expense', expenseTotal * -1);

    // Farbe ändern nach Vermögensstand
    if (balanceTotal > 0) {
        balance.style.color = "rgb(8, 195, 8)";
    } else if (balanceTotal < 0) {
        balance.style.color = "rgb(212, 4, 4)";
    } else {
        balance.style.color = "white";
    }
}










async function deleteTransaction(transactionId) {
    try {
        const response = await fetch(`/users/deleteTransaction/${transactionId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Fehler beim Löschen der Transaktion');
        }

        // Lade Transaktionen neu und warte darauf
        await loadTransactions();
        location.reload();

        // Erst danach die UI aktualisieren
        populateMonthFilter();
        populateCategoryFilter();
        renderList();
        renderChart();

    } catch (error) {
        console.error('Fehler beim Löschen der Transaktion:', error);
        status.textContent = error.message;
    }
}






function populateMonthFilter() {
    const existingMonths = new Set(
        Array.from(monthFilter.options).map(option => option.value)
    );

    transactions.forEach(transaction => {
        const date = new Date(transaction.date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!existingMonths.has(month)) {
            const option = document.createElement("option");
            option.value = month;
            option.textContent = new Date(`${month}-01`).toLocaleString('default', { month: 'long', year: 'numeric' });
            monthFilter.appendChild(option);
            existingMonths.add(month);
        }
    });
}

function populateCategoryFilter() {
    const existingCategories = new Set(
        Array.from(categoryFilter.options).map(option => option.value)
    );

    transactions.forEach(transaction => {
        if (!existingCategories.has(transaction.category)) {
            const option = document.createElement("option");
            option.value = transaction.category;
            option.textContent = transaction.category;
            categoryFilter.appendChild(option);
            existingCategories.add(transaction.category);
        }
    });
}






function addTransaction() {
    e.preventDefault();

    const formData = new FormData(this);

    transactions.push({
        id: transactions.length + 1,
        name: formData.get("name"),
        amount: parseFloat(formData.get("amount")),
        date: formData.get("date"),
        type: formData.get("type") === "inbound" ? "Einnahmen" : "Ausgaben",
        category: categorySelect.value // Korrektur: den Wert direkt aus dem select-Element abrufen
    });

    this.reset();


    populateMonthFilter();
    populateCategoryFilter(); // Stellen Sie sicher, dass der Kategoriefilter auch aktualisiert wird
    renderList();
    renderChart();
}

// Funktion zum Gruppieren der Transaktionen nach Monat
function groupTransactionsByMonth(transactions) {
    return transactions.reduce((acc, transaction) => {
        const month = new Date(transaction.date).toLocaleString("default", {
            month: "long",
            year: "numeric",
        });
        if (!acc[month]) {
            acc[month] = { income: 0, expense: 0 };
        }
        if (transaction.type === "Einnahmen") {
            acc[month].income += transaction.amount;
        } else {
            acc[month].expense += transaction.amount;
        }
        return acc;
    }, {});
}

function renderChart() {
    const canvas = document.getElementById("transactionsChart");
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        console.error('Element mit ID "transactionsChart" ist kein Canvas oder existiert nicht');
        return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        console.error('Konnte 2D-Kontext nicht abrufen');
        return;
    }

    // Vorherigen Chart zerstören, falls vorhanden
    if (window.transactionsChart instanceof Chart) {
        window.transactionsChart.destroy();
    }

    const groupedTransactions = groupTransactionsByMonth(transactions);

    const labels = Object.keys(groupedTransactions);
    const incomeData = labels.map((month) => groupedTransactions[month].income);
    const expenseData = labels.map((month) => groupedTransactions[month].expense);

    window.transactionsChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Einnahmen",
                    backgroundColor: "green",
                    data: incomeData,
                },
                {
                    label: "Ausgaben",
                    backgroundColor: "red",
                    data: expenseData,
                },
            ],
        },
        options: {
            plugins: {
                legend: {
                    labels: {
                        color: 'white'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Betrag',
                        color: 'rgb(255, 255, 255)'
                    },
                    ticks: {
                        color: 'rgb(255, 255, 255)'
                    },
                    grid: {
                        color: 'rgb(91, 91, 91)' // Helles Grau für das Gitter
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Monat',
                        color: 'rgb(255, 255, 255)'
                    },
                    ticks: {
                        color: 'rgb(255, 255, 255)'
                    },
                    grid: {
                        color: 'rgb(91, 91, 91)' // Helles Grau für das Gitter
                    }
                }
            }
        }
    });
}

function populateFilters() {
    populateMonthFilter();
    populateCategoryFilter();
}

populateFilters();
renderList();





let slideIndex = 1;
showSlides(slideIndex);

function plusSlides(n) {
    showSlides(slideIndex += n);
}

function currentSlide(n) {
    showSlides(slideIndex = n);
}

// Funktion um die Bilderslides zu erstellen
function showSlides(n) {
    let i;
    let slides = document.getElementsByClassName("mySlides");
    let dots = document.getElementsByClassName("dot");
    if (n > slides.length) { slideIndex = 1 }
    if (n < 1) { slideIndex = slides.length }
    for (i = 0; i < slides.length; i++) {
        slides[i].style.display = "none";
    }
    for (i = 0; i < dots.length; i++) {
        dots[i].className = dots[i].className.replace(" active", "");
    }
    slides[slideIndex - 1].style.display = "block";
    dots[slideIndex - 1].className += " active";
}

document.addEventListener('click', function (e) {
    const clickedElement = e.target;
    if (clickedElement.tagName === 'A') {
        clickedElement.blur();
    }
});





