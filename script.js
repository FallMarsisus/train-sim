// script.js

// --- VARIABLES GLOBALES ---
let trainDatabase = [];
let shopSelection = []; // Boutique du jour
let gameState = {
    money: 15000000,
    inventory: [], // Matériel possédé, non assigné
    activeComposition: [], // Sur la voie d'assemblage
    savedRames: [], // Rames finalisées
    activeRoutes: []
};

// --- GESTION DES ONGLETS ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    
    event.currentTarget.classList.add('active');
    document.getElementById('view-' + tabId).classList.add('active');
    
    if (tabId === 'inventaire') updateInventoryUI();
    if (tabId === 'depot') renderSavedRames();
    if (tabId === 'carte') {
        initMap();
        populateRameSelect();
        renderActiveRoutes();
        setTimeout(() => map && map.invalidateSize(), 150);
    }
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
            gameState.activeRoutes = loaded.activeRoutes || [];
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
            
            let speedMatch = text.match(/(\d+)\s*km\/h/);
            if (speedMatch) speed = parseInt(speedMatch[1]);
            
            let class1Regex = /(?:1ère|1ere)\s*:\s*(\d+)/gi;
            let match1;
            while ((match1 = class1Regex.exec(text)) !== null) {
                capacity1 += parseInt(match1[1]);
            }

            let class2Regex = /(?:2nde|2eme|2ème|2nd)\s*:\s*(\d+)/gi;
            let match2;
            while ((match2 = class2Regex.exec(text)) !== null) {
                capacity2 += parseInt(match2[1]);
            }

            if (capacity1 === 0 && capacity2 === 0) {
                let placesRegex = /(?:places?\s*:\s*(\d+))|(?:(\d+)\s*places?)/gi;
                let matchGen;
                while ((matchGen = placesRegex.exec(text)) !== null) {
                    capacityTotal += parseInt(matchGen[1] || matchGen[2]);
                }
            }

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
    
    let placesStr = [];
    if (cap1 > 0) placesStr.push(`1ère: ${cap1}`);
    if (cap2 > 0) placesStr.push(`2nde: ${cap2}`);
    if (capTotal > 0) placesStr.push(`Std: ${capTotal}`);
    if (placesStr.length === 0) placesStr.push("0 pl.");
    document.getElementById('comp-capacity').innerText = placesStr.join(' | ');
    
    let mainGabarit = gabarits.size > 0 ? Array.from(gabarits).join(' & ') : "Universel";
    document.getElementById('comp-gabarit').innerText = mainGabarit;

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

function populateRameSelect() {
    const select = document.getElementById('select-rame');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choisissez une rame au dépôt --</option>';
    gameState.savedRames.forEach(rame => {
        const opt = document.createElement('option');
        opt.value = rame.id;
        opt.textContent = rame.nom;
        select.appendChild(opt);
    });
}

function renderActiveRoutes() {
    const container = document.getElementById('active-routes-list');
    if (!container) return;

    if (!gameState.activeRoutes || gameState.activeRoutes.length === 0) {
        container.innerHTML = '<p style="color:#7f8c8d; font-style: italic;">Aucun train en circulation.</p>';
        return;
    }

    container.innerHTML = gameState.activeRoutes.map(route => `
        <div style="background:#f8f9fa; border:1px solid #ddd; border-radius:6px; padding:10px; margin-bottom:10px;">
            <strong>${route.rameNom}</strong><br>
            ${route.departNom} → ${route.arriveeNom}<br>
            ${(route.intermediateStops && route.intermediateStops.length) ? `Arrêts: ${route.intermediateStops.join(' • ')}<br>` : ''}
            ${route.heureDepart} - ${route.heureArrivee}<br>
            ${route.distance} km
        </div>
    `).join('');
}

// --- SYSTÈME DE SAUVEGARDE GLOBALE ---
function saveGame() {
    let stateToSave = {
        money: gameState.money,
        inventory: gameState.inventory,
        savedRames: gameState.savedRames,
        activeRoutes: gameState.activeRoutes,
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

// --- CARTE & ROUTAGE ---
let map = null, markersLayer = null, routesLayer = null, networkLayer = null;
let sncfStations = [];
let selectedDepart = null, selectedArrivee = null;
let networkFeatures = [];
let visibleStationMarkers = new Map();
let visibleLineLayers = new Map();
let pendingViewportRender = null;
let lastViewportKey = '';
let routePreviewCache = null;
let intermediateStationSuggestions = [];
const lineRenderer = (typeof L !== 'undefined' && typeof L.canvas === 'function') ? L.canvas({ padding: 0.2 }) : null;
const STATION_MARKER_MIN_ZOOM = 8;
const ROUTE_MAX_INTERMEDIATE_STOPS = 10;
const ROUTE_GRAPH_SNAP_DISTANCE_KM = 5;
const ROUTE_GRAPH_TRANSFER_DISTANCE_KM = 1.2;
const ROUTE_GRAPH_BUCKET_SIZE_DEG = 0.1;
const ROUTE_GRAPH_MAX_VISITED = 5000;
let stationById = new Map();
let stationGraph = new Map();
let routeGraphReady = false;

function initMap() {
    if (typeof L === 'undefined') {
        console.error('Leaflet non chargé');
        return;
    }

    if (map) { 
        map.invalidateSize(); 
        scheduleViewportRender();
        return; 
    }
    
    map = L.map('map').setView([46.6, 1.8], 6);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { 
        attribution: '© Carto, OpenStreetMap contributors' 
    }).addTo(map);
    
    networkLayer = L.layerGroup().addTo(map);
    routesLayer = L.layerGroup().addTo(map);
    markersLayer = L.layerGroup().addTo(map);

    map.on('moveend zoomend', scheduleViewportRender);
    
    fetchGaresLocales();
    fetchLignesLocales();
}

async function fetchGaresLocales() {
    try {
        const response = await fetch('gares-de-voyageurs.json');
        const data = await response.json();
        
        sncfStations = [];
        data.forEach((gare, index) => {
            if (gare.position_geographique) {
                const lat = gare.position_geographique.lat;
                const lon = gare.position_geographique.lon;
                const nom = gare.nom;

                sncfStations.push({ id: gare.id || `station_${index}`, nom, lat, lon });
            }
        });
        stationById = new Map(sncfStations.map(station => [String(station.id), station]));
        routeGraphReady = false;
        maybeBuildRouteGraph();
        scheduleViewportRender();
    } catch (e) { console.error("Erreur gares:", e); }
}

async function fetchLignesLocales() {
    try {
        const response = await fetch('lignes_sncf.json');
        const geojsonData = await response.json();
        networkFeatures = (geojsonData.features || []).map((feature, index) => {
            const coordinates = feature?.geometry?.coordinates || [];
            const bounds = computeFeatureBounds(coordinates);
            return {
                id: feature.id || `line_${index}`,
                coordinates,
                bounds,
                isLGV: isLGVFeature(feature)
            };
        });

        routeGraphReady = false;
        maybeBuildRouteGraph();
        scheduleViewportRender();
        
    } catch (e) { console.error("Erreur lignes:", e); }
}

function handleStationClick(id, nom, lat, lon) {
    if (!selectedDepart || (selectedDepart && selectedArrivee)) { 
        selectedDepart = { id: String(id), nom, lat, lon };
        selectedArrivee = null;
        document.getElementById('lbl-depart').innerText = nom;
        document.getElementById('lbl-depart').style.color = '#27ae60';
        document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-arrivee').style.color = '#e74c3c';
        resetIntermediateSelections();
    } else { 
        selectedArrivee = { id: String(id), nom, lat, lon };
        document.getElementById('lbl-arrivee').innerText = nom;
        document.getElementById('lbl-arrivee').style.color = '#27ae60';
        prepareIntermediateSuggestions();
    }
}

function isLGVFeature(feature) {
    const lineType = String(feature?.properties?.type_ligne || '').toLowerCase();
    return lineType.includes('lgv') || lineType.includes('grande vitesse') || lineType.includes('high speed');
}

function computeFeatureBounds(coordinates) {
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    coordinates.forEach(coord => {
        const [lon, lat] = coord;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
    });
    return { minLat, minLon, maxLat, maxLon };
}

function featureIntersectsBounds(featureBounds, mapBounds) {
    const south = mapBounds.getSouth();
    const north = mapBounds.getNorth();
    const west = mapBounds.getWest();
    const east = mapBounds.getEast();
    return !(featureBounds.maxLat < south || featureBounds.minLat > north || featureBounds.maxLon < west || featureBounds.minLon > east);
}

function buildViewportKey(bounds, zoom) {
    const precision = zoom >= 9 ? 100 : 20;
    const round = value => Math.round(value * precision) / precision;
    return [
        zoom,
        round(bounds.getSouth()),
        round(bounds.getWest()),
        round(bounds.getNorth()),
        round(bounds.getEast())
    ].join(':');
}

function scheduleViewportRender() {
    if (!map) return;
    if (pendingViewportRender) return;
    pendingViewportRender = window.requestAnimationFrame(() => {
        pendingViewportRender = null;
        renderVisibleMapData();
    });
}

function renderVisibleMapData() {
    // Evite les redraw complets : ne met à jour que la portion réellement visible.
    const bounds = map.getBounds().pad(0.2);
    const zoom = map.getZoom();
    const viewportKey = buildViewportKey(bounds, zoom);
    if (viewportKey === lastViewportKey) return;
    lastViewportKey = viewportKey;

    renderVisibleLines(bounds);
    renderVisibleStations(bounds, zoom);
}

function renderVisibleLines(bounds) {
    const visibleIds = new Set();
    networkFeatures.forEach(feature => {
        if (!feature.bounds || !featureIntersectsBounds(feature.bounds, bounds)) return;
        visibleIds.add(feature.id);
        if (visibleLineLayers.has(feature.id)) return;

        const latLngs = feature.coordinates.map(c => [c[1], c[0]]);
        const line = L.polyline(latLngs, {
            color: feature.isLGV ? '#8e44ad' : '#5d6d7e',
            weight: feature.isLGV ? 3 : 2,
            opacity: 0.65,
            renderer: lineRenderer || undefined
        });
        line.addTo(networkLayer);
        visibleLineLayers.set(feature.id, line);
    });

    visibleLineLayers.forEach((layer, id) => {
        if (visibleIds.has(id)) return;
        networkLayer.removeLayer(layer);
        visibleLineLayers.delete(id);
    });
}

function clearVisibleStationMarkers() {
    visibleStationMarkers.forEach(marker => markersLayer.removeLayer(marker));
    visibleStationMarkers.clear();
}

function renderVisibleStations(bounds, zoom) {
    if (zoom < STATION_MARKER_MIN_ZOOM) {
        clearVisibleStationMarkers();
        return;
    }

    const visibleIds = new Set();

    sncfStations.forEach(station => {
        if (!bounds.contains([station.lat, station.lon])) return;
        visibleIds.add(station.id);
        if (visibleStationMarkers.has(station.id)) return;

        const marker = L.marker([station.lat, station.lon], {
            icon: L.divIcon({ html: '🚉', className: 'station-icon', iconSize: [15, 15] })
        }).addTo(markersLayer);

        marker.bindTooltip(station.nom);
        marker.on('click', () => handleStationClick(station.id, station.nom, station.lat, station.lon));
        visibleStationMarkers.set(station.id, marker);
    });

    visibleStationMarkers.forEach((marker, id) => {
        if (visibleIds.has(id)) return;
        markersLayer.removeLayer(marker);
        visibleStationMarkers.delete(id);
    });
}

function resetIntermediateSelections() {
    routePreviewCache = null;
    intermediateStationSuggestions = [];
    renderIntermediateSuggestions();
}

function maybeBuildRouteGraph() {
    if (routeGraphReady) return;
    if (!sncfStations.length || !networkFeatures.length) return;
    stationGraph = buildStationGraph(sncfStations, networkFeatures);
    routeGraphReady = true;
}

function buildStationGraph(stations, features) {
    const graph = new Map();
    const stationBuckets = new Map();

    const bucketKey = (lat, lon) => `${Math.floor(lat / ROUTE_GRAPH_BUCKET_SIZE_DEG)}:${Math.floor(lon / ROUTE_GRAPH_BUCKET_SIZE_DEG)}`;
    stations.forEach(station => {
        graph.set(String(station.id), new Map());
        const key = bucketKey(station.lat, station.lon);
        if (!stationBuckets.has(key)) stationBuckets.set(key, []);
        stationBuckets.get(key).push(station);
    });

    const getNearbyStations = (lat, lon, maxDistanceKm) => {
        const baseLat = Math.floor(lat / ROUTE_GRAPH_BUCKET_SIZE_DEG);
        const baseLon = Math.floor(lon / ROUTE_GRAPH_BUCKET_SIZE_DEG);
        const candidates = [];

        for (let dLat = -1; dLat <= 1; dLat++) {
            for (let dLon = -1; dLon <= 1; dLon++) {
                const bucket = stationBuckets.get(`${baseLat + dLat}:${baseLon + dLon}`);
                if (!bucket) continue;
                bucket.forEach(station => {
                    const distance = approxKmDistance(lat, lon, station.lat, station.lon);
                    if (distance <= maxDistanceKm) candidates.push({ id: String(station.id), distance });
                });
            }
        }

        candidates.sort((a, b) => a.distance - b.distance);
        return candidates;
    };

    const addEdge = (fromId, toId, weight) => {
        if (fromId === toId) return;
        const fromEdges = graph.get(fromId);
        const toEdges = graph.get(toId);
        if (!fromEdges || !toEdges) return;

        const existingForward = fromEdges.get(toId);
        const existingBackward = toEdges.get(fromId);
        if (existingForward == null || weight < existingForward) fromEdges.set(toId, weight);
        if (existingBackward == null || weight < existingBackward) toEdges.set(fromId, weight);
    };

    features.forEach(feature => {
        const coords = feature.coordinates || [];
        if (coords.length < 2) return;

        const step = coords.length > 1000 ? Math.floor(coords.length / 1000) : 1;
        const sequence = [];
        let previousId = null;

        for (let i = 0; i < coords.length; i += step) {
            const [lon, lat] = coords[i];
            const nearest = getNearbyStations(lat, lon, ROUTE_GRAPH_SNAP_DISTANCE_KM)[0];
            if (!nearest) continue;
            if (nearest.id === previousId) continue;
            sequence.push(nearest.id);
            previousId = nearest.id;
        }

        const [lastLon, lastLat] = coords[coords.length - 1];
        const lastNearest = getNearbyStations(lastLat, lastLon, ROUTE_GRAPH_SNAP_DISTANCE_KM)[0];
        if (lastNearest && sequence[sequence.length - 1] !== lastNearest.id) {
            sequence.push(lastNearest.id);
        }

        for (let i = 1; i < sequence.length; i++) {
            const fromId = sequence[i - 1];
            const toId = sequence[i];
            if (fromId === toId) continue;
            const fromStation = stationById.get(fromId);
            const toStation = stationById.get(toId);
            if (!fromStation || !toStation) continue;
            const distance = approxKmDistance(fromStation.lat, fromStation.lon, toStation.lat, toStation.lon);
            if (distance > 0 && Number.isFinite(distance)) addEdge(fromId, toId, distance);
        }
    });

    const byName = new Map();
    stations.forEach(station => {
        const key = String(station.nom || '').trim().toLowerCase();
        if (!key) return;
        if (!byName.has(key)) byName.set(key, []);
        byName.get(key).push(station);
    });

    byName.forEach(list => {
        if (list.length < 2) return;
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const first = list[i];
                const second = list[j];
                const distance = approxKmDistance(first.lat, first.lon, second.lat, second.lon);
                if (distance <= ROUTE_GRAPH_TRANSFER_DISTANCE_KM) {
                    addEdge(String(first.id), String(second.id), Math.max(0.2, distance));
                }
            }
        }
    });

    return graph;
}

function findShortestStationPath(startId, endId) {
    const start = String(startId);
    const end = String(endId);
    if (!start || !end || !stationGraph.has(start) || !stationGraph.has(end)) return [];
    if (start === end) return [start];

    const distances = new Map([[start, 0]]);
    const previous = new Map();
    const visited = new Set();
    const queue = [{ id: start, distance: 0 }];

    while (queue.length && visited.size < ROUTE_GRAPH_MAX_VISITED) {
        queue.sort((a, b) => a.distance - b.distance);
        const current = queue.shift();
        if (!current || visited.has(current.id)) continue;
        visited.add(current.id);
        if (current.id === end) break;

        const neighbors = stationGraph.get(current.id);
        if (!neighbors) continue;
        neighbors.forEach((weight, neighborId) => {
            if (visited.has(neighborId)) return;
            const tentative = current.distance + weight;
            const known = distances.get(neighborId);
            if (known == null || tentative < known) {
                distances.set(neighborId, tentative);
                previous.set(neighborId, current.id);
                queue.push({ id: neighborId, distance: tentative });
            }
        });
    }

    if (!distances.has(end)) return [];

    const path = [];
    let cursor = end;
    while (cursor) {
        path.unshift(cursor);
        cursor = previous.get(cursor);
        if (path.length > ROUTE_GRAPH_MAX_VISITED) return [];
    }

    return path[0] === start ? path : [];
}

function capIntermediateStationIds(ids, maxStops) {
    if (ids.length <= maxStops) return ids;
    const selected = [];
    const step = (ids.length + 1) / (maxStops + 1);
    for (let i = 1; i <= maxStops; i++) {
        const index = Math.min(ids.length - 1, Math.max(0, Math.round((i * step) - 1)));
        const id = ids[index];
        if (!selected.includes(id)) selected.push(id);
    }
    return selected;
}

function computeGraphIntermediateStations(depart, arrivee) {
    if (!depart || !arrivee) return [];
    maybeBuildRouteGraph();
    if (!routeGraphReady) return [];
    const stationPath = findShortestStationPath(depart.id, arrivee.id);
    if (stationPath.length < 3) return [];

    const cappedIds = capIntermediateStationIds(stationPath.slice(1, -1), ROUTE_MAX_INTERMEDIATE_STOPS);
    return cappedIds
        .map(id => stationById.get(String(id)))
        .filter(Boolean);
}

function renderIntermediateSuggestions(message = null) {
    const box = document.getElementById('intermediate-stops-box');
    const hint = document.getElementById('intermediate-stops-hint');
    const list = document.getElementById('intermediate-stops-list');
    if (!box || !hint || !list) return;

    if (!selectedDepart || !selectedArrivee) {
        box.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    box.style.display = 'block';
    list.innerHTML = '';

    if (message) {
        hint.innerText = message;
        return;
    }

    if (intermediateStationSuggestions.length === 0) {
        hint.innerText = "Aucun arrêt intermédiaire pertinent détecté pour ce trajet.";
        return;
    }

    hint.innerText = "Sélectionnez les arrêts utiles pour cette liaison.";
    intermediateStationSuggestions.forEach((station, index) => {
        const label = document.createElement('label');
        label.style.display = 'flex';
        label.style.alignItems = 'center';
        label.style.gap = '6px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `intermediate-stop-${index}`;
        checkbox.dataset.stopId = station.id;
        checkbox.checked = true;

        const stationText = document.createElement('span');
        stationText.textContent = station.nom;

        label.appendChild(checkbox);
        label.appendChild(stationText);
        list.appendChild(label);
    });
}

async function prepareIntermediateSuggestions() {
    if (!selectedDepart || !selectedArrivee) return;
    renderIntermediateSuggestions("Analyse du trajet en cours...");

    const routeKey = `${selectedDepart.nom}|${selectedArrivee.nom}`;
    if (routePreviewCache && routePreviewCache.key === routeKey) {
        intermediateStationSuggestions = routePreviewCache.suggestions;
        renderIntermediateSuggestions();
        return;
    }

    try {
        const graphSuggestions = computeGraphIntermediateStations(selectedDepart, selectedArrivee);
        if (graphSuggestions.length > 0) {
            intermediateStationSuggestions = graphSuggestions;
            routePreviewCache = { key: routeKey, suggestions: intermediateStationSuggestions };
            renderIntermediateSuggestions();
            return;
        }

        const brouterUrl = `https://brouter.de/brouter?lonlats=${selectedDepart.lon},${selectedDepart.lat}|${selectedArrivee.lon},${selectedArrivee.lat}&profile=rail&format=geojson`;
        const res = await fetch(brouterUrl);
        const geo = await res.json();
        const baseRoute = geo?.features?.[0];
        const routeCoordinates = baseRoute?.geometry?.coordinates || [];

        intermediateStationSuggestions = computeIntermediateStations(routeCoordinates, selectedDepart, selectedArrivee);
        routePreviewCache = { key: routeKey, suggestions: intermediateStationSuggestions };
        renderIntermediateSuggestions();
    } catch (e) {
        console.error("Erreur suggestions:", e);
        intermediateStationSuggestions = [];
        renderIntermediateSuggestions("Impossible de charger les arrêts intermédiaires pour ce trajet.");
    }
}

function computeIntermediateStations(routeCoordinates, depart, arrivee) {
    if (!routeCoordinates || routeCoordinates.length < 3) return [];

    // On échantillonne la géométrie pour trouver des gares proches du tracé sans coût excessif.
    const maxStops = ROUTE_MAX_INTERMEDIATE_STOPS;
    const pointStep = Math.max(1, Math.floor(routeCoordinates.length / 250));
    const sampled = [];
    for (let i = 0; i < routeCoordinates.length; i += pointStep) sampled.push({ coord: routeCoordinates[i], index: i });
    if (sampled[sampled.length - 1].index !== routeCoordinates.length - 1) {
        sampled.push({ coord: routeCoordinates[routeCoordinates.length - 1], index: routeCoordinates.length - 1 });
    }

    const routeLength = routeCoordinates.length - 1;
    const thresholdKm = 6;
    const candidates = [];

    sncfStations.forEach(station => {
        if (station.nom === depart.nom || station.nom === arrivee.nom) return;

        let bestDistance = Infinity;
        let bestIndex = -1;

        sampled.forEach(point => {
            const [lon, lat] = point.coord;
            const dist = approxKmDistance(station.lat, station.lon, lat, lon);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestIndex = point.index;
            }
        });

        if (bestDistance > thresholdKm || bestIndex <= 0 || bestIndex >= routeLength) return;
        const progress = bestIndex / routeLength;
        if (progress < 0.08 || progress > 0.92) return;

        candidates.push({ station, progress, distanceToPath: bestDistance });
    });

    candidates.sort((a, b) => (a.progress - b.progress) || (a.distanceToPath - b.distanceToPath));

    const selected = [];
    candidates.forEach(candidate => {
        if (selected.length >= maxStops) return;
        const tooClose = selected.some(existing => Math.abs(existing.progress - candidate.progress) < 0.09);
        if (!tooClose) selected.push(candidate);
    });

    return selected.map(item => item.station);
}

function approxKmDistance(lat1, lon1, lat2, lon2) {
    const avgLat = (lat1 + lat2) * 0.5 * Math.PI / 180;
    const kmPerDegLat = 111.32;
    const kmPerDegLon = 111.32 * Math.cos(avgLat);
    const dLat = (lat1 - lat2) * kmPerDegLat;
    const dLon = (lon1 - lon2) * kmPerDegLon;
    return Math.sqrt((dLat * dLat) + (dLon * dLon));
}

function getSelectedIntermediateStops() {
    const checkedInputs = document.querySelectorAll('#intermediate-stops-list input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkedInputs).map(input => input.dataset.stopId);
    return intermediateStationSuggestions.filter(station => selectedIds.includes(String(station.id)));
}

function buildRouteStations(depart, selectedStops, arrivee) {
    const ordered = [depart, ...selectedStops, arrivee].filter(Boolean);
    const unique = [];
    const seen = new Set();

    ordered.forEach(station => {
        const stationId = String(station.id || `${station.nom}:${station.lat}:${station.lon}`);
        if (seen.has(stationId)) return;
        seen.add(stationId);
        unique.push(station);
    });

    return unique;
}

async function planifierTrajet() {
    const rameId = document.getElementById('select-rame').value;
    const time = document.getElementById('time-depart').value;

    if (!rameId || !selectedDepart || !selectedArrivee || !time) {
        return alert("Veuillez remplir tous les champs !");
    }

    const rame = gameState.savedRames.find(r => r.id == rameId);
    if (!rame) return;

    let selectedStops = getSelectedIntermediateStops();
    if (selectedStops.length === 0) {
        selectedStops = computeGraphIntermediateStations(selectedDepart, selectedArrivee);
    }

    const routeStations = buildRouteStations(selectedDepart, selectedStops, selectedArrivee);
    const lonLatPath = routeStations.map(station => `${station.lon},${station.lat}`).join('|');
    
    try {
        const brouterUrl = `https://brouter.de/brouter?lonlats=${lonLatPath}&profile=rail&format=geojson`;
        const res = await fetch(brouterUrl);
        const geo = await res.json();
        const routeFeature = geo?.features?.[0];
        if (!routeFeature?.geometry?.coordinates?.length) throw new Error('Aucun tracé valide');

        const dist = routeFeature?.properties?.['track-length'] / 1000;
        if (!Number.isFinite(dist) || dist <= 0) throw new Error('Distance invalide');
        const speedKmh = parseInt(rame.stats.vitesse) * 0.85;
        const timeSec = (dist / speedKmh) * 3600;
        
        const departDate = new Date(`1970-01-01T${time}:00`);
        const arriveeDate = new Date(departDate.getTime() + (timeSec * 1000));
        const timeArrivee = arriveeDate.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
        
        const path = routeFeature.geometry.coordinates.map(c => [c[1], c[0]]);
        
        gameState.activeRoutes.push({
            rameNom: rame.nom,
            departNom: selectedDepart.nom,
            arriveeNom: selectedArrivee.nom,
            heureDepart: time,
            heureArrivee: timeArrivee,
            distance: Math.round(dist),
            intermediateStops: selectedStops.map(station => station.nom),
            path: path
        });
        
        saveGame();
        
        routesLayer.clearLayers();
        L.polyline(path, {color: '#e74c3c', weight: 4}).addTo(routesLayer);
        
        selectedDepart = null; selectedArrivee = null;
        document.getElementById('lbl-depart').innerText = "Cliquez sur une gare";
        document.getElementById('lbl-arrivee').innerText = "Cliquez sur une gare";
        resetIntermediateSelections();
        
        renderActiveRoutes();
        
    } catch (e) {
        alert("Erreur de routage. Essayez un autre trajet.");
    }
}
