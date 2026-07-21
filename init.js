// init.js - game initialization
async function initGame() {
    try {
        const response = await fetch('train_empire_complet.json');
        const rawData = await response.json();
        
        trainDatabase = rawData.map(train => {
            const stats = parseLogicalStats(train);
            return { ...train, ...stats };
        });

        const savedData = localStorage.getItem('myTrainEmpireSavePro');
        if (savedData) {
            let loaded = JSON.parse(savedData);
            gameState.money = loaded.money || 15000000;
            gameState.inventory = loaded.inventory || [];
            gameState.savedRames = (loaded.savedRames || []).map(rame => ({
                ...rame,
                currentStationId: rame.currentStationId || null,
                currentStationNom: rame.currentStationNom || null
            }));
            gameState.activeRoutes = (loaded.activeRoutes || []).map(route => ({
                ...route,
                id: route.id || `route_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                progress: Number.isFinite(route.progress) ? route.progress : 0,
                startedAtMs: route.startedAtMs || Date.now(),
                totalDurationSec: route.totalDurationSec || Math.max(60, ((route.distance || 10) / 100) * 3600)
            }));
            if (loaded.shopSelection && loaded.shopSelection.length > 0) {
                shopSelection = loaded.shopSelection;
            } else {
                generateShop();
            }
        } else {
            generateShop();
        }

        updateMoneyUI();
        renderShop();
    } catch (error) {
        console.error(error);
        const sc = document.getElementById('shop-container');
        if (sc) sc.innerHTML = "<p style='color:red;'>Erreur de chargement du JSON.</p>";
    }
}

window.onload = initGame;
