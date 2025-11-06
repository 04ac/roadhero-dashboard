"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import "leaflet-polylinedecorator";

// Add polyline decorator for direction arrows
const PolylineDecorator =
  (L as any).PolylineDecorator || (L as any).polylineDecorator;

type Pothole = {
  latitude: number;
  longitude: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
  image_url?: string;
  description?: string;
};

type Ticket = {
  id: string;
  status: "ACTIVE" | "COMPLETE";
  created_at: string;
  pothole_metadata: Pothole;
};

/* Helper to auto-fit map bounds */
function FitToBounds({ tickets }: { tickets: Ticket[] }) {
  const map = useMap();

  useEffect(() => {
    if (!tickets.length) return;
    const bounds = L.latLngBounds(
      tickets.map((t) => [
        t.pothole_metadata.latitude,
        t.pothole_metadata.longitude,
      ])
    );
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [tickets, map]);

  return null;
}

/* Helper to render optimized routes using OSRM Trip API */
function RouteLine({
  tickets,
  onLoadingChange,
  optimizeRoute,
}: {
  tickets: Ticket[];
  onLoadingChange: (loading: boolean) => void;
  optimizeRoute: boolean;
}) {
  const map = useMap();
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const decoratorRef = useRef<any | null>(null);
  const isCalculatingRef = useRef(false);

  useEffect(() => {
    const stopLoading = () => {
      isCalculatingRef.current = false;
      onLoadingChange(false);
    };

    const clearRoute = () => {
      try {
        const layerMap = routePolylineRef.current?._map;
        (layerMap || map)?.removeLayer?.(routePolylineRef.current);
      } catch {}
      routePolylineRef.current = null;

      try {
        const decoratorMap = decoratorRef.current?._map;
        (decoratorMap || map)?.removeLayer?.(decoratorRef.current);
      } catch {}
      decoratorRef.current = null;
    };

    const cleanup = () => {
      stopLoading();
      clearRoute();
    };

    // Always clear routes first when effect runs (tickets or mode changed)
    clearRoute();

    // Early exits
    if (!tickets?.length || tickets.length < 2) {
      stopLoading();
      return;
    }

    // If already calculating, skip to avoid race conditions
    if (isCalculatingRef.current) {
      return;
    }

    // Start calculation
    isCalculatingRef.current = true;
    onLoadingChange(true);

    const coords = tickets.map((t) => [
      t.pothole_metadata.longitude,
      t.pothole_metadata.latitude,
    ]);

    const fetchOptimalRoute = async () => {
      try {
        clearRoute();

        const coordString = coords.map((c) => `${c[0]},${c[1]}`).join(";");

        let url: string;
        let routeCoords: [number, number][];

        if (optimizeRoute) {
          // For fully optimized route, use a simple greedy nearest-neighbor algorithm
          // since OSRM public API doesn't support full TSP optimization
          const unvisited = [...coords];
          const orderedCoords = [unvisited.shift()!]; // Start with first point

          while (unvisited.length > 0) {
            const last = orderedCoords[orderedCoords.length - 1];
            let nearestIdx = 0;
            let minDist = Infinity;

            unvisited.forEach((coord, idx) => {
              const dist = Math.sqrt(
                Math.pow(coord[0] - last[0], 2) +
                  Math.pow(coord[1] - last[1], 2)
              );
              if (dist < minDist) {
                minDist = dist;
                nearestIdx = idx;
              }
            });

            orderedCoords.push(unvisited.splice(nearestIdx, 1)[0]);
          }

          // Now get the route for the optimized order
          const optimizedString = orderedCoords
            .map((c) => `${c[0]},${c[1]}`)
            .join(";");
          url = `https://router.project-osrm.org/route/v1/driving/${optimizedString}?overview=full&geometries=geojson`;
        } else {
          // Severity-ordered route (keep original order)
          url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
        }

        console.log("Fetching route:", url);
        const response = await fetch(url);
        const data = await response.json();
        console.log("OSRM Response:", data);

        if (data.code === "Ok" && data.routes?.[0]) {
          const route = data.routes[0];
          routeCoords = route.geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as [number, number]
          );

          console.log(`Route calculated with ${routeCoords.length} points`);

          // Draw optimized route on map
          routePolylineRef.current = L.polyline(routeCoords, {
            color: optimizeRoute ? "#10b981" : "#2563eb",
            weight: 5,
            opacity: 0.75,
          }).addTo(map);

          // Add directional arrows to show travel direction
          if (PolylineDecorator) {
            decoratorRef.current = (L as any)
              .polylineDecorator(routePolylineRef.current, {
                patterns: [
                  {
                    offset: "5%",
                    repeat: "10%",
                    symbol: (L as any).Symbol.arrowHead({
                      pixelSize: 12,
                      pathOptions: {
                        fillOpacity: 1,
                        weight: 0,
                        color: optimizeRoute ? "#10b981" : "#2563eb",
                      },
                    }),
                  },
                ],
              })
              .addTo(map);
          }

          // Fit bounds to route
          map.fitBounds(routePolylineRef.current.getBounds(), {
            padding: [40, 40],
          });

          stopLoading();
        } else {
          console.error("OSRM returned error:", data.code, data.message);
          throw new Error(
            `Route optimization failed: ${data.message || data.code}`
          );
        }
      } catch (error) {
        console.error("OSRM Route API error:", error);
        // Fallback: draw simple straight lines
        const fallbackCoords = coords.map(
          (c) => [c[1], c[0]] as [number, number]
        );
        routePolylineRef.current = L.polyline(fallbackCoords, {
          color: "#4b5563",
          weight: 4,
          dashArray: "6 8",
          opacity: 0.7,
        }).addTo(map);
        stopLoading();
      }
    };

    // Add timeout safety
    const timeoutId = setTimeout(stopLoading, 15000);
    fetchOptimalRoute().finally(() => clearTimeout(timeoutId));

    return cleanup;
  }, [tickets, map, onLoadingChange, optimizeRoute]);

  return null;
}

export default function RealtimeMap({ tickets }: { tickets: Ticket[] }) {
  const [showRoutes, setShowRoutes] = useState(true);
  const [isCalculatingRoutes, setIsCalculatingRoutes] = useState(false);
  const [optimizeRoute, setOptimizeRoute] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const severityColors = { HIGH: "red", MEDIUM: "orange", LOW: "green" };
  const severityWeights = { HIGH: 3, MEDIUM: 2, LOW: 1 };

  const numberedIcon = (severity: string, number: number) =>
    L.divIcon({
      html: `<div style="
        background: ${severityColors[severity as keyof typeof severityColors]};
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 3px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">${number}</div>`,
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

  // Filter ACTIVE tickets and sort by severity → creation time
  const activeTickets = useMemo(
    () =>
      [...tickets]
        .filter((t) => t.status === "ACTIVE")
        .sort((a, b) => {
          const severityDiff =
            severityWeights[b.pothole_metadata.severity] -
            severityWeights[a.pothole_metadata.severity];
          return (
            severityDiff ||
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }),
    [tickets]
  );

  return (
    <div className="relative w-full h-[85vh] rounded-xl overflow-hidden shadow">
      {/* Control buttons */}
      <div className="absolute top-3 right-3 z-1001 flex gap-2">
        <button
          onClick={() => setOptimizeRoute((o) => !o)}
          className="bg-white/95 backdrop-blur-sm text-sm text-gray-700 font-medium border border-gray-200 rounded-lg px-3 py-1.5 shadow-md hover:shadow-lg hover:bg-gray-50 transition-all"
        >
          {optimizeRoute ? "🎯 Optimal Route" : "⚡ By Severity"}
        </button>
        <button
          onClick={() => setShowRoutes((s) => !s)}
          className="bg-white/95 backdrop-blur-sm text-sm text-gray-700 font-medium border border-gray-200 rounded-lg px-3 py-1.5 shadow-md hover:shadow-lg hover:bg-gray-50 transition-all"
        >
          {showRoutes ? "Hide Route" : "Show Route"}
        </button>
      </div>

      {/* Loading overlay */}
      {isCalculatingRoutes && showRoutes && (
        <div className="absolute inset-0 z-1000 flex items-center justify-center bg-white/70 backdrop-blur-sm">
          <div className="bg-white/90 backdrop-blur-md rounded-lg p-6 shadow-lg border border-gray-200 flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <div className="text-sm font-medium text-gray-700">
              Calculating Routes
            </div>
            <div className="text-xs text-gray-500">
              Finding optimal path between potholes...
            </div>
          </div>
        </div>
      )}

      <MapContainer
        center={[22.5726, 88.3639]}
        zoom={13}
        className="h-full w-full"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitToBounds tickets={activeTickets} />
        {showRoutes && (
          <RouteLine
            tickets={activeTickets}
            onLoadingChange={setIsCalculatingRoutes}
            optimizeRoute={optimizeRoute}
          />
        )}

        {activeTickets.map((t, index) => (
          <Marker
            key={t.id}
            position={[
              t.pothole_metadata.latitude,
              t.pothole_metadata.longitude,
            ]}
            icon={numberedIcon(t.pothole_metadata.severity, index + 1)}
          >
            <Popup>
              <div className="space-y-1 text-sm">
                <p>
                  <strong>#{index + 1} - Severity:</strong>{" "}
                  {t.pothole_metadata.severity}
                </p>
                <p>{t.pothole_metadata.description}</p>
                {t.pothole_metadata.image_url && (
                  <img
                    src={t.pothole_metadata.image_url}
                    alt="pothole"
                    className="rounded-md mt-2 w-36 cursor-pointer hover:opacity-80 transition"
                    onClick={() =>
                      setLightboxImage(t.pothole_metadata.image_url!)
                    }
                  />
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${t.pothole_metadata.latitude},${t.pothole_metadata.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-600 hover:underline text-xs mt-2"
                >
                  Navigate →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300 transition"
            onClick={() => setLightboxImage(null)}
          >
            ×
          </button>
          <img
            src={lightboxImage}
            alt="Pothole full view"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
