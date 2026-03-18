/**
 * src/functions/getServiceAlerts.ts
 *
 * HTTP-triggered Azure Function that returns active service alerts
 * affecting CTrain routes (201 Red Line, 202 Blue Line).
 *
 * Endpoint: GET /api/ctrain/alerts
 *
 * Query parameters:
 *   route   (optional) — "201" or "202"
 *   active  (optional) — "true" (default) | "false" — filter to currently active alerts
 *
 * Response shape:
 * {
 *   meta: { timestamp, fetchedAt },
 *   alerts: CTrainServiceAlert[]
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import {
    CTRAIN_ROUTE_IDS,
    CTrainServiceAlert,
    ActivePeriod,
    InformedEntity,
    FeedMetadata,
    EFFECT_LABELS,
    CAUSE_LABELS,
    SEVERITY_LABELS,
    fetchGtfsFeed,
} from "../../shared/gtfsParser";
import { getCache, setCache } from "../../shared/cache";

// Alerts change less frequently — cache for 60 seconds
const CACHE_KEY = "service_alerts";
const ALERT_CACHE_TTL = 60;

async function handler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("getServiceAlerts triggered");

    try {
        const routeFilter = request.query.get("route") ?? null;
        // Default: only show currently-active alerts
        const activeOnly = request.query.get("active") !== "false";

        // ── Check cache ───────────────────────────────────────────────────────────
        const cached = await getCache<{ meta: FeedMetadata; alerts: CTrainServiceAlert[] }>(CACHE_KEY);

        let meta: FeedMetadata;
        let alerts: CTrainServiceAlert[];

        if (cached) {
            context.log("Serving service alerts from cache");
            ({ meta, alerts } = cached);
        } else {
            const feedUrl =
                process.env.GTFS_RT_SERVICE_ALERTS_PB ??
                "https://data.calgary.ca/download/jhgn-ynqj/application%2Fx-google-protobuf";

            const feed = await fetchGtfsFeed(feedUrl, process.env.CALGARY_TRANSIT_API_KEY);

            meta = {
                timestamp: feed.header.timestamp
                ? Number(feed.header.timestamp)
                : undefined,
                fetchedAt: new Date().toISOString(),
                incrementality: feed.header.incrementality?.toString(),
            };

            alerts = parseAlerts(feed);
            await setCache(CACHE_KEY, { meta, alerts }, ALERT_CACHE_TTL);
            context.log(`Fetched ${alerts.length} CTrain service alerts`);
        }

        // ── Filter to active time window ──────────────────────────────────────────
        const nowSeconds = Math.floor(Date.now() / 1000);

        let filtered = alerts;

        if (activeOnly) {
            filtered = filtered.filter((alert) =>
                isAlertActive(alert.activePeriods, nowSeconds)
            );
        }

        if (routeFilter && CTRAIN_ROUTE_IDS.has(routeFilter)) {
            filtered = filtered.filter((alert) =>
                alert.informedEntities.some(
                (e) =>
                    e.routeId === routeFilter ||
                    // route_type 1 = subway/metro (CTrain is classified as light rail / tram, type 0)
                    e.routeType === 0 ||
                    e.routeType === 1
                )
            );
        }

        return {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": `public, max-age=30`,
            },
            body: JSON.stringify({
                meta,
                count: filtered.length,
                alerts: filtered,
            }),
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        context.error("Error fetching service alerts:", message);
        
        return {
            status: 502,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error: "Failed to fetch service alerts",
                detail: message,
            }),
        };
    }
}

// ─── Parser ────────────────────────────────────────────────────────────────────

function parseAlerts(
    feed: GtfsRealtimeBindings.transit_realtime.FeedMessage
): CTrainServiceAlert[] {
    const result: CTrainServiceAlert[] = [];

    for (const entity of feed.entity) {
        if (!entity.alert) continue;

        const alert = entity.alert;

        // Determine if this alert pertains to any CTrain entity
        const informedEntities: InformedEntity[] = (
            alert.informedEntity ?? []
        ).map((ie) => ({
            routeId: ie.routeId ?? undefined,
            routeType:
                ie.routeType !== undefined ? Number(ie.routeType) : undefined,
            stopId: ie.stopId ?? undefined,
            tripId: ie.trip?.tripId ?? undefined,
            directionId:
                ie.trip?.directionId !== undefined
                ? Number(ie.trip.directionId)
                : undefined,
        }));

        // Check if any informed entity is CTrain-related
        const isCTrain = informedEntities.some(
            (ie) =>
                (ie.routeId && CTRAIN_ROUTE_IDS.has(ie.routeId)) ||
                ie.routeType === 0 || // light rail / tram
                ie.routeType === 1    // subway/metro
        );

        if (!isCTrain) continue;

        const activePeriods: ActivePeriod[] = (alert.activePeriod ?? []).map(
            (ap) => ({
                start: ap.start !== undefined ? Number(ap.start) : undefined,
                end: ap.end !== undefined ? Number(ap.end) : undefined,
            })
        );

        // Extract translated text (prefer English)
        const headerText = extractTranslation(alert.headerText);
        const descriptionText = extractTranslation(alert.descriptionText);
        const url = extractTranslation(alert.url);

        result.push({
            alertId: entity.id,
            effect:
                alert.effect !== undefined
                ? EFFECT_LABELS[alert.effect as number]
                : undefined,
            cause:
                alert.cause !== undefined
                ? CAUSE_LABELS[alert.cause as number]
                : undefined,
            activePeriods,
            informedEntities,
            headerText,
            descriptionText,
            url,
            severityLevel:
                alert.severityLevel !== undefined
                ? SEVERITY_LABELS[alert.severityLevel as number]
                : undefined,
        });
    }

    return result;
}

/**
 * Determines whether an alert is currently active based on its activePeriod list.
 * An alert with no activePeriods is treated as always-active.
 * An alert is active if the current time falls within ANY of its periods.
 */
function isAlertActive(periods: ActivePeriod[], nowSeconds: number): boolean {
    if (!periods || periods.length === 0) return true;

    return periods.some((p) => {
        const afterStart = p.start === undefined || nowSeconds >= p.start;
        const beforeEnd = p.end === undefined || nowSeconds < p.end;
        return afterStart && beforeEnd;
    });
}

/**
 * Extracts the English translation from a GTFS-RT TranslatedString,
 * falling back to the first available translation.
 */
function extractTranslation(
    translatedString:
        | GtfsRealtimeBindings.transit_realtime.ITranslatedString
        | null
        | undefined
): string | undefined {
    if (!translatedString?.translation?.length) return undefined;

    const englishEntry = translatedString.translation.find(
        (t) => t.language === "en" || t.language === "en-CA" || !t.language
    );

    return (englishEntry ?? translatedString.translation[0]).text ?? undefined;
}

// ─── Register the function ────────────────────────────────────────────────────

app.http("getServiceAlerts", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ctrain/alerts",
    handler,
});