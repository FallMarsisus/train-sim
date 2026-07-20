// script.js

// --- VARIABLES GLOBALES ---
let trainDatabase = [];
let shopSelection = []; // Boutique du jour
let gameState = {
    money: 15000000,
    inventory: [], // Matériel possédé, non assigné
    activeComposition: [], // Sur la voie d'assemblage
    savedRames: [] // Rames finalisées
};

// --- GESTION DES ONGLETS ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    
    event.currentTarget.classList.add('active');
    document.getElementById('view-' + tabId).classList.add('active');
    
    if (tabId === 'inventaire') updateInventoryUI();
    if (tabId === 'depot') renderSavedRames();
}

// --- INITIALISATION ---
async function initGame() {
    try {
        const response = await fetch('train_empire_complet.json');
        const rawData = await response.json();
        
        trainDatabase = rawData.map(train => {
            const stats = parseLogicalStats(train);
            return { ...train, ...stats };
        });

        // Charger sauvegarde locale si existante
        const savedData = localStorage.getItem('myTrainEmpireSave');
        if (savedData) {
            let loaded = JSON.parse(savedData);
            gameState.money = loaded.money || 15000000;
            gameState.inventory = loaded.inventory || [];
            gameState.savedRames = loaded.savedRames || [];
            // Si une boutique était sauvée, on la garde, sinon on regénère
            if (loaded.shopSelection && loaded.shopSelection.length > 0) {
                shopSelection = loaded.shopSelection;
            } else {
                generateShop();
            }
        } else {
            generateShop(); // Première partie
        }

        updateMoneyUI();
        renderShop();
    } catch (error) {
        console.error(error);
        document.getElementById('shop-grid').innerHTML = "<p style='color:red;'>Erreur de chargement du JSON.</p>";
    }
}

// --- MOTEUR DE PARSING (CORRECTION BUG PLACES) ---
function parseLogicalStats(train) {
    let speed = 90;
    let capacity = 0;
    let gabarit = "Universel";

    if (train.caracteristiques) {
        train.caracteristiques.forEach(attr => {
            let text = attr.toLowerCase();
            
            // 1. Vitesse
            let speedMatch = text.match(/(\d+)\s*km\/h/);
            if (speedMatch) speed = parseInt(speedMatch[1]);
            
            // 2. Capacité - Traite les "1ère : 111 // 2nde : 275" ou "1ere : 40"
            // Explication Regex : Cherche (1ère|2nde|etc) suivi de ":" puis capture les chiffres. /g permet de trouver toutes les occurrences.
            let classRegex = /(?:1ère|1ere|2nde|2eme|2ème)\s*:\s*(\d+)/gi;
            let match;
            let foundClass = false;
            while ((match = classRegex.exec(text)) !== null) {
                capacity += parseInt(match[1]);
                foundClass = true;
            }

            // Si aucune classe spécifique n'est trouvée, on cherche un format générique "Places : 40" ou "40 places"
            if (!foundClass) {
                let placesRegex = /(?:places?\s*:\s*(\d+))|(?:(\d+)\s*places?)/gi;
                while ((match = placesRegex.exec(text)) !== null) {
                    capacity += parseInt(match[1] || match[2]);
                }
            }

            // 3. Gabarit
            if (text.includes('britannique')) gabarit = 'Britannique';
            if (text.includes('continental')) gabarit = 'Continental';
        });
    }

    let baseCost = (train.type === 'loco') ? 300000 : (train.type === 'autorail') ? 600000 : 70000;
    let finalPrice = Math.round((baseCost * Math.pow(speed/100, 2)) + (capacity * 500));
    if (finalPrice < 10000) finalPrice = 10000;

    let finalImage = (train.image_base64 && train.image_base64.startsWith('data:')) ? train.image_base64 : train.image_url;

    return { speed, capacity, gabarit, logicalPrice: finalPrice, imgResolved: finalImage };
}

// --- GESTION BOUTIQUE & ÉCONOMIE ---
function updateMoneyUI() {
    document.getElementById('player-money').innerText = gameState.money.toLocaleString('fr-FR') + " €";
    saveGame();
}

function getRandomTrains(type, count) {
    const filtered = trainDatabase.filter(t => t.type === type);
    const shuffled = filtered.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function generateShop() {
    // Sélectionne un assortiment aléatoire
    const locos = getRandomTrains('loco', 3);
    const autorails = getRandomTrains('autorail', 3);
    const voyageurs = getRandomTrains('voyageur', 8);
    const fret = getRandomTrains('fret', 8);
    
    shopSelection = [...locos, ...autorails, ...voyageurs, ...fret];
    // Mélange visuel de la boutique
    shopSelection.sort(() => 0.5 - Math.random());
    
    renderShop();
    saveGame();
}

function renderShop() {
    const shopGrid = document.getElementById('shop-grid');
    shopGrid.innerHTML = '';

    shopSelection.forEach(train => {
        const card = document.createElement('div');
        card.className = 'card';
        const canAfford = gameState.money >= train.logicalPrice;
        
        card.innerHTML = `
            <img src="${train.imgResolved}" alt="train">
            <h4>${train.nom}</h4>
            <div class="card-stats">
                ⚡ ${train.speed} km/h | 👥 ${train.capacity} pl.<br>
                🔗 ${train.gabarit}<br>
                <strong style="color:${canAfford ? '#27ae60' : '#e74c3c'}; font-size:1.1em;">
                    ${train.logicalPrice.toLocaleString('fr-FR')} €
                </strong>
            </div>
            <button class="buy-btn" onclick="buyItem('${train.nom.replace(/'/g, "\\'")}')" ${canAfford ? '' : 'disabled style="background:#bdc3c7;"'}>
                Acheter
            </button>
        `;
        shopGrid.appendChild(card);
    });
}

function buyItem(trainName) {
    const train = shopSelection.find(t => t.nom === trainName);
    if (!train) return;

    if (gameState.money >= train.logicalPrice) {
        gameState.money -= train.logicalPrice;
        
        // On donne un ID unique au composant dans l'inventaire
        let invItem = { ...train, invId: 'inv_' + Date.now() + Math.random() };
        gameState.inventory.push(invItem);
        
        updateMoneyUI();
        renderShop(); // Met à jour les boutons (grisés si plus d'argent)
        
        // Petit feedback visuel
        alert(`✅ Achat de ${train.nom} réussi ! Le matériel a été livré dans votre Inventaire.`);
    }
}

// --- GESTION INVENTAIRE & ATELIER ---
function updateInventoryUI() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    if (gameState.inventory.length === 0) {
        grid.innerHTML = '<p style="color:#7f8c8d; font-size:0.9em;">Inventaire vide. Passez par la boutique !</p>';
        return;
    }

    gameState.inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'inv-item';
        div.innerHTML = `
            <img src="${item.imgResolved}">
            <h5 title="${item.nom}">${item.nom}</h5>
            <div style="font-size:0.7em; color:#7f8c8d;">${item.type.toUpperCase()}</div>
            <button onclick="moveToWorkshop('${item.invId}')">🔧 Assembler</button>
        `;
        grid.appendChild(div);
    });
}

function moveToWorkshop(invId) {
    const index = gameState.inventory.findIndex(i => i.invId === invId);
    if (index > -1) {
        const item = gameState.inventory.splice(index, 1)[0];
        gameState.activeComposition.push(item);
        updateInventoryUI();
        updateCompositionUI();
    }
}

function removeFromWorkshop(invId) {
    const index = gameState.activeComposition.findIndex(i => i.invId === invId);
    if (index > -1) {
        const item = gameState.activeComposition.splice(index, 1)[0];
        gameState.inventory.push(item);
        updateInventoryUI();
        updateCompositionUI();
    }
}

function clearActiveComposition() {
    // Ramène tout dans l'inventaire
    gameState.inventory.push(...gameState.activeComposition);
    gameState.activeComposition = [];
    updateInventoryUI();
    updateCompositionUI();
}

function updateCompositionUI() {
    const container = document.getElementById('active-composition');
    const logicBox = document.getElementById('logic-box');
    const saveBtn = document.getElementById('btn-save-rame');
    container.innerHTML = '';

    if (gameState.activeComposition.length === 0) {
        container.innerHTML = '<p style="color: #ccc; margin: auto;">Glissez du matériel depuis l\'inventaire.</p>';
        document.getElementById('comp-cost').innerText = "0 €";
        document.getElementById('comp-speed').innerText = "0 km/h";
        document.getElementById('comp-capacity').innerText = "0 places";
        document.getElementById('comp-gabarit').innerText = "-";
        logicBox.style.display = 'none';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        return;
    }

    let totalCost = 0; let totalCapacity = 0; let speeds = []; let gabarits = new Set();
    let hasMotor = false;

    gameState.activeComposition.forEach(item => {
        totalCost += item.logicalPrice;
        totalCapacity += item.capacity;
        speeds.push(item.speed);
        if(item.gabarit !== "Universel") gabarits.add(item.gabarit);
        if (item.type === 'loco' || item.type === 'autorail') hasMotor = true;

        const div = document.createElement('div');
        div.className = 'comp-item';
        div.innerHTML = `
            <button class="remove-btn" onclick="removeFromWorkshop('${item.invId}')">✕</button>
            <img src="${item.imgResolved}">
            <span title="${item.nom}">${item.nom}</span>
        `;
        container.appendChild(div);
    });

    document.getElementById('comp-cost').innerText = totalCost.toLocaleString() + " €";
    document.getElementById('comp-speed').innerText = Math.min(...speeds) + " km/h";
    document.getElementById('comp-capacity').innerText = totalCapacity + " places";
    
    let mainGabarit = gabarits.size > 0 ? Array.from(gabarits).join(' & ') : "Universel";
    document.getElementById('comp-gabarit').innerText = mainGabarit;

    // VALIDATION
    logicBox.style.display = 'block';
    logicBox.className = 'logic-alert'; 
    let canSave = true;

    if (gabarits.size > 1) {
        logicBox.classList.add('logic-error');
        logicBox.innerHTML = `❌ Erreur d'attelage : Mélange de gabarits (${mainGabarit}).`;
        canSave = false;
    } else if (!hasMotor) {
        logicBox.classList.add('logic-error');
        logicBox.innerHTML = `❌ Erreur : Convoi sans motrice (Loco ou Autorail).`;
        canSave = false;
    } else {
        logicBox.classList.add('logic-ok');
        logicBox.innerHTML = `✅ Composition validée. Prêt pour le service.`;
    }

    saveBtn.disabled = !canSave;
    saveBtn.style.opacity = canSave ? '1' : '0.5';
    
    saveGame();
}

// --- DÉPÔT ---
function saveActiveRame() {
    const name = prompt("Nom de baptême de cette rame :", "Express " + Math.floor(Math.random()*1000));
    if (!name) return;

    const nouvelleRame = {
        id: 'rame_' + Date.now(),
        nom: name,
        elements: [...gameState.activeComposition], // On clone le tableau
        stats: {
            cout: document.getElementById('comp-cost').innerText,
            vitesse: document.getElementById('comp-speed').innerText,
            places: document.getElementById('comp-capacity').innerText
        }
    };

    gameState.savedRames.push(nouvelleRame);
    gameState.activeComposition = []; // On vide l'atelier
    
    saveGame();
    updateInventoryUI();
    updateCompositionUI();
    switchTab('depot');
}

function disassembleRame(id) {
    if (confirm("Démanteler cette rame ? Ses composants retourneront dans votre inventaire.")) {
        const index = gameState.savedRames.findIndex(r => r.id === id);
        if (index > -1) {
            const rame = gameState.savedRames.splice(index, 1)[0];
            // Rendre les éléments à l'inventaire
            gameState.inventory.push(...rame.elements);
            
            saveGame();
            renderSavedRames();
        }
    }
}

function renderSavedRames() {
    const container = document.getElementById('saved-rames-container');
    container.innerHTML = '';

    if (gameState.savedRames.length === 0) {
        container.innerHTML = '<p style="color: #7f8c8d; text-align: center;">Dépôt vide.</p>';
        return;
    }

    gameState.savedRames.forEach(rame => {
        const div = document.createElement('div');
        div.className = 'saved-rame';
        
        let visualHtml = rame.elements.map(el => `<img src="${el.imgResolved}" title="${el.nom}">`).join('<span class="coupler">-</span>');

        div.innerHTML = `
            <div class="rame-header">
                <strong style="font-size: 1.2em; color: #2c3e50;">🚆 ${rame.nom}</strong>
                <button onclick="disassembleRame('${rame.id}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Démanteler</button>
            </div>
            <div style="font-size: 0.9em; margin-bottom: 10px; color: #7f8c8d;">
                Val: ${rame.stats.cout} | Max: ${rame.stats.vitesse} | Capa: ${rame.stats.places}
            </div>
            <div class="rame-visualizer">
                ${visualHtml}
            </div>
        `;
        container.appendChild(div);
    });
}

// --- SYSTÈME DE SAUVEGARDE GLOBALE ---
function saveGame() {
    // Sauvegarde l'état complet dans le localStorage
    let stateToSave = {
        money: gameState.money,
        inventory: gameState.inventory,
        savedRames: gameState.savedRames,
        shopSelection: shopSelection
    };
    localStorage.setItem('myTrainEmpireSave', JSON.stringify(stateToSave));
}

function exportGameData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('myTrainEmpireSave'));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", "train_empire_save.json");
    dlAnchor.click();
}

function importGameData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            localStorage.setItem('myTrainEmpireSave', e.target.result);
            location.reload(); // On rafraîchit la page pour tout recharger proprement
        } catch(err) { alert("Fichier invalide."); }
    };
    reader.readAsText(file);
}

window.onload = initGame;