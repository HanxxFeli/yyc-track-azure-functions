/**
 * src/functions/getTripUpdates.ts
 *
 * HTTP-triggered Azure Function that returns real-time trip updates
 * (predicted arrival/departure times and delays) for CTrain.
 *
 * Endpoint: GET /api/ctrain/trips
 *
 * Query parameters:
 *   route     (optional) — "201" or "202"
 *   stopId    (optional) — filter to a specific stop (e.g., "9066")
 *   canceled  (optional) — "true" to include only canceled trips
 *
 * Response shape:
 * {
 *   meta: { timestamp, fetchedAt },
 *   trips: CTrainTripUpdate[]
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
    CTRAIN_ROUTE_IDS,
    CTRAIN_ROUTE_NAMES,
    CTrainTripUpdate,
    StopTimeUpdate,
    FeedMetadata,
    SCHEDULE_RELATIONSHIP_LABELS,
    fetchGtfsFeed,
} from "../../shared/gtfsParser";
import { getCache, setCache } from "../../shared/cache";

const CACHE_KEY = "trip_updates";

async function handler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("getTripUpdates triggered");

    try {
        const ttl = parseInt(process.env.CACHE_TTL_SECONDS ?? "30", 10);
        const routeFilter = request.query.get("route") ?? null;
        const stopFilter = request.query.get("stopId") ?? null;
        const canceledOnly = request.query.get("canceled") === "true";

        // ── Check cache ───────────────────────────────────────────────────────────
        const cached = await getCache<{ meta: FeedMetadata; trips: CTrainTripUpdate[] }>(CACHE_KEY);

        let meta: FeedMetadata;
        let trips: CTrainTripUpdate[];

        if (cached) {
            context.log("Serving trip updates from cache");
            ({ meta, trips } = cached);
        } else {
            const feedUrl =
                process.env.GTFS_RT_TRIP_UPDATES_PB ??
                "https://data.calgary.ca/download/gs4m-mdc2/application%2Fx-google-protobuf";

            const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);

            meta = {
                timestamp: feed.header.timestamp
                ? Number(feed.header.timestamp)
                : undefined,
                fetchedAt: new Date().toISOString(),
                incrementality: feed.header.incrementality?.toString(),
            };

            trips = parseTripUpdates(feed);
            await setCache(CACHE_KEY, { meta, trips }, ttl);
            context.log(`Fetched ${trips.length} CTrain trip updates`);
        }

        // ── Apply filters ─────────────────────────────────────────────────────────
        let filtered = trips;

        if (routeFilter && CTRAIN_ROUTE_IDS.has(routeFilter)) {
            filtered = filtered.filter((t) => t.routeId === routeFilter);
        }

        if (stopFilter) {
            filtered = filtered
                .map((t) => ({
                ...t,
                stopTimeUpdates: t.stopTimeUpdates.filter(
                    (s) => s.stopId === stopFilter
                ),
                }))
                .filter((t) => t.stopTimeUpdates.length > 0);
        }

        if (canceledOnly) {
            filtered = filtered.filter(
                (t) => t.scheduleRelationship === "CANCELED"
            );
        }

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=${Math.floor(ttl / 2)}`,
            },
            body: JSON.stringify({ meta, trips: filtered }),
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        context.error("Error fetching trip updates:", message);
        
        return {
            status: 502,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "Failed to fetch trip updates",
                detail: message,
            }),
        };
    }
}

// ─── Parser ────────────────────────────────────────────────────────────────────

function parseTripUpdates(
    feed: GtfsRealtimeBindings.transit_realtime.FeedMessage
): CTrainTripUpdate[] {
    const updates: CTrainTripUpdate[] = [];

    for (const entity of feed.entity) {
        if (!entity.tripUpdate) continue;

        const tu = entity.tripUpdate;
        const trip = tu.trip;

        const routeId = trip?.routeId ?? "";
        if (!CTRAIN_ROUTE_IDS.has(routeId)) continue;

        const stopTimeUpdates: StopTimeUpdate[] = (tu.stopTimeUpdate ?? []).map(
        (stu) => ({
            stopSequence:
            stu.stopSequence !== undefined ? Number(stu.stopSequence) : undefined,
            stopId: stu.stopId ?? "",
            arrival: stu.arrival
            ? {
                delay:
                    stu.arrival.delay !== undefined
                    ? Number(stu.arrival.delay)
                    : undefined,
                time:
                    stu.arrival.time !== undefined
                    ? Number(stu.arrival.time)
                    : undefined,
                uncertainty:
                    stu.arrival.uncertainty !== undefined
                    ? Number(stu.arrival.uncertainty)
                    : undefined,
                }
            : undefined,
            departure: stu.departure
            ? {
                delay:
                    stu.departure.delay !== undefined
                    ? Number(stu.departure.delay)
                    : undefined,
                time:
                    stu.departure.time !== undefined
                    ? Number(stu.departure.time)
                    : undefined,
                uncertainty:
                    stu.departure.uncertainty !== undefined
                    ? Number(stu.departure.uncertainty)
                    : undefined,
                }
            : undefined,
            scheduleRelationship:
            stu.scheduleRelationship !== undefined
                ? SCHEDULE_RELATIONSHIP_LABELS[stu.scheduleRelationship as number]
                : undefined,
        })
        );

        updates.push({
            tripId: trip?.tripId ?? entity.id ?? "",
            routeId,
            routeName: CTRAIN_ROUTE_NAMES[routeId] ?? routeId,
            directionId: trip?.directionId ?? undefined,
            startTime: trip?.startTime ?? undefined,
            startDate: trip?.startDate ?? undefined,
            scheduleRelationship:
                trip?.scheduleRelationship !== undefined
                ? SCHEDULE_RELATIONSHIP_LABELS[trip.scheduleRelationship as number]
                : undefined,
            vehicleId: tu.vehicle?.id ?? undefined,
            stopTimeUpdates,
        });
    }

    return updates;
}

// ─── Register the function ────────────────────────────────────────────────────

app.http("getTripUpdates", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ctrain/trips",
    handler,
});