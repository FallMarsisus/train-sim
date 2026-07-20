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
let sncfStations = []; // Stockage global des gares pour les calculs de passage

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

    map = L.map('map').setView([46.603354, 1.888334], 6);

    // Fond de carte clair
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Couche OpenRailwayMap
    L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
        attribution: '© OpenRailwayMap',
        maxZoom: 19,
        opacity: 0.8
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    routesLayer = L.layerGroup().addTo(map);

    fetchGaresSNCF();
}

async function fetchGaresSNCF() {
    // 1. Liste de secours (Fallback) pour garantir que le jeu fonctionne même si l'API SNCF est hors-ligne
    const garesSecours = [
        { nom: "Paris Gare de Lyon", lat: 48.8443, lon: 2.3744 },
        { nom: "Paris Montparnasse", lat: 48.8412, lon: 2.3205 },
        { nom: "Paris Gare du Nord", lat: 48.8809, lon: 2.3553 },
        { nom: "Lyon Part-Dieu", lat: 45.7606, lon: 4.8595 },
        { nom: "Marseille Saint-Charles", lat: 43.3026, lon: 5.3804 },
        { nom: "Lille Europe", lat: 50.6394, lon: 3.0750 },
        { nom: "Bordeaux Saint-Jean", lat: 44.8259, lon: -0.5548 },
        { nom: "Strasbourg", lat: 48.5851, lon: 7.7342 },
        { nom: "Nantes", lat: 47.2173, lon: -1.5414 },
        { nom: "Rennes", lat: 48.1033, lon: -1.6724 },
        { nom: "Toulouse Matabiau", lat: 43.6111, lon: 1.4536 },
        { nom: "Montpellier Saint-Roch", lat: 43.6045, lon: 3.8805 },
        { nom: "Nice Ville", lat: 43.7044, lon: 7.2619 },
        { nom: "Dijon Ville", lat: 47.3236, lon: 5.0275 },
        { nom: "Tours", lat: 47.3898, lon: 0.6938 },
        { nom: "Genève Cornavin (CH)", lat: 46.2102, lon: 6.1424 }
    ];

    // Nouvelle URL de l'API (liste-des-gares)
    const url = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/liste-des-gares/records?limit=100";
    
    sncfStations = []; // On réinitialise la mémoire

    try {
        const response = await fetch(url);
        
        // Si la SNCF renvoie une erreur 404, 500, etc., on déclenche le catch
        if (!response.ok) {
            throw new Error(`Le serveur SNCF a répondu avec le statut ${response.status}`);
        }

        const data = await response.json();
        
        // La nouvelle API SNCF stocke parfois dans "results", parfois dans "records"
        const tableauGares = data.results || data.records;

        if (!tableauGares) {
            throw new Error("Structure des données SNCF non reconnue.");
        }

        tableauGares.forEach(gare => {
            // Tolérance sur le nom des propriétés géospatiales qui changent souvent
            const coords = gare.wgs_84 || gare.geo_point_2d || gare.coordonnees_geographiques;
            if (!coords) return;
            
            const lat = coords.lat !== undefined ? coords.lat : coords[0];
            const lon = coords.lon !== undefined ? coords.lon : coords[1];
            const nomGare = gare.libelle || gare.gare_alias_libelle_noncontraint;

            if (nomGare && lat && lon) {
                sncfStations.push({ nom: nomGare, lat: parseFloat(lat), lon: parseFloat(lon) });
            }
        });

    } catch (e) {
        console.warn("⚠️ API SNCF indisponible. Chargement des gares de secours locales. Raison :", e.message);
        // On copie la liste de secours dans la liste officielle du jeu
        sncfStations = [...garesSecours];
    }

    // --- AFFICHAGE SUR LA CARTE ---
    // Cette partie s'exécute quoi qu'il arrive, en utilisant soit les vraies données, soit la liste de secours
    sncfStations.forEach(gare => {
        const stationIcon = L.divIcon({ html: '🚉', className: 'station-icon', iconSize: [20, 20] });
        const marker = L.marker([gare.lat, gare.lon], { icon: stationIcon }).addTo(markersLayer);
        
        marker.bindTooltip(gare.nom);
        marker.on('click', () => handleStationClick(gare.nom, gare.lat, gare.lon));
    });
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
    } else {
        selectedDepart = { nom, lat, lon };
        selectedArrivee = null;
        routesLayer.clearLayers(); // Efface les anciennes routes
        document.getElementById('lbl-depart').innerText = nom;
        document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-arrivee').style.color = '#e74c3c';
    }
}

function updateRameSelector() {
    const select = document.getElementById('select-rame');
    select.innerHTML = '<option value="">-- Choisissez une rame au dépôt --</option>';
    
    gameState.savedRames.forEach(rame => {
        const option = document.createElement('option');
        option.value = rame.id;
        option.innerText = `${rame.nom} (Max: ${rame.stats.vitesse})`;
        select.appendChild(option);
    });
}

// Fonction asynchrone pour interroger le moteur de routage
async function planifierTrajet() {
    const rameId = document.getElementById('select-rame').value;
    const time = document.getElementById('time-depart').value;

    if (!rameId || !selectedDepart || !selectedArrivee || !time) {
        return alert("Veuillez remplir tous les champs (Rame, Départ, Arrivée, Heure).");
    }

    const rame = gameState.savedRames.find(r => r.id === rameId);
    const vitesseTrain = parseInt(rame.stats.vitesse);
    
    // UI Feedback pendant le calcul
    const btn = document.querySelector('#view-carte .action-btn');
    btn.innerText = "Calcul du tracé en cours...";
    btn.disabled = true;

    try {
        // API BRouter avec profil ferroviaire (rail)
        const brouterUrl = `https://brouter.de/brouter?lonlats=${selectedDepart.lon},${selectedDepart.lat}|${selectedArrivee.lon},${selectedArrivee.lat}&profile=rail&alternativeidx=0&format=geojson`;
        
        const response = await fetch(brouterUrl);
        const geojson = await response.json();
        
        // Extraction des données de BRouter
        const properties = geojson.features[0].properties;
        const coords = geojson.features[0].geometry.coordinates;
        
        // Inversion [lon, lat] vers [lat, lon] pour Leaflet
        const latlngs = coords.map(c => [c[1], c[0]]);
        
        // Distance réelle sur les rails
        const distanceKm = properties['track-length'] / 1000;
        
        // Temps estimé par la voie (prend en compte les limitations de vitesse de la ligne)
        const tempsVoieSecondes = properties['total-time']; 
        
        // Temps théorique si le train roulait à sa V-MAX constante
        const tempsTrainSecondes = (distanceKm / vitesseTrain) * 3600;
        
        // La réalité : le train ne peut pas aller plus vite que la voie, et la voie ne peut pas faire aller le train plus vite que son moteur.
        const tempsFinalSecondes = Math.max(tempsVoieSecondes, tempsTrainSecondes) * 1.1; // +10% de marge (freinage/accélération)
        
        // Calcul des Heures
        const departDate = new Date(`1970-01-01T${time}:00`);
        const arriveeDate = new Date(departDate.getTime() + (tempsFinalSecondes * 1000));
        const timeArrivee = arriveeDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});

        // ALGORITHME DE DÉTECTION DES GARES TRAVERSÉES
        let stationsTraversees = [];
        sncfStations.forEach(gare => {
            if (gare.nom === selectedDepart.nom || gare.nom === selectedArrivee.nom) return;
            
            // On vérifie si la gare se trouve à proximité immédiate (env. 2km) d'un point du tracé
            for(let i = 0; i < latlngs.length; i += 5) { // On check un point sur 5 pour l'optimisation
                let dLat = Math.abs(gare.lat - latlngs[i][0]);
                let dLon = Math.abs(gare.lon - latlngs[i][1]);
                if (dLat < 0.02 && dLon < 0.02) { 
                    stationsTraversees.push(gare.nom);
                    break; 
                }
            }
        });

        // Enregistrement
        if(!gameState.activeRoutes) gameState.activeRoutes = [];
        
        const routeInfo = {
            rameNom: rame.nom,
            departNom: selectedDepart.nom,
            arriveeNom: selectedArrivee.nom,
            heureDepart: time,
            heureArrivee: timeArrivee,
            distance: Math.round(distanceKm),
            stations: stationsTraversees,
            path: latlngs // Tracé exact
        };
        
        gameState.activeRoutes.push(routeInfo);
        saveGame();
        
        // Tracé et reset UI
        routesLayer.clearLayers(); // On nettoie avant de tracer la nouvelle
        L.polyline(latlngs, {color: '#e74c3c', weight: 5, opacity: 0.8}).addTo(routesLayer);
        
        selectedDepart = null;
        selectedArrivee = null;
        document.getElementById('lbl-depart').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-depart').style.color = '#e74c3c';
        document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-arrivee').style.color = '#e74c3c';
        
        renderActiveRoutes();
        
    } catch(err) {
        console.error(err);
        alert("Erreur lors du calcul du tracé. La liaison ferroviaire est peut-être inexistante.");
    } finally {
        btn.innerText = "Valider l'itinéraire";
        btn.disabled = false;
    }
}

function renderActiveRoutes() {
    const list = document.getElementById('active-routes-list');
    list.innerHTML = '';

    if (!gameState.activeRoutes || gameState.activeRoutes.length === 0) {
        list.innerHTML = '<p style="color: #7f8c8d; font-style: italic;">Aucun train en circulation.</p>';
        return;
    }

    // On re-trace toutes les routes enregistrées sur la carte
    routesLayer.clearLayers();

    gameState.activeRoutes.forEach((route) => {
        const div = document.createElement('div');
        div.style.padding = "10px";
        div.style.borderBottom = "1px solid #eee";
        div.style.backgroundColor = "#fff";
        div.style.marginBottom = "5px";
        div.style.borderRadius = "4px";
        
        let stationsHtml = route.stations && route.stations.length > 0 
            ? `<br><small style="color: #f39c12;">Passage par : ${route.stations.join(', ')}</small>` 
            : '';

        div.innerHTML = `
            <strong style="color: #2c3e50;">🚆 ${route.rameNom}</strong><br>
            <span style="color: #27ae60;">${route.heureDepart}</span> ${route.departNom}<br>
            <span style="color: #e74c3c;">${route.heureArrivee}</span> ${route.arriveeNom}<br>
            <small style="color: #7f8c8d;">Voie : ${route.distance} km</small>
            ${stationsHtml}
        `;
        list.appendChild(div);
        
        // Tracer la ligne exacte
        L.polyline(route.path, {color: '#3498db', weight: 4, opacity: 0.7}).addTo(routesLayer);
    });
}