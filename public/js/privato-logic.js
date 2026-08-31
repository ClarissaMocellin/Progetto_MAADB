document.addEventListener('DOMContentLoaded', async () => {
    const personId = localStorage.getItem('idProfile');
    const personName = localStorage.getItem('nameProfile');

    if (!personId) {
        alert("Accesso non autorizzato. Effettua prima il login.");
        window.location.href = 'index.html';
        return;
    }

    
    document.getElementById('titolo-dashboard').textContent += `: ${personName}`;
    const btnTabStatement = document.getElementById('btn-tab-estratto-conto');
    const btnTabInvestments = document.getElementById('btn-tab-investimenti');
    const paneStatement = document.getElementById('pane-estratto-conto');
    const paneInvestments = document.getElementById('pane-investimenti');

    if (btnTabStatement && btnTabInvestments && paneStatement && paneInvestments) {
        btnTabStatement.addEventListener('click', () => {
            paneStatement.style.display = 'block';
            paneInvestments.style.display = 'none';
            btnTabStatement.classList.add('active');
            btnTabInvestments.classList.remove('active');
        });

        btnTabInvestments.addEventListener('click', () => {
            paneStatement.style.display = 'none';
            paneInvestments.style.display = 'block';
            btnTabStatement.classList.remove('active');
            btnTabInvestments.classList.add('active');
        });
    }

    const btnCalculateExpenses = document.getElementById('btnCalcolaSpese');
    const btnLoadRanking = document.getElementById('btnCaricaClassifica');

    if (btnCalculateExpenses) {
        btnCalculateExpenses.addEventListener('click', calculateMonthlyBalance);
    }
    
    if (btnLoadRanking) {
        btnLoadRanking.addEventListener('click', loadCompanyRanking);
    }

    findUserAccounts();

    async function findUserAccounts() {
        const selectAccount = document.getElementById('selezionaConto');
        const btnCalculateExpenses = document.getElementById('btnCalcolaSpese');
        if (!selectAccount) return;

        if (btnCalculateExpenses) {
            btnCalculateExpenses.disabled = true;
        }

        if (!personId) {
            alert("Sessione utente non valida o scaduta. Effettua nuovamente il login.");
            selectAccount.innerHTML = '<option value="">Utente non autenticato</option>';
            return;
        }

        try {
            const response = await axios.get(`/api/privato/accounts?personId=${personId}`);
            const result = response.data;

            if (result.success && result.accounts && result.accounts.length > 0) {
                selectAccount.innerHTML = '';

                selectAccount.innerHTML = result.accounts.map(accountId => 
                    `<option value="${accountId}">Conto ID: ${accountId}</option>`
                ).join('');

                if (btnCalculateExpenses) {
                    btnCalculateExpenses.disabled = false;
                }
            } else {
                selectAccount.innerHTML = '<option value="">Nessun conto corrente associato a questo profilo</option>';
            }
        } catch (error) {
            console.error("Errore nel caricamento dei conti:", error);
            selectAccount.innerHTML = '<option value="">Errore nel caricamento dei conti</option>';
        }
    }


    async function calculateMonthlyBalance() {
        const selectAccount = document.getElementById('selezionaConto');
        const selectMonth = document.getElementById('selezionaMese');
        const inputYear = document.getElementById('selezionaAnno');
        
        const widgetIncome = document.getElementById('totaleEntrate'); 
        const widgetExpenses = document.getElementById('totaleSpese'); 
        
        const incomeListBody = document.getElementById('lista-entrate-corpo');
        const expensesListBody = document.getElementById('lista-uscite-corpo');
    
        if (!selectAccount || !selectMonth || !inputYear || !widgetIncome || !widgetExpenses || !incomeListBody || !expensesListBody) {
            console.error("Errore: Uno o più elementi HTML necessari non sono stati trovati nella pagina.");
            return;
        }
    
        const chosenMonth = selectMonth.value;
        const chosenYear = inputYear.value;
        const chosenAccount = selectAccount.value;
    
        if (chosenYear.length !== 4) {
            alert("Per favore, inserisci un anno valido composto da 4 cifre (Es. 2026).");
            return;
        }
        
        if (!chosenAccount) {
            alert("Conto corrente non associato al profilo. Impossibile caricare i dati.");
            return;
        }
    
        const spinnerHTML = `
            <li class="list-group-item bg-transparent text-center text-success py-3 w-100 border-0">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Recupero dei dati in corso...
            </li>
        `;
        incomeListBody.innerHTML = spinnerHTML;
        expensesListBody.innerHTML = spinnerHTML;
    
        try {
            const response = await axios.get(`/api/privato/bankStatement`, {
                params: {
                    idSelectedAccount: chosenAccount,
                    year: chosenYear,
                    month: chosenMonth
                }
            });
            
            const result = response.data;
            if (!result.success) {
                alert("Il server ha risposto con un errore: " + (result.message || "Impossibile elaborare i flussi."));
                return;
            }
        
            const {financialSummary, profitList = [], spendingsList = []} = result;
            if (widgetIncome) widgetIncome.textContent = `+ ${financialSummary.totalProfit.toLocaleString('it-IT', {minimumFractionDigits: 2})} €`;
            if (widgetExpenses) widgetExpenses.textContent = `- ${financialSummary.totalSpendings.toLocaleString('it-IT', {minimumFractionDigits: 2})} €`;
        
            const renderTransactionItem = (tx, isIncome) => {
                const sign = isIncome ? '+' : '-';

                return `
                    <li class="list-group-item bg-dark border-secondary bg-opacity-25 d-flex justify-content-between align-items-center py-3 px-3 mb-2 rounded border text-start">
                        <div style="flex-grow: 1; margin-right: 15px;">
                            
                            <div class="text-white-50 small mb-1" style="font-size: 0.8rem;">
                                <strong>Account Intermedio: ${tx.intermediateName}</strong>
                                <span class="bg-secondary p-1 me-1" style="font-size: 0.6rem;">- ${tx.intermediateType}</span>
                            </div>

                            <div class="border-top border-secondary border-opacity-25 pt-1.5">
                                <small class="text-white-50 d-block mb-1" style="font-size: 0.75rem;">
                                    <span class="bi bi-arrow-left-right text-warning me-1" aria-hidden="true"></span>Numero transazioni mensili: <strong class="text-white">${tx.monthTotalAction}</strong>
                                </small>
                                <small class="text-white-50 d-block mb-1" style="font-size: 0.75rem;">
                                    <span class="bi bi-arrow-left-right text-warning me-1" aria-hidden="true"></span>Totale transazioni mensili: <strong class="text-white">${sign} ${(tx.monthTotalMoney || 0).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</strong>
                                </small>
                            </div>

                            <div class="text-white fw-bold mb-1" style="font-size: 0.95rem;">
                                <span>Account Finale: ${tx.finalName}</span>
                                <span class="bg-primary p-1 me-1" style="font-size: 0.6rem;">- ${tx.finalType}</span>
                                <span class="bg-primary p-1 me-1" style="font-size: 0.6rem;">- ${tx.finalBlocked}</span>
                            </div>

                            <div class="border-top border-secondary border-opacity-25 pt-1.5">
                                <small class="text-white-50 d-block mb-1" style="font-size: 0.75rem;">
                                    <span class="bi bi-arrow-left-right text-warning me-1" aria-hidden="true"></span>Numero transazioni annue intermediario-finale: <strong class="text-white">${tx.monthTotalActionYear}</strong>
                                </small>
                                <small class="text-white-50 d-block mb-1" style="font-size: 0.75rem;">
                                    <span class="bi bi-arrow-left-right text-warning me-1" aria-hidden="true"></span>Totale transazioni annue intermediario-finale: <strong class="text-white">${sign} ${(tx.monthTotalMoneyYear || 0).toLocaleString('it-IT', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €</strong>
                                </small>
                            </div>

                            <div class="border-top border-secondary border-opacity-25 pt-1.5">
                                <small class="text-white-50 d-block mb-1" style="font-size: 0.75rem;">
                                    <span class="bi bi-arrow-left-right text-warning me-1" aria-hidden="true"></span>Totale transazioni da/verso account finale: <strong class="text-white">${tx.totFinalAccountActionYear}</strong>
                                </small>
                            </div>
                        </div>
                    </li>
                `;
            };
        
            incomeListBody.innerHTML = profitList.length === 0
                ? `<li class="list-group-item bg-transparent text-white-50 text-center small border-0 py-3">Nessun accredito ricevuto nel mese.</li>`
                : profitList.map(tx => renderTransactionItem(tx, true)).join('');
        
            expensesListBody.innerHTML = spendingsList.length === 0
                ? `<li class="list-group-item bg-transparent text-white-50 text-center small border-0 py-3">Nessuna spesa o bonifico effettuato.</li>`
                : spendingsList.map(tx => renderTransactionItem(tx, false)).join('');
        
        } catch (error) {
            console.error("Errore durante il recupero dei flussi mensili:", error);
            alert("Si è verificato un errore di rete o del server nel caricamento dei dati investigativi.");
            
            if (widgetIncome) widgetIncome.textContent = "+ 0,00 €";
            if (widgetExpenses) widgetExpenses.textContent = "- 0,00 €";
            
            const errorPlaceholder = `<li class="list-group-item bg-transparent text-danger text-center small border-0 py-3">Impossibile recuperare i dati.</li>`;
            incomeListBody.innerHTML = errorPlaceholder;
            expensesListBody.innerHTML = errorPlaceholder;
        }
    }            

    async function loadCompanyRanking() {
        const tbody = document.getElementById('tabellaAziendeBody');
        const btn = document.getElementById('btnCaricaClassifica');
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Caricamento...';
        }
    
        try {
            const response = await axios.get('/api/privato/investorsRanking');
            const data = response.data;
    
            if (!data.success || !data.ranking || data.ranking.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" class="text-center text-white-50 py-4">
                            Nessuna azienda disponibile in classifica.
                        </td>
                    </tr>`;
                return;
            }
    
            tbody.innerHTML = '';
            data.ranking.forEach((company, index) => {
                const rank = index + 1;
                const row = document.createElement('tr');
                row.className = "align-middle border-bottom border-secondary border-opacity-10";
                row.innerHTML = `
                    <td class="text-white fw-bold py-3">#${rank}</td>
                    <td class="py-3">
                        <div class="text-white fw-semibold">${company.companyName}</div>
                        <div class="text-white-50 small" style="font-size: 0.75rem;">ID: ${company.companyId}</div>
                        <div class="text-verde-chiaro fw-bold fs-5">Score pesato affidabilità: ${company.finalInvestmentScore}</div>
                    </td>
                    <td class="text-end py-3">
                        <div class="text-white-50 small">Dovuto: €${company.totLoan}</div>
                        <div class="text-white-50 small">Rest.: €${company.totRepay}</div>
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