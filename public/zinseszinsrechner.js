document.addEventListener('DOMContentLoaded', (event) => {
    updateChart();
});

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
            responsive: true,
            maintainAspectRatio: false,
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