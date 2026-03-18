/**
 * shared/gtfsParser.ts
 *
 * Handles fetching and parsing Calgary Transit GTFS-RT protocol buffer feeds.
 * Filters to CTrain routes only (routes 201 and 202 — Red and Blue lines).
 *
 * Calgary Transit GTFS-RT feeds are standard protobuf (application/x-google-protobuf).
 * Data is refreshed by Calgary Transit every ~30 seconds.
 */

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

// ─── CTrain Route IDs ────────────────────────────────────────────────────────
// Based on Calgary Transit GTFS static data:
//   201 = Red Line (Somerset–Bridlewood ↔ Tuscany/Crowfoot)
//   202 = Blue Line (Saddletowne ↔ 69 Street)
export const CTRAIN_ROUTE_IDS = new Set(["201", "202"]);

// Human-readable line names for the frontend
export const CTRAIN_ROUTE_NAMES: Record<string, string> = {
    "201": "Red Line",
    "202": "Blue Line",
};

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface CTrainVehicle {
    vehicleId: string;
    label: string;
    routeId: string;
    routeName: string;
    tripId: string;
    directionId: number;
    latitude: number;
    longitude: number;
    bearing?: number;
    speed?: number; // m/s
    currentStopSequence?: number;
    currentStatus?: string; // "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO"
    stopId?: string;
    timestamp?: number; // Unix epoch seconds
    congestionLevel?: string;
    occupancyStatus?: string;
}

export interface CTrainTripUpdate {
    tripId: string;
    routeId: string;
    routeName: string;
    directionId?: number;
    startTime?: string;
    startDate?: string;
    scheduleRelationship?: string; // "SCHEDULED" | "CANCELED" | "ADDED"
    vehicleId?: string;
    stopTimeUpdates: StopTimeUpdate[];
}

export interface StopTimeUpdate {
    stopSequence?: number;
    stopId: string;
    arrival?: ArrivalDeparture;
    departure?: ArrivalDeparture;
    scheduleRelationship?: string; // "SCHEDULED" | "SKIPPED" | "NO_DATA"
}

export interface ArrivalDeparture {
    delay?: number; // seconds behind schedule (negative = early)
    time?: number;  // Unix epoch seconds
    uncertainty?: number;
}

export interface CTrainServiceAlert {
    alertId: string;
    effect?: string; // "NO_SERVICE" | "REDUCED_SERVICE" | "SIGNIFICANT_DELAYS" etc.
    cause?: string;  // "CONSTRUCTION" | "ACCIDENT" | "WEATHER" etc.
    activePeriods: ActivePeriod[];
    informedEntities: InformedEntity[];
    headerText?: string;
    descriptionText?: string;
    url?: string;
    severityLevel?: string;
}

export interface ActivePeriod {
    start?: number; // Unix epoch seconds
    end?: number;   // Unix epoch seconds
}

export interface InformedEntity {
    routeId?: string;
    routeType?: number;
    stopId?: string;
    tripId?: string;
    directionId?: number;
}

export interface FeedMetadata {
    timestamp?: number;
    fetchedAt: string; // ISO 8601
    incrementality?: string;
}

// ─── Feed Fetch Helper ────────────────────────────────────────────────────────

/**
 * Fetches a GTFS-RT protobuf feed from the given URL and returns the parsed
 * FeedMessage. Sends the Calgary Transit app token if provided.
 */
export async function fetchGtfsFeed(
    url: string,
    apiKey?: string
): Promise<GtfsRealtimeBindings.transit_realtime.FeedMessage> {
    const headers: Record<string, string> = {
        Accept: "application/x-google-protobuf, application/octet-stream",
    };

    if (apiKey) {
        // Calgary's Open Data platform accepts an app token as a header
        headers["X-App-Token"] = apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch GTFS-RT feed from ${url}: ${response.status} ${response.statusText}`
        );
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
        new Uint8Array(buffer)
    );

    return feed;
}

// ─── Effect / Cause label maps ────────────────────────────────────────────────

export const EFFECT_LABELS: Record<number, string> = {
    1: "NO_SERVICE",
    2: "REDUCED_SERVICE",
    3: "SIGNIFICANT_DELAYS",
    4: "DETOUR",
    5: "ADDITIONAL_SERVICE",
    6: "MODIFIED_SERVICE",
    7: "OTHER_EFFECT",
    8: "UNKNOWN_EFFECT",
    9: "STOP_MOVED",
    10: "NO_EFFECT",
    11: "ACCESSIBILITY_ISSUE",
};

export const CAUSE_LABELS: Record<number, string> = {
    1: "UNKNOWN_CAUSE",
    2: "OTHER_CAUSE",
    3: "TECHNICAL_PROBLEM",
    4: "STRIKE",
    5: "DEMONSTRATION",
    6: "ACCIDENT",
    7: "HOLIDAY",
    8: "WEATHER",
    9: "MAINTENANCE",
    10: "CONSTRUCTION",
    11: "POLICE_ACTIVITY",
    12: "MEDICAL_EMERGENCY",
};

export const VEHICLE_STATUS_LABELS: Record<number, string> = {
    0: "INCOMING_AT",
    1: "STOPPED_AT",
    2: "IN_TRANSIT_TO",
};

export const SCHEDULE_RELATIONSHIP_LABELS: Record<number, string> = {
    0: "SCHEDULED",
    1: "ADDED",
    2: "UNSCHEDULED",
    3: "CANCELED",
};

export const SEVERITY_LABELS: Record<number, string> = {
    1: "UNKNOWN_SEVERITY",
    2: "INFO",
    3: "WARNING",
    4: "SEVERE",
};