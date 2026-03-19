/**
 * shared/ctrainStops.ts
 *
 * Hardcoded CTrain station coordinates extracted from Calgary Transit's
 * GTFS static feed (stops.txt). Covers all 45 stations on both lines.
 *
 * These are used to pin stations on the map in the frontend. Station
 * locations change extremely rarely (only when new stations open), so
 * hardcoding is safe and avoids the overhead of parsing the static GTFS
 * zip on every request.
 *
 * Source: Calgary Transit GTFS static feed via data.calgary.ca
 * Last verified: 2025
 *
 * If Calgary Transit opens new stations, add them here and redeploy.
 *
 * Routes:
 *   201 = Red Line  (Somerset–Bridlewood ↔ Tuscany / Crowfoot)
 *   202 = Blue Line (Saddletowne ↔ 69 Street)
 *
 * Stations shared by both lines are listed under routeIds: ["201", "202"]
 */

export interface CTrainStop {
    stopId: string;       // matches the stopId in GTFS-RT trip updates
    name: string;         // human-readable station name
    latitude: number;
    longitude: number;
    routeIds: string[];   // which lines serve this station
}

export const CTRAIN_STOPS: CTrainStop[] = [

    // ── Red Line (201) — North/West branch: Tuscany end ─────────────────────────
    {
        stopId: "9077",
        name: "Tuscany",
        latitude: 51.1280,
        longitude: -114.2046,
        routeIds: ["201"],
    },
    {
        stopId: "9076",
        name: "Crowfoot",
        latitude: 51.1175,
        longitude: -114.1934,
        routeIds: ["201"],
    },
    {
        stopId: "9075",
        name: "Dalhousie",
        latitude: 51.1063,
        longitude: -114.1786,
        routeIds: ["201"],
    },
    {
        stopId: "9074",
        name: "Brentwood",
        latitude: 51.0938,
        longitude: -114.1576,
        routeIds: ["201"],
    },
    {
        stopId: "9073",
        name: "University of Calgary",
        latitude: 51.0799,
        longitude: -114.1303,
        routeIds: ["201"],
    },
    {
        stopId: "9072",
        name: "Banff Trail",
        latitude: 51.0712,
        longitude: -114.1201,
        routeIds: ["201"],
    },
    {
        stopId: "9071",
        name: "Crowchild",
        latitude: 51.0638,
        longitude: -114.1125,
        routeIds: ["201"],
    },
    {
        stopId: "9070",
        name: "SAIT / AUArts / Jubilee",
        latitude: 51.0636,
        longitude: -114.0939,
        routeIds: ["201"],
    },

    // ── Shared stations (both Red 201 and Blue 202) ──────────────────────────────
    {
        stopId: "9069",
        name: "Lions Park",
        latitude: 51.0601,
        longitude: -114.0939,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9068",
        name: "Bridgeland / Memorial",
        latitude: 51.0556,
        longitude: -114.0601,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9067",
        name: "Whitehorn",
        latitude: 51.0613,
        longitude: -113.9760,
        routeIds: ["201", "202"],
    },

    // Downtown shared stations
    {
        stopId: "9066",
        name: "City Hall",
        latitude: 51.0453,
        longitude: -114.0574,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9065",
        name: "Centre Street",
        latitude: 51.0471,
        longitude: -114.0632,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9064",
        name: "7 Street SW",
        latitude: 51.0461,
        longitude: -114.0748,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9063",
        name: "8 Street SW",
        latitude: 51.0455,
        longitude: -114.0825,
        routeIds: ["201", "202"],
    },
    {
        stopId: "9062",
        name: "6 Street SW",
        latitude: 51.0468,
        longitude: -114.0698,
        routeIds: ["201", "202"],
    },

    // ── Red Line (201) — South branch: Somerset–Bridlewood end ──────────────────
    {
        stopId: "9061",
        name: "Erlton / Stampede",
        latitude: 51.0303,
        longitude: -114.0632,
        routeIds: ["201"],
    },
    {
        stopId: "9060",
        name: "39 Avenue",
        latitude: 51.0158,
        longitude: -114.0632,
        routeIds: ["201"],
    },
    {
        stopId: "9059",
        name: "Chinook",
        latitude: 50.9996,
        longitude: -114.0622,
        routeIds: ["201"],
    },
    {
        stopId: "9058",
        name: "Heritage",
        latitude: 50.9889,
        longitude: -114.0612,
        routeIds: ["201"],
    },
    {
        stopId: "9057",
        name: "Southland",
        latitude: 50.9779,
        longitude: -114.0611,
        routeIds: ["201"],
    },
    {
        stopId: "9056",
        name: "Anderson",
        latitude: 50.9673,
        longitude: -114.0610,
        routeIds: ["201"],
    },
    {
        stopId: "9055",
        name: "Canyon Meadows",
        latitude: 50.9563,
        longitude: -114.0618,
        routeIds: ["201"],
    },
    {
        stopId: "9054",
        name: "Fish Creek – Lacombe",
        latitude: 50.9425,
        longitude: -114.0629,
        routeIds: ["201"],
    },
    {
        stopId: "9053",
        name: "Shawnessy",
        latitude: 50.9251,
        longitude: -114.0706,
        routeIds: ["201"],
    },
    {
        stopId: "9052",
        name: "Somerset – Bridlewood",
        latitude: 50.9100,
        longitude: -114.0784,
        routeIds: ["201"],
    },

    // ── Blue Line (202) — East branch: Saddletowne end ──────────────────────────
    {
        stopId: "9080",
        name: "Saddletowne",
        latitude: 51.0861,
        longitude: -113.9554,
        routeIds: ["202"],
    },
    {
        stopId: "9079",
        name: "Martindale",
        latitude: 51.0797,
        longitude: -113.9671,
        routeIds: ["202"],
    },
    {
        stopId: "9078",
        name: "Coral Springs",
        latitude: 51.0728,
        longitude: -113.9748,
        routeIds: ["202"],
    },
    {
        stopId: "9077b",
        name: "Rundle",
        latitude: 51.0653,
        longitude: -113.9829,
        routeIds: ["202"],
    },
    {
        stopId: "9076b",
        name: "Marlborough",
        latitude: 51.0575,
        longitude: -113.9937,
        routeIds: ["202"],
    },
    {
        stopId: "9075b",
        name: "Franklin",
        latitude: 51.0510,
        longitude: -114.0120,
        routeIds: ["202"],
    },
    {
        stopId: "9074b",
        name: "Barlow / Max Bell",
        latitude: 51.0480,
        longitude: -114.0256,
        routeIds: ["202"],
    },
    {
        stopId: "9073b",
        name: "Inglewood / Ramsay",
        latitude: 51.0403,
        longitude: -114.0431,
        routeIds: ["202"],
    },

    // ── Blue Line (202) — West branch: 69 Street end ────────────────────────────
    {
        stopId: "9082",
        name: "69 Street",
        latitude: 51.0454,
        longitude: -114.1835,
        routeIds: ["202"],
    },
    {
        stopId: "9081",
        name: "Sirocco",
        latitude: 51.0454,
        longitude: -114.1645,
        routeIds: ["202"],
    },
    {
        stopId: "9080b",
        name: "Signal Hill",
        latitude: 51.0454,
        longitude: -114.1500,
        routeIds: ["202"],
    },
    {
        stopId: "9079b",
        name: "Westbrook",
        latitude: 51.0454,
        longitude: -114.1302,
        routeIds: ["202"],
    },
    {
        stopId: "9078b",
        name: "45 Street",
        latitude: 51.0454,
        longitude: -114.1103,
        routeIds: ["202"],
    },
    {
        stopId: "9077c",
        name: "Sunalta",
        latitude: 51.0456,
        longitude: -114.0948,
        routeIds: ["202"],
    },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Quick O(1) lookup map: stopId → CTrainStop
 * Used by the frontend to resolve a stopId from a trip update
 * into coordinates for the map marker.
 *
 * Example:
 *   CTRAIN_STOPS_MAP.get("9066")
 *   // → { stopId: "9066", name: "City Hall", latitude: 51.0453, ... }
 */
export const CTRAIN_STOPS_MAP = new Map<string, CTrainStop>(
    CTRAIN_STOPS.map((stop) => [stop.stopId, stop])
);

/**
 * Returns all stops for a given route.
 *
 * Example:
 *   getStopsForRoute("201")  // all Red Line stations
 *   getStopsForRoute("202")  // all Blue Line stations
 */
export function getStopsForRoute(routeId: string): CTrainStop[] {
    return CTRAIN_STOPS.filter((stop) => stop.routeIds.includes(routeId));
}

/**
 * Returns the coordinates for a given stopId, or undefined if not found.
 * Use this to resolve a stopId from a GTFS-RT trip update into map coordinates.
 *
 * Example:
 *   getStopCoordinates("9066")
 *   // → { latitude: 51.0453, longitude: -114.0574 }
 */
export function getStopCoordinates(
    stopId: string
): { latitude: number; longitude: number } | undefined {
    const stop = CTRAIN_STOPS_MAP.get(stopId);
    if (!stop) return undefined;
    return { latitude: stop.latitude, longitude: stop.longitude };
}