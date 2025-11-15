import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Navigation,
  Shield,
  AlertTriangle,
  Cloud,
  Activity,
  Settings,
  Lightbulb,
} from "lucide-react";

export default function App() {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [weather, setWeather] = useState(null);
  const [crimeData, setCrimeData] = useState([]);
  const [lights, setLights] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [safestRouteIndex, setSafestRouteIndex] = useState(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current) return;
    const initMap = L.map(mapRef.current).setView([17.385, 78.4867], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(initMap);

    setMap(initMap);
  }, []);

  // Geocode address
  const geocode = async (address) => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        address
      )}`
    );
    const data = await res.json();
    if (data.length === 0) throw new Error("Address not found");
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  };

  // Fetch weather
  const fetchWeather = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
      );
      const data = await res.json();
      setWeather({
        temp: Math.round(data.current_weather.temperature),
        condition: data.current_weather.weathercode === 0 ? "Clear" : "Cloudy",
      });
    } catch (e) {
      console.error("Weather error:", e);
    }
  };

  // Calculate safety score
  const calculateRouteSafety = async (coordinates) => {
    let totalSafetyScore = 0;
    const samplingPoints = 5;

    for (let i = 0; i < samplingPoints; i++) {
      const idx = Math.floor((coordinates.length / samplingPoints) * i);
      const [lat, lon] = coordinates[idx];

      const query = `
        [out:json];
        (
          node(around:500,${lat},${lon})["amenity"="police"];
          node(around:500,${lat},${lon})["amenity"="hospital"];
          node(around:500,${lat},${lon})["amenity"="fire_station"];
          node(around:800,${lat},${lon})["highway"="street_lamp"];
        );
        out count;
      `;

      try {
        const res = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: query,
        });
        const data = await res.json();
        totalSafetyScore += data.elements.length;
      } catch (e) {
        console.error("Safety score calculation error:", e);
      }
    }

    return totalSafetyScore;
  };

  // Fetch safety POIs
  const fetchCrimes = async (lat, lon) => {
    const query = `
      [out:json];
      (
        node(around:1500,${lat},${lon})["amenity"="police"];
        node(around:1500,${lat},${lon})["amenity"="hospital"];
        node(around:1500,${lat},${lon})["amenity"="fire_station"];
        node(around:1500,${lat},${lon})["amenity"="bus_station"];
        node(around:1500,${lat},${lon})["amenity"="school"];
      );
      out center;
    `;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      const data = await res.json();
      if (!data.elements || data.elements.length === 0) {
        setCrimeData([]);
        return;
      }

      const points = data.elements.map((el) => {
        const name = el.tags?.name || "Unknown Location";

        const R = 6371e3;
        const φ1 = lat * (Math.PI / 180);
        const φ2 = el.lat * (Math.PI / 180);
        const Δφ = (el.lat - lat) * (Math.PI / 180);
        const Δλ = (el.lon - lon) * (Math.PI / 180);

        const a =
          Math.sin(Δφ / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return {
          type: el.tags.amenity.replace("_", " "),
          name,
          distance: d,
        };
      });

      points.sort((a, b) => a.distance - b.distance);
      setCrimeData(points.slice(0, 5));
    } catch (e) {
      console.error("OSM safety fetch failed", e);
      setCrimeData([]);
    }
  };

  // Fetch streetlights
  const fetchStreetLights = async (lat, lon) => {
    const query = `
      [out:json];
      node(around:1000,${lat},${lon})["highway"="street_lamp"];
      out;
    `;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
      });
      const data = await res.json();
      const lights = data.elements.map((el) => ({
        lat: el.lat,
        lon: el.lon,
      }));
      setLights(lights);

      lights.forEach((lamp) => {
        L.circleMarker([lamp.lat, lamp.lon], {
          radius: 3,
          color: "yellow",
          fillColor: "yellow",
          fillOpacity: 0.7,
        })
          .addTo(map)
          .bindPopup("Street Light 💡");
      });
    } catch (err) {
      console.error("Streetlight fetch failed:", err);
    }
  };

  // Generate alternative routes
  const generateAlternativeRoutes = async (src, dest) => {
    const routes = [];

    // Direct route
    const directRoute = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${src.lon},${src.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
    );
    const directData = await directRoute.json();
    if (directData.code === "Ok" && directData.routes.length > 0) {
      routes.push(directData.routes[0]);
    }

    // Offset waypoints for alternative routes
    const latDiff = dest.lat - src.lat;
    const lonDiff = dest.lon - src.lon;

    const waypoint1 = {
      lat: src.lat + latDiff * 0.5 + lonDiff * 0.1,
      lon: src.lon + lonDiff * 0.5 - latDiff * 0.1,
    };
    const waypoint2 = {
      lat: src.lat + latDiff * 0.5 - lonDiff * 0.1,
      lon: src.lon + lonDiff * 0.5 + latDiff * 0.1,
    };

    // Route 2
    try {
      const route2 = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${src.lon},${src.lat};${waypoint1.lon},${waypoint1.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
      );
      const route2Data = await route2.json();
      if (route2Data.code === "Ok" && route2Data.routes.length > 0) {
        routes.push(route2Data.routes[0]);
      }
    } catch (e) {
      console.error("Route 2 error:", e);
    }

    // Route 3
    try {
      const route3 = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${src.lon},${src.lat};${waypoint2.lon},${waypoint2.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
      );
      const route3Data = await route3.json();
      if (route3Data.code === "Ok" && route3Data.routes.length > 0) {
        routes.push(route3Data.routes[0]);
      }
    } catch (e) {
      console.error("Route 3 error:", e);
    }

    return routes;
  };

  // Handle navigation
  const handleNavigate = async () => {
    if (!source || !destination) return;

    try {
      const src = await geocode(source);
      const dest = await geocode(destination);

      // Clear layers except tile layer
      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) return;
        map.removeLayer(layer);
      });

      const srcMarker = L.marker([src.lat, src.lon]).addTo(map);
      const destMarker = L.marker([dest.lat, dest.lon]).addTo(map);

      srcMarker.bindPopup(`<b>Source:</b><br>${src.displayName}`).openPopup();
      destMarker.bindPopup(`<b>Destination:</b><br>${dest.displayName}`);

      const routeData = await generateAlternativeRoutes(src, dest);
      if (routeData.length === 0) throw new Error("No routes found");

      const routesWithSafety = [];

      for (let i = 0; i < routeData.length; i++) {
        const coords = routeData[i].geometry.coordinates.map((c) => [c[1], c[0]]);
        const safetyScore = await calculateRouteSafety(coords);
        const distance = (routeData[i].distance / 1000).toFixed(2);
        const duration = Math.round(routeData[i].duration / 60);

        routesWithSafety.push({ coords, safetyScore, distance, duration });
      }

      // Determine safest route
      const safestIdx = routesWithSafety.reduce(
        (maxIdx, route, idx, arr) =>
          route.safetyScore > arr[maxIdx].safetyScore ? idx : maxIdx,
        0
      );

      setSafestRouteIndex(safestIdx);
      setRoutes(routesWithSafety);

      const routeColors = ["#3b82f6", "#8b5cf6", "#ef4444"];

      routesWithSafety.forEach((route, idx) => {
        const isSafest = idx === safestIdx;
        L.polyline(route.coords, {
          color: isSafest ? "#10b981" : routeColors[idx % routeColors.length],
          weight: isSafest ? 6 : 4,
          opacity: isSafest ? 1 : 0.6,
        })
          .addTo(map)
          .bindPopup(
            `<b>${isSafest ? "🛡 SAFEST ROUTE" : `Route ${idx + 1}`}</b><br>
             Distance: ${route.distance} km<br>
             Duration: ${route.duration} min<br>
             Safety Score: ${route.safetyScore}`
          );
      });

      map.fitBounds(L.polyline(routesWithSafety[0].coords).getBounds());

      fetchWeather(dest.lat, dest.lon);
      fetchCrimes(dest.lat, dest.lon);
      fetchStreetLights(dest.lat, dest.lon);
    } catch (e) {
      alert("Error finding routes: " + e.message);
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="flex items-center justify-between p-4 bg-gray-800 shadow-lg">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield size={24} /> Safe Journey Navigator
        </h1>
        <Settings size={20} className="cursor-pointer" />
      </header>

      <div className="flex flex-col md:flex-row items-center gap-4 p-4 bg-gray-800">
        <div className="flex items-center bg-gray-700 px-3 py-2 rounded-lg w-full md:w-1/3">
          <MapPin className="text-blue-400 mr-2" />
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Enter source location"
            className="bg-transparent outline-none w-full"
          />
        </div>

        <div className="flex items-center bg-gray-700 px-3 py-2 rounded-lg w-full md:w-1/3">
          <Navigation className="text-green-400 mr-2" />
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Enter destination"
            className="bg-transparent outline-none w-full"
          />
        </div>

        <button
          onClick={handleNavigate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition"
        >
          <Activity size={18} /> Find Routes
        </button>
      </div>

      <div
        ref={mapRef}
        id="map"
        className="flex-1 w-full"
        style={{ minHeight: "450px" }}
      ></div>

      <div className="p-4 bg-gray-800 border-t border-gray-700 grid grid-cols-1 md:grid-cols-4 gap-4">
        {routes.length > 0 && (
          <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-3">
              <Navigation /> Routes ({routes.length})
            </h2>
            {routes.map((route, idx) => (
              <div
                key={idx}
                className={`p-3 mb-2 rounded ${
                  idx === safestRouteIndex
                    ? "bg-green-600 font-bold border-2 border-green-400"
                    : "bg-gray-600"
                }`}
              >
                <p className="text-base">
                  {idx === safestRouteIndex ? "🛡 SAFEST " : ""}Route {idx + 1}
                </p>
                <p className="text-sm mt-1">
                  📍 {route.distance} km • ⏱ {route.duration} min
                </p>
                <p className="text-xs mt-1 opacity-90">
                  🔒 Safety Score: {route.safetyScore}
                </p>
              </div>
            ))}
          </div>
        )}

        {weather && (
          <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
              <Cloud /> Weather
            </h2>
            <p>🌤 {weather.condition}</p>
            <p>🌡 {weather.temp}°C</p>
          </div>
        )}

        <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <AlertTriangle /> Safety Points
          </h2>
          {crimeData.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {crimeData.map((p, idx) => (
                <li key={idx}>
                  {p.name} ({p.type}) — {(p.distance / 1000).toFixed(2)} km
                </li>
              ))}
            </ul>
          ) : (
            <p>✅ No concerns nearby</p>
          )}
        </div>

        <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Lightbulb /> Street Lighting
          </h2>
          <p>
            {lights.length > 0 ? `💡 ${lights.length} lights found` : "No data available"}
          </p>
        </div>
      </div>
    </div>
  );
}
