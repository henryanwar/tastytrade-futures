document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const TASTYTRADE_API_URL = 'https://api.tastytrade.com';

    // --- DOM ELEMENTS ---
    const loginSection = document.getElementById('login-section');
    const resultsSection = document.getElementById('results-section');
    const loader = document.getElementById('loader');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    // --- DATA DISPLAY ELEMENTS ---
    const nlvDisplay = document.getElementById('nlv');
    const notionalValueDisplay = document.getElementById('notional-value');
    const leverageDisplay = document.getElementById('leverage');

    // --- FUNCTIONS ---

    // Function to format numbers as currency
    const formatCurrency = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

    // Function to handle API errors
    const handleApiError = (message) => {
        alert(`Error: ${message}`);
        loader.classList.add('hidden');
        loginSection.classList.remove('hidden');
    };
    
    // Main function to fetch and process data
    const getDashboardData = async (sessionToken) => {
        try {
            // 1. Get all accounts for the user
            const accountsResponse = await fetch(`${TASTYTRADE_API_URL}/customers/me/accounts`, {
                headers: { 'Authorization': sessionToken }
            });
            if (!accountsResponse.ok) throw new Error('Could not fetch accounts.');
            const accountsData = await accountsResponse.json();
            const primaryAccount = accountsData.data.items.find(acc => acc.authority_level === 'owner');
            if (!primaryAccount) throw new Error('Primary account not found.');
            const accountNumber = primaryAccount.account['account-number'];

            // 2. Fetch account balances to get Net Liquidating Value
            const balanceResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/balances`, {
                headers: { 'Authorization': sessionToken }
            });
            if (!balanceResponse.ok) throw new Error('Could not fetch account balance.');
            const balanceData = await balanceResponse.json();
            const netLiqValue = parseFloat(balanceData.data['net-liquidating-value']);
            nlvDisplay.textContent = formatCurrency(netLiqValue);
            
            // 3. Fetch account positions
            const positionsResponse = await fetch(`${TASTYTRADE_API_URL}/accounts/${accountNumber}/positions`, {
                headers: { 'Authorization': sessionToken }
            });
            if (!positionsResponse.ok) throw new Error('Could not fetch positions.');
            const positionsData = await positionsResponse.json();
            const futuresPositions = positionsData.data.items.filter(p => p['instrument-type'] === 'Future');

            // 4. Get live market data for the futures positions
            const symbols = futuresPositions.map(p => p.symbol);
            let totalNotionalValue = 0;

            if (symbols.length > 0) {
                const quotesResponse = await fetch(`${TASTYTRADE_API_URL}/market-metrics`, {
                    method: 'POST',
                    headers: { 'Authorization': sessionToken, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ symbols })
                });
                if (!quotesResponse.ok) throw new Error('Could not fetch market metrics for futures.');
                const quotesData = await quotesResponse.json();
                
                // 5. Calculate total notional value
                futuresPositions.forEach(position => {
                    const quote = quotesData.data.items.find(q => q.symbol === position.symbol);
                    if (quote) {
                        const price = parseFloat(quote['last-trade-price']);
                        const multiplier = parseInt(position.multiplier, 10);
                        const quantity = Math.abs(parseInt(position.quantity, 10)); // Use absolute quantity
                        totalNotionalValue += price * multiplier * quantity;
                    }
                });
            }
            
            notionalValueDisplay.textContent = formatCurrency(totalNotionalValue);

            // 6. Calculate and display leverage
            const leverage = netLiqValue > 0 ? totalNotionalValue / netLiqValue : 0;
            leverageDisplay.textContent = `${leverage.toFixed(2)}x`;

            // 7. Show the results
            loader.classList.add('hidden');
            resultsSection.classList.remove('hidden');

        } catch (error) {
            handleApiError(error.message);
        }
    };

    // Function to perform login
    const performLogin = async (loginPayload) => {
        loader.classList.remove('hidden');
        loginSection.classList.add('hidden');
        resultsSection.classList.add('hidden');

        try {
            const response = await fetch(`${TASTYTRADE_API_URL}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(loginPayload)
            });

            if (!response.ok) {
                if(response.status === 401) throw new Error('Invalid username or password.');
                throw new Error('Login failed.');
            }
            
            const data = await response.json();
            const sessionToken = data.data['session-token'];
            
            // If the login was via password, save the remember token for next time
            if (loginPayload.password) {
                const rememberToken = data.data['remember-token'];
                localStorage.setItem('tastytradeRememberToken', rememberToken);
            }

            await getDashboardData(sessionToken);

        } catch (error) {
            handleApiError(error.message);
            localStorage.removeItem('tastytradeRememberToken'); // Clear token on failure
        }
    };
    
    // --- EVENT LISTENERS ---
    
    // Login button click
    loginBtn.addEventListener('click', () => {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        if (!username || !password) {
            alert('Please enter both username and password.');
            return;
        }
        const payload = { login: username, password: password, 'remember-me': true };
        performLogin(payload);
    });

    // Logout button click
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('tastytradeRememberToken');
        resultsSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        // Clear input fields for security
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    });

    // On page load, check for a saved remember token
    const savedToken = localStorage.getItem('tastytradeRememberToken');
    if (savedToken) {
        const payload = { 'remember-token': savedToken };
        performLogin(payload);
    }
});