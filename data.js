// data.js - Globals and basic constants
let trainDatabase = [];
let shopSelection = []; // Boutique du jour
let gameState = {
    money: 15000000,
    inventory: [], // Matériel possédé, non assigné
    activeComposition: [], // Sur la voie d'assemblage
    savedRames: [], // Rames finalisées
    activeRoutes: []
};

const ETA_DWELL_TIME_SEC = 45;
const ETA_ACCELERATION_MS2 = 0.55;
const ETA_DECELERATION_MS2 = 0.65;

const REBROUSSEMENT_MALUS_SEC = 360; // 6 minutes de pénalité en gare

/**
 * Calcul d'itinéraire avec détection de rebroussements.
 * @param {Array} pathNodes - Liste des nœuds/gares parcourus
 * @param {Set} stationNodeIds - Ensemble des identifiants des nœuds qui sont des gares
 */
function validateAndCalculatePath(pathNodes, stationNodeIds) {
    let totalDwellTime = 0;
    let turnAroundCount = 0;

    for (let i = 1; i < pathNodes.length - 1; i++) {
        const prev = pathNodes[i - 1];
        const curr = pathNodes[i];
        const next = pathNodes[i + 1];

        const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
        const v2 = { x: next.x - curr.x, y: next.y - curr.y };
        const dotProduct = (v1.x * v2.x + v1.y * v2.y);
        const isReversal = dotProduct < -0.7; // Sens inverse détecté

        const isStation = stationNodeIds.has(curr.id);

        if (isReversal) {
            if (!isStation) {
                return { valid: false, reason: `Rebroussement interdit en pleine voie au nœud ${curr.id}` };
            } else {
                turnAroundCount++;
                totalDwellTime += REBROUSSEMENT_MALUS_SEC;
            }
        }
    }

    return {
        valid: true,
        turnAroundCount: turnAroundCount,
        penaltySeconds: totalDwellTime
    };
}
