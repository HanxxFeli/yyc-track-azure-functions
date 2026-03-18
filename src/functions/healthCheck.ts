/**
 * src/functions/healthCheck.ts
 *
 * Simple health check endpoint used by your deployment pipeline and
 * uptime monitors to verify the Function App is running.
 *
 * Endpoint: GET /api/health
 *
 * Response shape:
 * {
 *   status: "ok",
 *   timestamp: "2025-...",
 *   feeds: { vehiclePositions: bool, tripUpdates: bool, serviceAlerts: bool },
 *   env: { apiKeyConfigured: bool, cacheTtl: number }
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

async function handler(
    _request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("healthCheck triggered");

    const feedUrls = {
        vehiclePositions: !!process.env.GTFS_RT_VEHICLE_POSITIONS_PB,
        tripUpdates: !!process.env.GTFS_RT_TRIP_UPDATES_PB,
        serviceAlerts: !!process.env.GTFS_RT_SERVICE_ALERTS_PB,
    };

    return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            status: "ok",
            service: "yyc-track-azure-functions",
            timestamp: new Date().toISOString(),
            feeds: feedUrls,
            env: {
                apiKeyConfigured: !!process.env.CALGARY_TRANSIT_API_KEY,
                cacheTtlSeconds: parseInt(process.env.CACHE_TTL_SECONDS ?? "30", 10),
                nodeVersion: process.version,
            },
        }),
    };
}

app.http("healthCheck", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "health",
    handler,
});