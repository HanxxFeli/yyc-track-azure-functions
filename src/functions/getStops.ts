/**
 * src/functions/getStops.ts
 *
 * HTTP-triggered Azure Function that returns all CTrain station
 * coordinates. Used by the frontend to pin stations on the map.
 *
 * This data is static (stations don't move), so it is cached for
 * 24 hours and also gets a long browser Cache-Control header.
 *
 * Endpoint: GET /api/ctrain/stops
 *
 * Query parameters:
 *   route  (optional) — "201" (Red Line) or "202" (Blue Line)
 *
 * Response shape:
 * {
 *   stops: CTrainStop[]
 * }
 *
 * Example stop object:
 * {
 *   "stopId": "9066",
 *   "name": "City Hall",
 *   "latitude": 51.0453,
 *   "longitude": -114.0574,
 *   "routeIds": ["201", "202"]
 * }
 */

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
    CTRAIN_STOPS,
    getStopsForRoute,
} from "../../shared/ctrainStops";

// Stations are static — cache for 24 hours
const CACHE_SECONDS = 60 * 60 * 24;

async function handler(
    request: HttpRequest,
    context: InvocationContext
): Promise<HttpResponseInit> {
    context.log("getStops triggered");

    const routeFilter = request.query.get("route") ?? null;

    const stops =
        routeFilter === "201" || routeFilter === "202"
        ? getStopsForRoute(routeFilter)
        : CTRAIN_STOPS;

    return {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            // Long browser cache — station coordinates almost never change
            "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
        },
        body: JSON.stringify({ stops }),
    };
}

app.http("getStops", {
    methods: ["GET"],
    authLevel: "anonymous",
    route: "ctrain/stops",
    handler,
});