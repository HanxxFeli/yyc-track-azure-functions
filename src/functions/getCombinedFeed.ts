/**
 * src/functions/getCombinedFeed.ts
 *
 * HTTP-triggered Azure Function that returns all three GTFS-RT feeds
 * (vehicle positions, trip updates, service alerts) in a single request.
 *
 * Designed for the frontend's initial page load to reduce round-trips.
 * Each feed is fetched concurrently and served from cache when warm.
 *
 * Endpoint: GET /api/ctrain/feed
 *
 * Query parameters:
 *   route  (optional) — "201" or "202" — filters vehicles and trips
 *
 * Response shape:
 * {
 *   meta: { fetchedAt, cacheHits },
 *   vehicles: CTrainVehicle[],
 *   trips: CTrainTripUpdate[],
 *   alerts: CTrainServiceAlert[]
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
    CTRAIN_ROUTE_IDS,
    CTRAIN_ROUTE_NAMES,
    CTrainVehicle,
    CTrainTripUpdate,
    CTrainServiceAlert,
    StopTimeUpdate,
    ActivePeriod,
    InformedEntity,
    VEHICLE_STATUS_LABELS,
    SCHEDULE_RELATIONSHIP_LABELS,
    EFFECT_LABELS,
    CAUSE_LABELS,
    SEVERITY_LABELS,
    fetchGtfsFeed,
} from "../../shared/gtfsParser";
import { getCache, setCache } from "../../shared/cache";

const CACHE_KEYS = {
    vehicles: "combined_vehicles",
    trips: "combined_trips",
    alerts: "combined_alerts",
};

async function handler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("getCombinedFeed triggered");

    const routeFilter = request.query.get("route") ?? null;
    const ttl = parseInt(process.env.CACHE_TTL_SECONDS ?? "30", 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    try {
        // ── Fetch all three feeds concurrently ─────────────────────────────────
        const [vehicleResult, tripResult, alertResult] = await Promise.allSettled([
            getVehicles(context, ttl),
            getTrips(context, ttl),
            getAlerts(context, ttl, nowSeconds),
        ]);

        const vehicles =
        vehicleResult.status === "fulfilled" ? vehicleResult.value.data : [];
        
        const trips =
        tripResult.status === "fulfilled" ? tripResult.value.data : [];
        
        const alerts =
        alertResult.status === "fulfilled" ? alertResult.value.data : [];

        const cacheHits = [
        vehicleResult.status === "fulfilled" && vehicleResult.value.fromCache,
        tripResult.status === "fulfilled" && tripResult.value.fromCache,
        alertResult.status === "fulfilled" && alertResult.value.fromCache,
        ].filter(Boolean).length;

        // Log any individual failures without crashing the whole response
        if (vehicleResult.status === "rejected") {
            context.error("Vehicle positions failed:", vehicleResult.reason);
        }
        if (tripResult.status === "rejected") {
            context.error("Trip updates failed:", tripResult.reason);
        }
        if (alertResult.status === "rejected") {
            context.error("Service alerts failed:", alertResult.reason);
        }

        // ── Apply optional route filter ─────────────────────────────────────────
        const filteredVehicles =
        routeFilter && CTRAIN_ROUTE_IDS.has(routeFilter)
            ? (vehicles as CTrainVehicle[]).filter((v) => v.routeId === routeFilter)
            : vehicles;

        const filteredTrips =
        routeFilter && CTRAIN_ROUTE_IDS.has(routeFilter)
            ? (trips as CTrainTripUpdate[]).filter((t) => t.routeId === routeFilter)
            : trips;

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=15`,
            },
            body: JSON.stringify({
                meta: {
                fetchedAt: new Date().toISOString(),
                cacheHits,
                feedsTotal: 3,
                feedsSucceeded:
                    [vehicleResult, tripResult, alertResult].filter(
                    (r) => r.status === "fulfilled"
                    ).length,
                },
                vehicles: filteredVehicles,
                trips: filteredTrips,
                alerts,
            }),
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        
        context.error("Fatal error in getCombinedFeed:", message);
        
        return {
            status: 502,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Failed to fetch combined feed", detail: message }),
        };
    }
}

// ─── Individual feed fetchers (with caching) ──────────────────────────────────

async function getVehicles(
    context: InvocationContext,
    ttl: number
): Promise<{ data: CTrainVehicle[]; fromCache: boolean }> {
    const cached = await getCache<CTrainVehicle[]>(CACHE_KEYS.vehicles);
    if (cached) return { data: cached, fromCache: true };

    const feedUrl =
        process.env.GTFS_RT_VEHICLE_POSITIONS_PB ??
        "https://data.calgary.ca/download/am7c-qe3u/application%2Fx-google-protobuf";

    const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);
    const vehicles: CTrainVehicle[] = [];

    for (const entity of feed.entity) {
        if (!entity.vehicle) continue;
        
        const vp = entity.vehicle;
        const routeId = vp.trip?.routeId ?? "";
        
        if (!CTRAIN_ROUTE_IDS.has(routeId)) continue;
        
        const position = vp.position;
        if (!position?.latitude || !position?.longitude) continue;

        vehicles.push({
            vehicleId: vp.vehicle?.id ?? entity.id ?? "unknown",
            label: vp.vehicle?.label ?? vp.vehicle?.id ?? "Unknown",
            routeId,
            routeName: CTRAIN_ROUTE_NAMES[routeId] ?? routeId,
            tripId: vp.trip?.tripId ?? "",
            directionId: vp.trip?.directionId ?? 0,
            latitude: position.latitude,
            longitude: position.longitude,
            bearing: position.bearing !== null ? Number(position.bearing) : undefined,
            speed: position.speed !== null ? Number(position.speed) : undefined,
            currentStopSequence: vp.currentStopSequence !== undefined
                ? Number(vp.currentStopSequence) : undefined,
            currentStatus: vp.currentStatus !== undefined
                ? VEHICLE_STATUS_LABELS[vp.currentStatus as number] : undefined,
            stopId: vp.stopId ?? undefined,
            timestamp: vp.timestamp ? Number(vp.timestamp) : undefined,
        });
    }

    await setCache(CACHE_KEYS.vehicles, vehicles, ttl);
    context.log(`Combined feed: fetched ${vehicles.length} vehicles`);
    
    return { 
        data: vehicles, 
        fromCache: false 
    };
}

async function getTrips(
    context: InvocationContext,
    ttl: number
): Promise<{ data: CTrainTripUpdate[]; fromCache: boolean }> {
    const cached = await getCache<CTrainTripUpdate[]>(CACHE_KEYS.trips);
    
    if (cached) return { 
        data: cached, 
        fromCache: true 
    };

    const feedUrl =
        process.env.GTFS_RT_TRIP_UPDATES_PB ??
        "https://data.calgary.ca/download/gs4m-mdc2/application%2Fx-google-protobuf";

    const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);
    const trips: CTrainTripUpdate[] = [];

    for (const entity of feed.entity) {
        if (!entity.tripUpdate) continue;
        
        const tu = entity.tripUpdate;
        const routeId = tu.trip?.routeId ?? "";
        
        if (!CTRAIN_ROUTE_IDS.has(routeId)) continue;

        const stopTimeUpdates: StopTimeUpdate[] = (tu.stopTimeUpdate ?? []).map((stu) => ({
            stopSequence: stu.stopSequence !== undefined ? Number(stu.stopSequence) : undefined,
            stopId: stu.stopId ?? "",
            arrival: stu.arrival ? {
                delay: stu.arrival.delay !== undefined ? Number(stu.arrival.delay) : undefined,
                time: stu.arrival.time !== undefined ? Number(stu.arrival.time) : undefined,
                uncertainty: stu.arrival.uncertainty !== undefined ? Number(stu.arrival.uncertainty) : undefined,
            } : undefined,
            departure: stu.departure ? {
                delay: stu.departure.delay !== undefined ? Number(stu.departure.delay) : undefined,
                time: stu.departure.time !== undefined ? Number(stu.departure.time) : undefined,
                uncertainty: stu.departure.uncertainty !== undefined ? Number(stu.departure.uncertainty) : undefined,
            } : undefined,
            scheduleRelationship: stu.scheduleRelationship !== undefined
                ? SCHEDULE_RELATIONSHIP_LABELS[stu.scheduleRelationship as number] : undefined,
        }));

        trips.push({
            tripId: tu.trip?.tripId ?? entity.id ?? "",
            routeId,
            routeName: CTRAIN_ROUTE_NAMES[routeId] ?? routeId,
            directionId: tu.trip?.directionId ?? undefined,
            startTime: tu.trip?.startTime ?? undefined,
            startDate: tu.trip?.startDate ?? undefined,
            scheduleRelationship: tu.trip?.scheduleRelationship !== undefined
                ? SCHEDULE_RELATIONSHIP_LABELS[tu.trip.scheduleRelationship as number] : undefined,
            vehicleId: tu.vehicle?.id ?? undefined,
            stopTimeUpdates,
        });
    }

    await setCache(CACHE_KEYS.trips, trips, ttl);
    context.log(`Combined feed: fetched ${trips.length} trip updates`);
    
    return { 
        data: trips, 
        fromCache: false 
    };
}

async function getAlerts(
    context: InvocationContext,
    ttl: number,
    nowSeconds: number
): Promise<{ data: CTrainServiceAlert[]; fromCache: boolean }> {
    const cached = await getCache<CTrainServiceAlert[]>(CACHE_KEYS.alerts);
    if (cached) return { data: cached, fromCache: true };

    const feedUrl =
        process.env.GTFS_RT_SERVICE_ALERTS_PB ??
        "https://data.calgary.ca/download/jhgn-ynqj/application%2Fx-google-protobuf";

    const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);
    const alerts: CTrainServiceAlert[] = [];

    for (const entity of feed.entity) {
        if (!entity.alert) continue;
        const alert = entity.alert;

        const informedEntities: InformedEntity[] = (alert.informedEntity ?? []).map((ie) => ({
            routeId: ie.routeId ?? undefined,
            routeType: ie.routeType !== undefined ? Number(ie.routeType) : undefined,
            stopId: ie.stopId ?? undefined,
            tripId: ie.trip?.tripId ?? undefined,
            directionId: ie.trip?.directionId !== undefined ? Number(ie.trip.directionId) : undefined,
        }));

        const isCTrain = informedEntities.some(
            (ie) => (ie.routeId && CTRAIN_ROUTE_IDS.has(ie.routeId)) || ie.routeType === 0 || ie.routeType === 1
        );
        
        if (!isCTrain) continue;

        const activePeriods: ActivePeriod[] = (alert.activePeriod ?? []).map((ap) => ({
            start: ap.start !== undefined ? Number(ap.start) : undefined,
            end: ap.end !== undefined ? Number(ap.end) : undefined,
        }));

        // Only include currently active alerts in the combined feed
            const isActive = activePeriods.length === 0 || activePeriods.some((p) => {
            const afterStart = p.start === undefined || nowSeconds >= p.start;
            const beforeEnd = p.end === undefined || nowSeconds < p.end;
            
            return afterStart && beforeEnd;
        });

        if (!isActive) continue;

        const headerText = extractTranslation(alert.headerText);
        const descriptionText = extractTranslation(alert.descriptionText);
        const url = extractTranslation(alert.url);

        alerts.push({
            alertId: entity.id,
            effect: alert.effect !== undefined ? EFFECT_LABELS[alert.effect as number] : undefined,
            cause: alert.cause !== undefined ? CAUSE_LABELS[alert.cause as number] : undefined,
            activePeriods,
            informedEntities,
            headerText,
            descriptionText,
            url,
            severityLevel: alert.severityLevel !== undefined
                ? SEVERITY_LABELS[alert.severityLevel as number] : undefined,
        });
    }

    await setCache(CACHE_KEYS.alerts, alerts, Math.max(ttl, 60));
    context.log(`Combined feed: fetched ${alerts.length} active alerts`);
    
    return { 
        data: alerts, 
        fromCache: false 
    };
}

function extractTranslation(
    translatedString: GtfsRealtimeBindings.transit_realtime.ITranslatedString | null | undefined
): string | undefined {
    if (!translatedString?.translation?.length) return undefined;

    const en = translatedString.translation.find(
        (t) => t.language === "en" || t.language === "en-CA" || !t.language
    );

    return (en ?? translatedString.translation[0]).text ?? undefined;
}

// ─── Register the function ────────────────────────────────────────────────────

app.http("getCombinedFeed", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ctrain/feed",
    handler,
});