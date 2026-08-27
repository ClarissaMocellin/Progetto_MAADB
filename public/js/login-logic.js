document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginSection = document.getElementById('sezione-login');
    const selectSection = document.getElementById('sezione-selezione');
    const optionList = document.getElementById('lista-opzioni');
    const backButton = document.getElementById('btn-indietro');
    let currentRole = '';

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        currentRole = document.getElementById('Ruolo').value;
        const inputName = document.getElementById('NomeUtente').value;
        
        try {
            const response = await axios.post('/api/login/extractProfiles', {
                role: currentRole,
                name: inputName
            });

            const result = response.data;

            if (result.success) {
                optionList.innerHTML = result.entity.map(entity => `
                    <button class="list-group-item list-group-item-action d-flex justify-content-between align-items-center btn-esci-custom" data-id="${entity.id}" data-name="${entity.name}" data-country="${entity.country}">
                    <div class="fw-bold text-success">${entity.name}</div>
                    <small class="text-white-50">ID Account: ${entity.id}</small>
                    </button>
                `).join('');

                optionList.querySelectorAll('button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        const target = e.currentTarget;
                        const id = target.getAttribute('data-id');
                        const name = target.getAttribute('data-name');
                        const country = target.getAttribute('data-country');

                        localStorage.setItem('nameProfile', name);
                        localStorage.setItem('idProfile', id);
                        localStorage.setItem('countryProfile', country);

                        window.location.href = currentRole === 'azienda' ? 'azienda.html' : 'privato.html';
                    });
                });
                
                loginSection.style.display = 'none';
                selectSection.style.display = 'block';
            }
        } catch (error) {
            optionList.innerHTML = `
                <div class="list-group-item bg-dark text-warning text-center py-4 border-0">
                    <strong class="d-block mb-1">Nessun profilo trovato</strong>
                    <p class="small text-white-50 m-0 mt-1">
                        ${error.response?.data?.error || "Impossibile connettersi al database."}
                    </p>
                </div>
            `;
            
            loginSection.style.display = 'none';
            selectSection.style.display = 'block';
        }
    });

    backButton.addEventListener('click', () => {
        selectSection.style.display = 'none';
        loginSection.style.display = 'block';
    });
});