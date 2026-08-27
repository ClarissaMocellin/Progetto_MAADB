document.addEventListener('DOMContentLoaded', async () => {
    const companyId = localStorage.getItem('idProfile');
    const companyName = localStorage.getItem('nameProfile');
    const companyCountry = localStorage.getItem('countryProfile');

    if (!companyId) {
        alert("Accesso non autorizzato. Effettua prima il login.");
        window.location.href = 'index.html';
        return;
    }

    const title = document.getElementById('titolo-benvenuto');
    if (title && companyName) {
        title.textContent = `Dashboard Aziendale: ${companyName}`;
    }

    const btnTabSicurezza = document.getElementById('btn-tab-sicurezza');
    const btnTabInvestitori = document.getElementById('btn-tab-investitori');
    const paneSicurezza = document.getElementById('pane-sicurezza');
    const paneInvestitori = document.getElementById('pane-investitori');

    if (btnTabSicurezza && btnTabInvestitori) {
        btnTabSicurezza.addEventListener('click', () => {
            paneSicurezza.style.display = 'block';
            paneInvestitori.style.display = 'none';
            btnTabSicurezza.classList.add('active');
            btnTabInvestitori.classList.remove('active');
        });

        btnTabInvestitori.addEventListener('click', () => {
            paneSicurezza.style.display = 'none';
            paneInvestitori.style.display = 'block';
            btnTabSicurezza.classList.remove('active');
            btnTabInvestitori.classList.add('active');
        });
    }

    const btnVerificaAccessi = document.getElementById('btnVerificaAccessi');
    const btnCercaInvestitori = document.getElementById('btnCercaInvestitori');

    if (btnVerificaAccessi) {
        btnVerificaAccessi.addEventListener('click', analyseAccessChannels);
    }
    
    if (btnCercaInvestitori) {
        btnCercaInvestitori.addEventListener('click', searchTopInvestors);
    }
    
    async function analyseAccessChannels() {
        const boxRisultati = document.getElementById('boxRisultatiSicurezza');
        const btnVerifica = document.getElementById('btnVerificaAccessi');

        if (!boxRisultati || !btnVerifica) return;

        boxRisultati.innerHTML = `
            <div class="text-center text-success py-2">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Elaborazione dei dati in corso, attendere...
            </div>
        `;

        try {
            const response = await axios.get(`/api/azienda/analisi-accessi?companyId=${companyId}`);
            const result = response.data;

            if (result.success) {
                const accessData = result.data;

                if (accessData.length === 0) {
                    boxRisultati.innerHTML = `
                        <div class="alert alert-dark border-secondary text-center text-white-50">
                            Nessun log di accesso registrato per questa azienda.
                        </div>
                    `;
                    return;
                }

                boxRisultati.innerHTML = accessData.map(methodData => {
                    const risksBreakdownHTML = methodData.riskBreakdown.map(risk => {
                        const blockRateCalculation = risk.count > 0 ? (risk.blocked / risk.count) * 100 : 0;
                        const currentLevel = risk.level.toLowerCase().trim(); 

                        if (currentLevel.includes("critical") || currentLevel.includes("severe") || currentLevel.includes("extreme") || currentLevel.includes("high")) {
                            hexColor = "#dc3545";
                        } else if (currentLevel.includes("minimal") || currentLevel.includes("low")) {
                            hexColor = "#198754";
                        } else {
                            hexColor = "#ffc107";
                        }

                        return `
                            <div class="p-2 border border-secondary rounded mb-2 text-start" style="background: rgba(255,255,255,0.03); line-height: 1.3 !important;">
                                <span class="text-white fw-bold" style="font-size: 1.1rem;">
                                    Classe Rischio: <span style="color: ${hexColor} !important;">${risk.level}</span>
                                </span><br>
                                <span class="text-white">Log Totali Analizzati: <strong class="text-success">${risk.count}</strong></span><br>
                                <span class="text-white-50">Tasso di accessi bloccati: <strong class="text-white">${blockRateCalculation.toFixed(1)}%</strong></span>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div class="card bg-dark bg-opacity-50 border-secondary mt-2 mb-1 rounded-3 overflow-hidden">
                            <div class="card-header bg-secondary bg-opacity-25 py-1 px-3 border-bottom border-secondary text-start">
                                <h4 class="h5 m-0 text-success fw-bold"> Canale di Accesso: ${methodData.accessMethod}</h4>
                            </div>
                            <div class="card-body p-1">
                                ${risksBreakdownHTML}
                            </div>
                        </div>
                    `;
                }).join('');

                btnVerifica.className = "btn btn-verde-chiaro w-100 py-2.5 rounded-3 mt-5";
            }
        } catch (error) {
            console.error("Errore nel rendering verticale:", error);
            boxRisultati.innerHTML = `
                <div class="alert alert-danger text-center fw-bold">
                    Impossibile completare l'analisi dei log di sicurezza.
                </div>
            `;
        }
    }

    async function searchTopInvestors() {
        const tbody = document.getElementById('tabellaInvestitoriBody');
        const btn = document.getElementById('btnCercaInvestitori');
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Caricamento...';
        }
    
        try {
            const response = await axios.get(`/api/azienda/potenziali-investitori?companyCountry=${companyCountry}`);
            const data = response.data;
    
            if (!data.success || !data.leadClassifica || data.leadClassifica.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-white-50 py-4">
                            Nessun possibile investitore disponibile in classifica.
                        </td>
                    </tr>`;
                return;
            }
    
            tbody.innerHTML = '';
            data.leadClassifica.forEach((person, index) => {
                const rank = index + 1;
                const row = document.createElement('tr');
                row.className = "align-middle border-bottom border-secondary border-opacity-10";
                row.innerHTML = `
                    <td class="text-white fw-bold py-3">#${rank}</td>
                    <td class="py-3">
                        <div class="text-white fw-semibold">${person.personName}</div>
                        <div class="text-white-50 small" style="font-size: 0.75rem;">ID: ${person.personId}</div>
                    </td>
                    <td class="text-end py-3">
                    <div class="text-verde-chiaro fw-bold fs-5">${person.affidability}</div>
                    </td>
                `;
                tbody.appendChild(row);
            });
        } catch (error) {
            console.error("Errore nel caricamento della classifica:", error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-danger py-4">
                        Si è verificato un errore durante il recupero dei dati.
                    </td>
                </tr>`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Visualizza Classifica';
            }
        }
    }
});