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
        const savedData = localStorage.getItem('myTrainEmpireSavePro');
        if (savedData) {
            let loaded = JSON.parse(savedData);
            gameState.money = loaded.money || 15000000;
            gameState.inventory = loaded.inventory || [];
            gameState.savedRames = loaded.savedRames || [];
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
        document.getElementById('shop-container').innerHTML = "<p style='color:red;'>Erreur de chargement du JSON.</p>";
    }
}

// --- MOTEUR DE PARSING AVANCÉ ---
function parseLogicalStats(train) {
    let speed = 90;
    let capacity1 = 0;
    let capacity2 = 0;
    let capacityTotal = 0; // Pour les places non classifiées
    let gabarit = "Universel";

    if (train.caracteristiques) {
        train.caracteristiques.forEach(attr => {
            let text = attr.toLowerCase();
            
            // 1. Vitesse
            let speedMatch = text.match(/(\d+)\s*km\/h/);
            if (speedMatch) speed = parseInt(speedMatch[1]);
            
            // 2. Capacité 1ère classe
            let class1Regex = /(?:1ère|1ere)\s*:\s*(\d+)/gi;
            let match1;
            while ((match1 = class1Regex.exec(text)) !== null) {
                capacity1 += parseInt(match1[1]);
            }

            // 3. Capacité 2nde classe
            let class2Regex = /(?:2nde|2eme|2ème|2nd)\s*:\s*(\d+)/gi;
            let match2;
            while ((match2 = class2Regex.exec(text)) !== null) {
                capacity2 += parseInt(match2[1]);
            }

            // 4. Capacité générique (seulement si aucune classe trouvée)
            if (capacity1 === 0 && capacity2 === 0) {
                let placesRegex = /(?:places?\s*:\s*(\d+))|(?:(\d+)\s*places?)/gi;
                let matchGen;
                while ((matchGen = placesRegex.exec(text)) !== null) {
                    capacityTotal += parseInt(matchGen[1] || matchGen[2]);
                }
            }

            // 5. Gabarit
            if (text.includes('britannique')) gabarit = 'Britannique';
            if (text.includes('continental')) gabarit = 'Continental';
        });
    }

    let sumSeats = capacity1 + capacity2 + capacityTotal;
    let baseCost = (train.type === 'loco') ? 300000 : (train.type === 'autorail') ? 600000 : 70000;
    let finalPrice = Math.round((baseCost * Math.pow(speed/100, 2)) + (sumSeats * 500));
    if (finalPrice < 10000) finalPrice = 10000;

    let finalImage = (train.image_base64 && train.image_base64.startsWith('data:')) ? train.image_base64 : train.image_url;

    return { 
        speed, 
        capacity1, 
        capacity2, 
        capacityTotal, 
        gabarit, 
        logicalPrice: finalPrice, 
        imgResolved: finalImage 
    };
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
    // Génère le shop SANS le fret
    const locos = getRandomTrains('loco', 6);
    const autorails = getRandomTrains('autorail', 6);
    const voyageurs = getRandomTrains('voyageur', 12);
    
    shopSelection = [...locos, ...autorails, ...voyageurs];
    
    renderShop();
    saveGame();
}

function renderShop() {
    const shopContainer = document.getElementById('shop-container');
    shopContainer.innerHTML = '';

    const categories = [
        { id: 'loco', title: 'Locomotives' },
        { id: 'autorail', title: 'Rames & Automotrices' },
        { id: 'voyageur', title: 'Voitures Voyageurs' }
    ];

    categories.forEach(cat => {
        const items = shopSelection.filter(t => t.type === cat.id);
        if (items.length === 0) return;

        const section = document.createElement('div');
        section.innerHTML = `<h3 class="category-title">${cat.title}</h3>`;
        const grid = document.createElement('div');
        grid.className = 'grid';

        items.forEach(train => {
            const card = document.createElement('div');
            card.className = 'card';
            const canAfford = gameState.money >= train.logicalPrice;
            
            // Formatage propre des places
            let placesStr = [];
            if (train.capacity1 > 0) placesStr.push(`1ère: ${train.capacity1}`);
            if (train.capacity2 > 0) placesStr.push(`2nde: ${train.capacity2}`);
            if (train.capacityTotal > 0) placesStr.push(`Std: ${train.capacityTotal}`);
            if (placesStr.length === 0) placesStr.push('Aucune place');

            card.innerHTML = `
                <img src="${train.imgResolved}" alt="train">
                <h4>${train.nom}</h4>
                <div class="card-stats">
                    ⚡ ${train.speed} km/h<br>
                    👥 ${placesStr.join(' | ')}<br>
                    🔗 ${train.gabarit}<br>
                    <strong style="color:${canAfford ? '#27ae60' : '#e74c3c'}; font-size:1.1em; display:block; margin-top:5px;">
                        ${train.logicalPrice.toLocaleString('fr-FR')} €
                    </strong>
                </div>
                <button class="buy-btn" onclick="buyItem('${train.nom.replace(/'/g, "\\'")}')" ${canAfford ? '' : 'disabled'}>
                    Acheter
                </button>
            `;
            grid.appendChild(card);
        });
        
        section.appendChild(grid);
        shopContainer.appendChild(section);
    });
}

function buyItem(trainName) {
    const train = shopSelection.find(t => t.nom === trainName);
    if (!train) return;

    if (gameState.money >= train.logicalPrice) {
        gameState.money -= train.logicalPrice;
        let invItem = { ...train, invId: 'inv_' + Date.now() + Math.random() };
        gameState.inventory.push(invItem);
        
        updateMoneyUI();
        renderShop();
    }
}

// --- GESTION INVENTAIRE & ATELIER ---
function updateInventoryUI() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';

    if (gameState.inventory.length === 0) {
        grid.innerHTML = '<p style="color:#7f8c8d; font-size:0.9em; grid-column:1/-1;">Inventaire vide. Passez par la boutique !</p>';
        return;
    }

    gameState.inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'inv-item';
        div.innerHTML = `
            <img src="${item.imgResolved}">
            <h5 title="${item.nom}">${item.nom}</h5>
            <div style="font-size:0.7em; color:#7f8c8d; margin-bottom:5px;">${item.type.toUpperCase()}</div>
            <button onclick="moveToWorkshop('${item.invId}')">🔧 Placer</button>
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

    let totalCost = 0; 
    let cap1 = 0; let cap2 = 0; let capTotal = 0; 
    let speeds = []; let gabarits = new Set();
    let hasMotor = false;

    gameState.activeComposition.forEach(item => {
        totalCost += item.logicalPrice;
        cap1 += item.capacity1;
        cap2 += item.capacity2;
        capTotal += item.capacityTotal;
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
    
    // Affichage formaté des places pour l'atelier
    let placesStr = [];
    if (cap1 > 0) placesStr.push(`1ère: ${cap1}`);
    if (cap2 > 0) placesStr.push(`2nde: ${cap2}`);
    if (capTotal > 0) placesStr.push(`Std: ${capTotal}`);
    if (placesStr.length === 0) placesStr.push("0 pl.");
    document.getElementById('comp-capacity').innerText = placesStr.join(' | ');
    
    let mainGabarit = gabarits.size > 0 ? Array.from(gabarits).join(' & ') : "Universel";
    document.getElementById('comp-gabarit').innerText = mainGabarit;

    // VALIDATION LOGIQUE
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
        elements: [...gameState.activeComposition], 
        stats: {
            cout: document.getElementById('comp-cost').innerText,
            vitesse: document.getElementById('comp-speed').innerText,
            places: document.getElementById('comp-capacity').innerText
        }
    };

    gameState.savedRames.push(nouvelleRame);
    gameState.activeComposition = []; 
    
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
                Val: ${rame.stats.cout} | Max: ${rame.stats.vitesse} | 👥 ${rame.stats.places}
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
    let stateToSave = {
        money: gameState.money,
        inventory: gameState.inventory,
        savedRames: gameState.savedRames,
        shopSelection: shopSelection
    };
    localStorage.setItem('myTrainEmpireSavePro', JSON.stringify(stateToSave));
}

function exportGameData() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(localStorage.getItem('myTrainEmpireSavePro'));
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
            localStorage.setItem('myTrainEmpireSavePro', e.target.result);
            location.reload(); 
        } catch(err) { alert("Fichier invalide."); }
    };
    reader.readAsText(file);
}

window.onload = initGame;

// --- MODULE CARTE ET ROUTAGE ---
let map = null;
let markersLayer = null;
let routesLayer = null;

let selectedDepart = null;
let selectedArrivee = null;

// On intercepte le changement d'onglet pour initialiser la carte uniquement quand elle est visible
const originalSwitchTab = switchTab;
switchTab = function(tabId) {
    originalSwitchTab(tabId);
    
    if (tabId === 'carte') {
        initMap();
        updateRameSelector();
        renderActiveRoutes();
    }
};

function initMap() {
    if (map !== null) {
        map.invalidateSize();
        return;
    }

    // Création de la carte centrée sur la France
    map = L.map('map').setView([46.603354, 1.888334], 6);

    // 1. Couche de base (Fond de carte clair pour bien voir les rails)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO',
        maxZoom: 19
    }).addTo(map);

    // 2. LA MAGIE : Couche OpenRailwayMap superposée !
    L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
        attribution: 'Données ferroviaires © OpenRailwayMap',
        maxZoom: 19,
        opacity: 0.8 // Légèrement transparent pour voir les villes en dessous
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    routesLayer = L.layerGroup().addTo(map);

    fetchGaresSNCF();
}

async function fetchGaresSNCF() {
    // API Open Data SNCF - On récupère les Gares de Voyageurs (Limité à 100 pour la fluidité de l'exemple, trié par importance)
    // Le segment "TGV" dans les filtres permet de cibler les grandes gares
    const url = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/referentiel-gares-voyageurs/records?limit=100&refine=segment_drg%3A%22a%22";
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        data.results.forEach(gare => {
            // Certaines gares n'ont pas de coordonnées dans l'API, on les saute
            if (!gare.wgs_84) return;
            
            const lat = gare.wgs_84.lat;
            const lon = gare.wgs_84.lon;
            const nomGare = gare.gare_alias_libelle_noncontraint;

            // Icône personnalisée pour les gares
            const stationIcon = L.divIcon({
                html: '🚉',
                className: 'station-icon',
                iconSize: [20, 20]
            });

            const marker = L.marker([lat, lon], { icon: stationIcon }).addTo(markersLayer);
            marker.bindTooltip(nomGare);
            
            marker.on('click', () => handleStationClick(nomGare, lat, lon));
        });
    } catch (e) {
        console.error("Erreur de récupération des gares:", e);
    }
}

function handleStationClick(nom, lat, lon) {
    if (!selectedDepart) {
        selectedDepart = { nom, lat, lon };
        document.getElementById('lbl-depart').innerText = nom;
        document.getElementById('lbl-depart').style.color = '#27ae60';
    } else if (!selectedArrivee && nom !== selectedDepart.nom) {
        selectedArrivee = { nom, lat, lon };
        document.getElementById('lbl-arrivee').innerText = nom;
        document.getElementById('lbl-arrivee').style.color = '#27ae60';
        
        // Trace une ligne de prévisualisation (vol d'oiseau)
        const latlngs = [
            [selectedDepart.lat, selectedDepart.lon],
            [selectedArrivee.lat, selectedArrivee.lon]
        ];
        L.polyline(latlngs, {color: '#f39c12', dashArray: '5, 10'}).addTo(routesLayer);
    } else {
        // Reset si on clique une 3ème fois
        selectedDepart = { nom, lat, lon };
        selectedArrivee = null;
        routesLayer.clearLayers();
        document.getElementById('lbl-depart').innerText = nom;
        document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-arrivee').style.color = '#e74c3c';
    }
}

function updateRameSelector() {
    const select = document.getElementById('select-rame');
    select.innerHTML = '<option value="">-- Choisissez une rame au dépôt --</option>';
    
    gameState.savedRames.forEach(rame => {
        // On pourrait vérifier si la rame n'est pas DÉJÀ affectée
        const option = document.createElement('option');
        option.value = rame.id;
        option.innerText = rame.nom + " (" + rame.stats.vitesse + ")";
        select.appendChild(option);
    });
}

function planifierTrajet() {
    const rameId = document.getElementById('select-rame').value;
    const time = document.getElementById('time-depart').value;

    if (!rameId || !selectedDepart || !selectedArrivee || !time) {
        alert("Veuillez remplir tous les champs (Rame, Départ, Arrivée, Heure).");
        return;
    }

    const rame = gameState.savedRames.find(r => r.id === rameId);

    // Calcul de la distance à vol d'oiseau (en km)
    const distance = map.distance(
        [selectedDepart.lat, selectedDepart.lon], 
        [selectedArrivee.lat, selectedArrivee.lon]
    ) / 1000;

    // Calcul du temps de trajet estimé (Vitesse max de la rame * 0.7 pour simuler l'accélération/freinage)
    const speedKmh = parseInt(rame.stats.vitesse) * 0.7;
    const dureeHeures = distance / speedKmh;
    
    const departDate = new Date(`1970-01-01T${time}:00`);
    const arriveeDate = new Date(departDate.getTime() + (dureeHeures * 60 * 60 * 1000));
    
    const timeArrivee = arriveeDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});

    // Enregistrement dans le State (à rajouter dans gameState pour les sauvegardes futures)
    if(!gameState.activeRoutes) gameState.activeRoutes = [];
    
    const routeInfo = {
        rameNom: rame.nom,
        departNom: selectedDepart.nom,
        arriveeNom: selectedArrivee.nom,
        heureDepart: time,
        heureArrivee: timeArrivee,
        distance: Math.round(distance),
        path: [
            [selectedDepart.lat, selectedDepart.lon],
            [selectedArrivee.lat, selectedArrivee.lon]
        ]
    };
    
    gameState.activeRoutes.push(routeInfo);
    saveGame();
    
    // Trace la ligne définitive en bleu
    L.polyline(routeInfo.path, {color: '#3498db', weight: 4}).addTo(routesLayer);
    
    // Reset l'UI
    selectedDepart = null;
    selectedArrivee = null;
    document.getElementById('lbl-depart').innerText = "Cliquez sur une gare";
    document.getElementById('lbl-depart').style.color = '#e74c3c';
    document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
    document.getElementById('lbl-arrivee').style.color = '#e74c3c';
    document.getElementById('select-rame').value = "";
    
    renderActiveRoutes();
    alert(`Trajet validé ! Arrivée estimée à ${timeArrivee}.`);
}

function renderActiveRoutes() {
    const list = document.getElementById('active-routes-list');
    list.innerHTML = '';

    if (!gameState.activeRoutes || gameState.activeRoutes.length === 0) {
        list.innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucun train en circulation.</p>';
        return;
    }

    gameState.activeRoutes.forEach((route, index) => {
        const div = document.createElement('div');
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #eee";
        div.innerHTML = `
            <strong style="color: #2c3e50;">🚆 ${route.rameNom}</strong><br>
            <span style="color: #27ae60;">${route.heureDepart}</span> ${route.departNom}<br>
            <span style="color: #e74c3c;">${route.heureArrivee}</span> ${route.arriveeNom}<br>
            <small style="color: #7f8c8d;">Distance : ${route.distance} km</small>
        `;
        list.appendChild(div);
        
        // Retracer la ligne au chargement de l'onglet si besoin
        L.polyline(route.path, {color: '#3498db', weight: 4}).addTo(routesLayer);
    });
}