// simulation.js - simulation des circulations et gestion des marqueurs
function getPathPoint(path, progress) {
    if (!Array.isArray(path) || path.length === 0) return null;
    if (path.length === 1) return path[0];
    const bounded = Math.min(1, Math.max(0, progress));
    const scaled = bounded * (path.length - 1);
    const lower = Math.floor(scaled);
    const upper = Math.min(path.length - 1, lower + 1);
    const ratio = scaled - lower;
    const start = path[lower];
    const end = path[upper];
    if (!start || !end) return start || end || null;
    return [
        start[0] + (end[0] - start[0]) * ratio,
        start[1] + (end[1] - start[1]) * ratio
    ];
}

function computeRouteStatus(route, elapsedSec) {
    if (!Array.isArray(route.routeStations) || route.routeStations.length < 2 || !Array.isArray(route.segmentDurationsSec)) {
        return route.statusText || '';
    }

    let remaining = elapsedSec;
    for (let i = 0; i < route.segmentDurationsSec.length; i++) {
        const segmentTime = route.segmentDurationsSec[i];
        if (remaining <= segmentTime) {
            const from = route.routeStations[i]?.nom || route.departNom;
            const to = route.routeStations[i + 1]?.nom || route.arriveeNom;
            return `En trajet: ${from} → ${to}`;
        }
        remaining -= segmentTime;
        const isIntermediateStop = i < route.segmentDurationsSec.length - 1;
        if (isIntermediateStop) {
            if (remaining <= ETA_DWELL_TIME_SEC) {
                const station = route.routeStations[i + 1]?.nom || '';
                return `Arrêt en gare: ${station}`;
            }
            remaining -= ETA_DWELL_TIME_SEC;
        }
    }
    return `Arrivée imminente: ${route.arriveeNom}`;
}

function finalizeRoute(route) {
    const rame = gameState.savedRames.find(r => r.id === route.rameId);
    if (rame) {
        rame.currentStationId = route.arriveeId || null;
        rame.currentStationNom = route.arriveeNom || null;
    }
    if (trainMarkers.has(route.id)) {
        trainsLayer.removeLayer(trainMarkers.get(route.id));
        trainMarkers.delete(route.id);
    }
    showToast(`✅ ${route.rameNom} est arrivée à ${route.arriveeNom}.`, 'success');
}

function updateRouteSimulation() {
    if (!gameState.activeRoutes || gameState.activeRoutes.length === 0) return;
    const now = Date.now();
    const finishedIds = [];

    gameState.activeRoutes.forEach(route => {
        const elapsedSec = (now - (route.startedAtMs || now)) / 1000;
        const totalSec = route.totalDurationSec || 1;
        route.progress = Math.min(1, elapsedSec / totalSec);
        route.statusText = computeRouteStatus(route, elapsedSec);
        if (route.progress >= 1) finishedIds.push(route.id);
    });

    finishedIds.forEach(id => {
        const idx = gameState.activeRoutes.findIndex(r => r.id === id);
        if (idx === -1) return;
        finalizeRoute(gameState.activeRoutes[idx]);
        gameState.activeRoutes.splice(idx, 1);
    });

    if (finishedIds.length) {
        renderSavedRames();
        populateRameSelect();
        saveGame();
    }

    renderActiveRoutes();
    refreshRouteMapLayers();
    updateTrainMarkers();
}


function startRouteSimulation() {
    if (routeSimulationTimer) return;
    routeSimulationTimer = setInterval(updateRouteSimulation, 1000);
}

function refreshRouteMapLayers() {
    if (!routesLayer || !map) return;
    routesLayer.clearLayers();
    gameState.activeRoutes.forEach(route => {
        if (!Array.isArray(route.path) || route.path.length < 2) return;
        L.polyline(route.path, { color: '#E63946', weight: 4, opacity: 0.85 }).addTo(routesLayer);
    });
}

function updateTrainMarkers() {
    if (!trainsLayer || !map) return;
    const activeIds = new Set();
    
    gameState.activeRoutes.forEach(route => {
        if (!Array.isArray(route.path) || !route.path.length) return;
        const progress = Number.isFinite(route.progress) ? route.progress : 0;
        const point = getPathPoint(route.path, progress);
        if (!point) return;
        activeIds.add(route.id);

        let marker = trainMarkers.get(route.id);
        if (!marker) {
            const trainIcon = L.divIcon({
                className: 'custom-train-pin',
                html: `<div class="train-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
                        <span>${route.rameNom}</span>
                       </div>`,
                iconSize: [80, 24],
                iconAnchor: [40, 12]
            });

            marker = L.marker(point, { icon: trainIcon }).addTo(trainsLayer);
            trainMarkers.set(route.id, marker);
        } else {
            marker.setLatLng(point);
        }
        marker.bindTooltip(`<b>${route.rameNom}</b><br>${route.statusText || 'En circulation'}`);
    });

    trainMarkers.forEach((marker, routeId) => {
        if (activeIds.has(routeId)) return;
        trainsLayer.removeLayer(marker);
        trainMarkers.delete(routeId);
    });
}

function planifierTrajet() {
    const rameId = document.getElementById('select-rame-route')?.value;
    const depId = document.getElementById('select-station-dep')?.value;
    const arrId = document.getElementById('select-station-arr')?.value;
    const serviceType = document.getElementById('select-service-type')?.value || "omnibus";

    if (!rameId || !depId || !arrId) {
        setRouteFeedback("Veuillez sélectionner une rame, une gare de départ et une gare d'arrivée.", "error");
        return;
    }
    if (depId === arrId) {
        setRouteFeedback("La gare de départ et la gare d'arrivée doivent être différentes.", "error");
        return;
    }
    if (!checkStationCoherence()) {
        setRouteFeedback("Départ impossible : la rame n'est pas dans cette gare.", "error");
        return;
    }

    const rame = gameState.savedRames.find(r => String(r.id) === String(rameId));
    const depart = getStationById(depId);
    const arrivee = getStationById(arrId);
    if (!rame || !depart || !arrivee) {
        setRouteFeedback("Données de trajet invalides.", "error");
        return;
    }

    const selectedStops = getSelectedIntermediateStops();
    const routeStations = buildRouteStations(depart, selectedStops, arrivee);
    const speedKmh = parseRameSpeedKmh(rame);
    const timing = computeRouteTiming(routeStations, speedKmh);

    const now = new Date();
    const arrivalDate = new Date(now.getTime() + timing.totalTimeSec * 1000);
    const fmt = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const newRoute = {
        id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        rameId: rame.id,
        rameNom: rame.nom,
        departId: String(depart.id),
        departNom: depart.nom,
        arriveeId: String(arrivee.id),
        arriveeNom: arrivee.nom,
        intermediateStops: routeStations.slice(1, -1).map(s => s.nom),
        serviceType,
        progress: 0,
        distance: Math.round(timing.totalDistanceKm),
        heureDepart: fmt(now),
        heureArrivee: fmt(arrivalDate),
        startedAtMs: now.getTime(),
        totalDurationSec: Math.max(60, timing.totalTimeSec),
        segmentDurationsSec: timing.segmentDurationsSec,
        routeStations: routeStations.map(s => ({ id: String(s.id), nom: s.nom, lat: s.lat, lon: s.lon })),
        path: routeStations.map(s => [s.lat, s.lon]),
        statusText: `En trajet: ${depart.nom} → ${routeStations[1]?.nom || arrivee.nom}`
    };

    rame.currentStationId = null;
    rame.currentStationNom = `En circulation → ${arrivee.nom}`;

    gameState.activeRoutes.push(newRoute);
    saveGame();

    setRouteFeedback(`🟢 Train "${rame.nom}" parti de ${depart.nom} vers ${arrivee.nom}.`, "success");
    showToast(`🟢 Train "${rame.nom}" en route vers ${arrivee.nom}`, "success");

    populateRameSelect();
    renderActiveRoutes();
    refreshRouteMapLayers();
    updateTrainMarkers();
}
