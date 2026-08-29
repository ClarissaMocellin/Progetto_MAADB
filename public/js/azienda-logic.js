document.addEventListener('DOMContentLoaded', async () => {
    const companyId = localStorage.getItem('idProfile');
    const companyName = localStorage.getItem('nameProfile');
    const companyCountry = localStorage.getItem('countryProfile');

    if (!companyId) {
        alert("Accesso non autorizzato. Effettua prima il login.");
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('titolo-dashboard').textContent += `: ${companyName}`;
    const btnTabSecurity = document.getElementById('btn-tab-sicurezza');
    const btnTabInvestors = document.getElementById('btn-tab-investitori');
    const paneSecurity = document.getElementById('pane-sicurezza');
    const paneInvestors = document.getElementById('pane-investitori');

    if (btnTabSecurity && btnTabInvestors) {
        btnTabSecurity.addEventListener('click', () => {
            paneSecurity.style.display = 'block';
            paneInvestors.style.display = 'none';
            btnTabSecurity.classList.add('active');
            btnTabInvestors.classList.remove('active');
        });

        btnTabInvestors.addEventListener('click', () => {
            paneSecurity.style.display = 'none';
            paneInvestors.style.display = 'block';
            btnTabSecurity.classList.remove('active');
            btnTabInvestors.classList.add('active');
        });
    }

    const btnVerifyAccess = document.getElementById('btnVerificaAccessi');
    const btnSearchInvestors = document.getElementById('btnCercaInvestitori');

    btnVerifyAccess.addEventListener('click', accessChannels);
    btnSearchInvestors.addEventListener('click', searchTopInvestors);
    
    // ------------------------ query 2 ------------------------
    async function accessChannels() {
        const boxResults = document.getElementById('boxRisultatiSicurezza');

        boxResults.innerHTML = `
            <div class="text-center text-success py-2">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Elaborazione dei dati in corso, attendere...
            </div>
        `;

        try {
            const response = await axios.get(`/api/azienda/accessAnalysis?companyId=${companyId}`);
            const result = response.data;
            
            if (result.success) {
                const accessData = result.data;

                if (accessData.length === 0) {
                    boxResults.innerHTML = `
                        <div class="alert alert-dark border-secondary text-center text-white-50">
                            Nessun log di accesso registrato per questa azienda.
                        </div>
                    `;
                    return;
                }
                
                boxResults.innerHTML = accessData.map(accountInfo => {
                    const allMethods = accountInfo.allMediumSignInDetails || [];

                    const methodsHTML = allMethods.map(method => {        
                        return `
                        <div class="p-3 border border-secondary rounded mb-3 text-start" style="background: rgba(255,255,255,0.05); line-height: 1.4 !important;">
                            <span class="text-white fw-bold" style="font-size: 1.1rem;">
                                ID dispositivo di accesso: ${method.mediumId || 'N/D'}
                            </span><br>
                            <span class="text-white">Tipo accesso: ${method.mediumType || 'N/D'}</span><br>
                            <span class="text-white">Livello Rischio: ${method.riskLevel || 'N/D'}</span><br>
                            <span class="text-white-50">Stato: ${method.isBlocked ? 'Bloccato' : 'Attivo'}</span>
                        </div>
                        `;
                    }).join('');

                    return `
                    <div class="card border-secondary mt-3 mb-2 rounded-3 overflow-hidden" style="background: rgba(255, 255, 255, 0.03) !important;">
                        <div class="card-header bg-secondary bg-opacity-25 py-2 px-3 border-bottom border-secondary text-start d-flex justify-content-between align-items-center">
                            <h4 class="h5 m-0 text-success fw-bold">Account: ${accountInfo.accountId || 'N/D'}</h4>
                        </div>
                        <div class="card-body p-3">
                            ${methodsHTML || '<div class="text-muted text-start p-2">Nessun accesso rilevato per questo account.</div>'}
                        </div>
                    </div>
                    `;
                }).join('');

                btnVerifyAccess.className = "btn btn-verde-chiaro w-100 py-2.5 rounded-3 mt-5";
            }
        } catch (error) {
            console.error("Errore nel rendering verticale:", error);
            boxResults.innerHTML = `
                <div class="alert alert-danger text-center fw-bold">
                    Impossibile completare l'analisi dei log di sicurezza.
                </div>
            `;
        }
    }

    // ------------------------ query 3 ------------------------
    async function searchTopInvestors() {
        const tbody = document.getElementById('tabellaInvestitoriBody');
        
        if (btnSearchInvestors) {
            btnSearchInvestors.disabled = true;
            btnSearchInvestors.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Caricamento...';
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
            if (btnSearchInvestors) {
                btnSearchInvestors.disabled = false;
                btnSearchInvestors.innerHTML = 'Visualizza Classifica';
           }
       }
   }
});