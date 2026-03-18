/**
 * src/functions/getVehiclePositions.ts
 *
 * HTTP-triggered Azure Function that returns real-time CTrain vehicle positions.
 *
 * Endpoint: GET /api/ctrain/vehicles
 *
 * Query parameters:
 *   route  (optional) — filter to "201" (Red Line) or "202" (Blue Line)
 *
 * Response shape:
 * {
 *   meta: { timestamp, fetchedAt, incrementality },
 *   vehicles: CTrainVehicle[]
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
    CTRAIN_ROUTE_IDS,
    CTRAIN_ROUTE_NAMES,
    CTrainVehicle,
    FeedMetadata,
    VEHICLE_STATUS_LABELS,
    fetchGtfsFeed,
} from "../../shared/gtfsParser";
import { getCache, setCache } from "../../shared/cache";

const CACHE_KEY = "vehicle_positions";

async function handler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("getVehiclePositions triggered");

    try {
        const ttl = parseInt(process.env.CACHE_TTL_SECONDS ?? "30", 10);
        const routeFilter = request.query.get("route") ?? null;

        // ── Check cache ───────────────────────────────────────────────────────────
        const cached = await getCache<{ meta: FeedMetadata; vehicles: CTrainVehicle[] }>(CACHE_KEY);

        let meta: FeedMetadata;
        let vehicles: CTrainVehicle[];

        if (cached) {
            context.log("Serving vehicle positions from cache");
            ({ meta, vehicles } = cached);
        } else {
            // ── Fetch live feed ─────────────────────────────────────────────────────
            const feedUrl =
                process.env.GTFS_RT_VEHICLE_POSITIONS_PB ??
                "https://data.calgary.ca/download/am7c-qe3u/application%2Fx-google-protobuf";

            const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);

            meta = {
                timestamp: feed.header.timestamp
                ? Number(feed.header.timestamp)
                : undefined,
                fetchedAt: new Date().toISOString(),
                incrementality: feed.header.incrementality?.toString(),
            };

            vehicles = parseVehicles(feed);

            await setCache(CACHE_KEY, { meta, vehicles }, ttl);
            context.log(`Fetched ${vehicles.length} CTrain vehicles from Calgary Transit API`);
        }

        // ── Apply optional route filter ───────────────────────────────────────────
        const filtered =
        routeFilter && CTRAIN_ROUTE_IDS.has(routeFilter)
            ? vehicles.filter((v) => v.routeId === routeFilter)
            : vehicles;

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${Math.floor(
                parseInt(process.env.CACHE_TTL_SECONDS ?? "30", 10) / 2
                )}`,
            },
            body: JSON.stringify({ meta, vehicles: filtered }),
        };
  } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        context.error("Error fetching vehicle positions:", message);

        return {
            status: 502,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "Failed to fetch vehicle positions",
                detail: message,
            }),
        };
    }
}

// ─── Parser ────────────────────────────────────────────────────────────────────

function parseVehicles(
    feed: GtfsRealtimeBindings.transit_realtime.FeedMessage
): CTrainVehicle[] {
    const vehicles: CTrainVehicle[] = [];

    for (const entity of feed.entity) {
        if (!entity.vehicle) continue;

        const vp = entity.vehicle;
        const trip = vp.trip;
        const position = vp.position;

        // Only include CTrain routes
        const routeId = trip?.routeId ?? "";
        if (!CTRAIN_ROUTE_IDS.has(routeId)) continue;

        // Require a valid GPS position
        if (
            !position ||
            typeof position.latitude !== "number" ||
            typeof position.longitude !== "number"
        ) {
            continue;
        }

        vehicles.push({
            vehicleId: vp.vehicle?.id ?? entity.id ?? "unknown",
            label: vp.vehicle?.label ?? vp.vehicle?.id ?? "Unknown",
            routeId,
            routeName: CTRAIN_ROUTE_NAMES[routeId] ?? routeId,
            tripId: trip?.tripId ?? "",
            directionId: trip?.directionId ?? 0,
            latitude: position.latitude,
            longitude: position.longitude,
            bearing:
                position.bearing !== undefined && position.bearing !== null
                ? Number(position.bearing)
                : undefined,
            speed:
                position.speed !== undefined && position.speed !== null
                ? Number(position.speed)
                : undefined,
            currentStopSequence:
                vp.currentStopSequence !== undefined
                ? Number(vp.currentStopSequence)
                : undefined,
            currentStatus:
                vp.currentStatus !== undefined
                ? VEHICLE_STATUS_LABELS[vp.currentStatus as number]
                : undefined,
            stopId: vp.stopId ?? undefined,
            timestamp: vp.timestamp ? Number(vp.timestamp) : undefined,
        });
    }

    return vehicles;
}

// ─── Register the function ────────────────────────────────────────────────────

app.http("getVehiclePositions", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ctrain/vehicles",
    handler,
});