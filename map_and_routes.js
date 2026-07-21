// map_and_routes.js - carte, graphes et suggestions
let map = null, markersLayer = null, routesLayer = null, networkLayer = null, trainsLayer = null;
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
let skippedStationIds = new Set();
let stationById = new Map();
let stationGraph = new Map();
let routeGraphReady = false;
let routeSimulationTimer = null;
let trainMarkers = new Map();

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
    trainsLayer = L.layerGroup().addTo(map);

    map.on('moveend zoomend', scheduleViewportRender);
    
    fetchGaresLocales();
    fetchLignesLocales();
    startRouteSimulation();
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
        populateStationSelect();
        populateRameSelect();
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
    const selectDep = document.getElementById('select-station-dep');
    const selectArr = document.getElementById('select-station-arr');
    const lblDepart = document.getElementById('lbl-depart');
    const lblArrivee = document.getElementById('lbl-arrivee');

    if (!selectedDepart || (selectedDepart && selectedArrivee)) { 
        selectedDepart = { id: String(id), nom, lat, lon };
        selectedArrivee = null;
        
        if (selectDep) selectDep.value = String(id);
        if (selectArr) selectArr.value = "";

        if (lblDepart) {
            lblDepart.innerText = nom;
            lblDepart.style.color = '#10B981';
        }
        if (lblArrivee) {
            lblArrivee.innerText = "Sélectionnez sur la carte";
            lblArrivee.style.color = '#EF4444';
        }
        resetIntermediateSelections();
    } else { 
        selectedArrivee = { id: String(id), nom, lat, lon };
        
        if (selectArr) selectArr.value = String(id);

        if (lblArrivee) {
            lblArrivee.innerText = nom;
            lblArrivee.style.color = '#10B981';
        }
        prepareIntermediateSuggestions();
    }
    
    checkStationCoherence();
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

        const stationIcon = L.divIcon({
            className: 'custom-station-pin',
            html: `<div class="station-dot"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });

        const marker = L.marker([station.lat, station.lon], { icon: stationIcon }).addTo(markersLayer);
        marker.bindTooltip(`<b>${station.nom}</b>`, { direction: 'top', offset: [0, -6] });
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
    skippedStationIds.clear();
    renderLinePlan();
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

function renderLinePlan() {
    const box = document.getElementById('line-plan-box');
    const hint = document.getElementById('line-plan-hint');
    const track = document.getElementById('line-plan-track');
    if (!box || !hint || !track) return;

    if (!selectedDepart || !selectedArrivee) {
        box.style.display = 'none';
        track.innerHTML = '';
        return;
    }

    box.style.display = 'block';
    hint.innerText = intermediateStationSuggestions.length === 0
        ? "Aucune gare intermédiaire détectée : trajet direct uniquement."
        : "Cliquez sur une gare pour l'ignorer (le train ne s'y arrêtera pas).";

    const stops = [
        { ...selectedDepart, endpoint: true },
        ...intermediateStationSuggestions,
        { ...selectedArrivee, endpoint: true }
    ];

    track.innerHTML = `<div class="line-plan-inner">${stops.map(station => {
        const isEndpoint = !!station.endpoint;
        const isSkipped = !isEndpoint && skippedStationIds.has(String(station.id));
        return `
            <div class="line-plan-stop ${isEndpoint ? 'endpoint' : ''} ${isSkipped ? 'skipped' : ''}"
                 ${isEndpoint ? '' : `onclick="toggleLineStop('${station.id}')"`}
                 title="${station.nom}">
                <div class="stop-dot"></div>
                <div class="stop-label">${station.nom}</div>
            </div>`;
    }).join('')}</div>`;
}

function toggleLineStop(stationId) {
    const id = String(stationId);
    skippedStationIds.has(id) ? skippedStationIds.delete(id) : skippedStationIds.add(id);
    renderLinePlan();
}

function applyServiceTypePreset(type) {
    if (!intermediateStationSuggestions.length) return;
    skippedStationIds.clear();
    if (type === 'direct') {
        intermediateStationSuggestions.forEach(s => skippedStationIds.add(String(s.id)));
    } else if (type === 'express') {
        intermediateStationSuggestions.forEach((s, i) => { if (i % 2 === 1) skippedStationIds.add(String(s.id)); });
    }
    renderLinePlan();
}

function onStationSelectChange() {
    const depId = document.getElementById('select-station-dep')?.value;
    const arrId = document.getElementById('select-station-arr')?.value;

    selectedDepart = depId ? getStationById(depId) : null;
    selectedArrivee = arrId ? getStationById(arrId) : null;

    checkStationCoherence();

    if (selectedDepart && selectedArrivee) {
        prepareIntermediateSuggestions();
    } else {
        resetIntermediateSelections();
    }
}



async function prepareIntermediateSuggestions() {
    if (!selectedDepart || !selectedArrivee) return;
    renderLinePlan("Analyse du trajet en cours...");

    const routeKey = `${selectedDepart.nom}|${selectedArrivee.nom}`;
    if (routePreviewCache && routePreviewCache.key === routeKey) {
        intermediateStationSuggestions = routePreviewCache.suggestions;
        renderLinePlan();
        return;
    }

    try {
        const graphSuggestions = computeGraphIntermediateStations(selectedDepart, selectedArrivee);
        if (graphSuggestions.length > 0) {
            intermediateStationSuggestions = graphSuggestions;
            routePreviewCache = { key: routeKey, suggestions: intermediateStationSuggestions };
            renderLinePlan();
            return;
        }

        const brouterUrl = `https://brouter.de/brouter?lonlats=${selectedDepart.lon},${selectedDepart.lat}|${selectedArrivee.lon},${selectedArrivee.lat}&profile=rail&format=geojson`;
        const res = await fetch(brouterUrl);
        const geo = await res.json();
        const baseRoute = geo?.features?.[0];
        const routeCoordinates = baseRoute?.geometry?.coordinates || [];

        intermediateStationSuggestions = computeIntermediateStations(routeCoordinates, selectedDepart, selectedArrivee);
        routePreviewCache = { key: routeKey, suggestions: intermediateStationSuggestions };
        renderLinePlan();
    } catch (e) {
        console.error("Erreur suggestions:", e);
        intermediateStationSuggestions = [];
        renderLinePlan("Impossible de charger les arrêts intermédiaires pour ce trajet.");
    }
}

function computeIntermediateStations(routeCoordinates, depart, arrivee) {
    if (!routeCoordinates || routeCoordinates.length < 3) return [];

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

function parseRameSpeedKmh(rame) {
    const speed = parseInt(String(rame?.stats?.vitesse || '').match(/\d+/)?.[0], 10);
    return Number.isFinite(speed) && speed > 0 ? speed : 80;
}

function setRouteFeedback(message, type = 'error') {
    const box = document.getElementById('route-feedback');
    if (!box) return;
    if (!message) {
        box.className = 'route-feedback';
        box.innerText = '';
        return;
    }
    box.className = `route-feedback ${type}`;
    box.innerText = message;
}

function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<strong>${type === 'error' ? '⚠️ Erreur' : 'ℹ️ Info'}</strong> : ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

function calculateSegmentTravelTimeSec(distanceKm, speedKmh) {
    const distanceM = Math.max(0, distanceKm * 1000);
    const maxSpeedMs = Math.max(1, speedKmh / 3.6);
    const accelTime = maxSpeedMs / ETA_ACCELERATION_MS2;
    const decelTime = maxSpeedMs / ETA_DECELERATION_MS2;
    const accelDistance = 0.5 * ETA_ACCELERATION_MS2 * accelTime * accelTime;
    const decelDistance = 0.5 * ETA_DECELERATION_MS2 * decelTime * decelTime;
    const fullProfileDistance = accelDistance + decelDistance;

    if (distanceM <= fullProfileDistance) {
        const peakSpeed = Math.sqrt((2 * distanceM * ETA_ACCELERATION_MS2 * ETA_DECELERATION_MS2) / (ETA_ACCELERATION_MS2 + ETA_DECELERATION_MS2));
        return (peakSpeed / ETA_ACCELERATION_MS2) + (peakSpeed / ETA_DECELERATION_MS2);
    }

    const cruiseDistance = distanceM - fullProfileDistance;
    return accelTime + decelTime + (cruiseDistance / maxSpeedMs);
}

function computeRouteTiming(routeStations, speedKmh) {
    const segmentDurationsSec = [];
    const segmentDistancesKm = [];
    for (let i = 1; i < routeStations.length; i++) {
        const from = routeStations[i - 1];
        const to = routeStations[i];
        const segmentDistanceKm = approxKmDistance(from.lat, from.lon, to.lat, to.lon);
        const segmentTimeSec = calculateSegmentTravelTimeSec(segmentDistanceKm, speedKmh);
        segmentDistancesKm.push(segmentDistanceKm);
        segmentDurationsSec.push(segmentTimeSec);
    }

    const dwellCount = Math.max(0, routeStations.length - 2);
    const dwellTimeSec = dwellCount * ETA_DWELL_TIME_SEC;
    const movingTimeSec = segmentDurationsSec.reduce((acc, duration) => acc + duration, 0);
    const totalTimeSec = movingTimeSec + dwellTimeSec;
    const totalDistanceKm = segmentDistancesKm.reduce((acc, distance) => acc + distance, 0);

    return { segmentDurationsSec, segmentDistancesKm, movingTimeSec, dwellTimeSec, totalTimeSec, totalDistanceKm };
}

function getStationById(stationId) {
    return stationById.get(String(stationId)) || null;
}
