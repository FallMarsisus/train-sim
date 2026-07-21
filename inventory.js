// inventory.js - inventaire, atelier et dépôt
function updateInventoryUI() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
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
    if (!container || !logicBox || !saveBtn) return;
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

// Dépôt
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
    const container = document.getElementById('saved-rames-list') || document.getElementById('saved-rames-container');
    if (!container) return;
    
    if (!gameState.savedRames || gameState.savedRames.length === 0) {
        container.innerHTML = "<p style='color: #64748b;'>Aucune rame sauvegardée dans le dépôt.</p>";
        return;
    }

    container.innerHTML = gameState.savedRames.map(rame => {
        assignDefaultStationToRame(rame);
        return `
            <div class="saved-rame">
                <div class="rame-header">
                    <div>
                        <h3 style="margin: 0; color: #0A192F;">${rame.nom}</h3>
                        <span class="station-badge">📍 Localisation : <strong>${rame.currentStationNom}</strong></span>
                    </div>
                    <button class="action-btn cancel" onclick="supprimerRame(${rame.id})">Supprimer</button>
                </div>
                <div class="rame-visualizer">
                    ${rame.composition ? rame.composition.map(item => `<img src="${item.image}" title="${item.nom}">`).join('<span class="coupler">🔗</span>') : ''}
                </div>
            </div>
        `;
    }).join('');
}

function assignDefaultStationToRame(rame) {
    if (!rame.currentStationId) {
        // Choisis une gare de départ par défaut réelle depuis tes données
        const defaultStation = sncfStations.find(s => /paris.*lyon/i.test(s.nom)) || sncfStations[0];
        if (defaultStation) {
            rame.currentStationId = String(defaultStation.id);
            rame.currentStationNom = defaultStation.nom;
        }
    }
}


function onRameSelectChange() {
    const rameId = document.getElementById('select-rame-route')?.value;
    const selectDep = document.getElementById('select-station-dep');
    if (!rameId || !selectDep) return;

    const rame = gameState.savedRames.find(r => String(r.id) === String(rameId));
    if (rame) {
        assignDefaultStationToRame(rame);
        selectDep.value = rame.currentStationId || "";
        showToast(`Rame "${rame.nom}" sélectionnée. Emplacement actuel : ${rame.currentStationNom}`, "info");
        onStationSelectChange();
    }
}



function checkStationCoherence() {
    const rameId = document.getElementById('select-rame-route')?.value;
    const selectDepId = document.getElementById('select-station-dep')?.value;
    const feedback = document.getElementById('route-feedback');
    if (!rameId || !selectDepId) return true;

    const rame = gameState.savedRames.find(r => String(r.id) === String(rameId));
    if (!rame) return true;
    assignDefaultStationToRame(rame);

    if (String(rame.currentStationId) !== String(selectDepId)) {
        if (feedback) {
            feedback.className = "route-feedback error";
            feedback.style.display = "block";
            feedback.innerHTML = `❌ <strong>Départ impossible :</strong> La rame <em>${rame.nom}</em> se trouve à <strong>${rame.currentStationNom}</strong> (et non à la gare sélectionnée).`;
        }
        return false;
    }
    if (feedback) { feedback.className = "route-feedback"; feedback.style.display = "none"; }
    return true;
}



function populateRameSelect() {
    const select = document.getElementById('select-rame-route');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choisissez une rame au dépôt --</option>';
    gameState.savedRames.forEach(rame => {
        const opt = document.createElement('option');
        opt.value = rame.id;
        const location = rame.currentStationNom ? ` • ${rame.currentStationNom}` : ' • non positionnée';
        opt.textContent = `${rame.nom}${location}`;
        select.appendChild(opt);
    });
}

function populateStationSelect() {
    const depSelect = document.getElementById('select-station-dep');
    const arrSelect = document.getElementById('select-station-arr');
    if (!depSelect || !arrSelect) return;

    depSelect.innerHTML = '<option value="">-- Gare de départ --</option>';
    arrSelect.innerHTML = '<option value="">-- Gare d\'arrivée --</option>';

    if (!sncfStations) return;
    sncfStations.forEach(station => {
        const optDep = document.createElement('option');
        optDep.value = String(station.id);
        optDep.textContent = station.nom;
        depSelect.appendChild(optDep);

        const optArr = document.createElement('option');
        optArr.value = String(station.id);
        optArr.textContent = station.nom;
        arrSelect.appendChild(optArr);
    });
}


function syncRameOriginFromSelection() {
    const rameId = document.getElementById('select-rame')?.value;
    const stationSelect = document.getElementById('select-rame-origin');
    if (!rameId || !stationSelect) return;
    const rame = gameState.savedRames.find(r => r.id === rameId);
    if (!rame) return;
    stationSelect.value = rame.currentStationId ? String(rame.currentStationId) : '';
}

function renderActiveRoutes() {
    const container = document.getElementById('active-routes-list');
    if (!container) return;

    if (!gameState.activeRoutes || gameState.activeRoutes.length === 0) {
        container.innerHTML = '<p style="color:#7f8c8d; font-style: italic;">Aucun train en circulation.</p>';
        return;
    }

    container.innerHTML = gameState.activeRoutes.map(route => `
        <div class="route-card">
            <div class="route-card-header">
                <strong>${route.rameNom}</strong>
                <button class="route-delete-btn" onclick="deleteRoute('${route.id}')">Supprimer</button>
            </div>
            <div>${route.departNom} → ${route.arriveeNom}</div>
            ${(route.intermediateStops && route.intermediateStops.length) ? `<div class="route-meta">Arrêts: ${route.intermediateStops.join(' • ')}</div>` : ''}
            <div class="route-meta">${route.heureDepart} - ${route.heureArrivee} • ${route.distance} km</div>
            ${route.progress != null ? `<div class="route-meta">Progression: ${(route.progress * 100).toFixed(0)}%</div>` : ''}
            ${route.statusText ? `<div class="route-meta">${route.statusText}</div>` : ''}
        </div>
    `).join('');
}

function deleteRoute(routeId) {
    const route = gameState.activeRoutes.find(r => r.id === routeId);
    if (!route) return;
    if (!confirm(`Supprimer le trajet ${route.departNom} → ${route.arriveeNom} ?`)) return;
    gameState.activeRoutes = gameState.activeRoutes.filter(r => r.id !== routeId);
    if (trainMarkers && trainMarkers.has && trainMarkers.has(routeId)) {
        trainsLayer.removeLayer(trainMarkers.get(routeId));
        trainMarkers.delete(routeId);
    }
    saveGame();
    renderActiveRoutes();
    refreshRouteMapLayers();
    setRouteFeedback('Trajet supprimé.', 'success');
}
