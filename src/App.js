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
const API_URL = "http://localhost:5000";

export default function App() {
  const mapRef = useRef(null);
  const [map, setMap] = useState(null);
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [weather, setWeather] = useState(null);
  const [crimeData, setCrimeData] = useState([]);
  const [lights, setLights] = useState([]);
  const [eta, setEta] = useState(null); // still keep ETA state for map marker info
  const etaMarkerRef = useRef(null); // keep track of ETA marker on map

  // ✅ Initialize map
  useEffect(() => {
    if (!mapRef.current) return;
    const initMap = L.map(mapRef.current).setView([17.385, 78.4867], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(initMap);

    setMap(initMap);
  }, []);

  // ✅ Geocode using Nominatim (Free & Global)
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

  // ✅ Fetch Weather from Open-Meteo (Free)
  const fetchWeather = async (lat, lon) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`
      );
      const data = await res.json();
      setWeather({
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        condition: data.current.weather_code === 0 ? "Clear" : "Cloudy",
      });
    } catch (e) {
      console.error("Weather error:", e);
    }
  };

  // ✅ Fetch safety/crime info (Safetipin or fallback)
  // ✅ Fetch safety POIs from OpenStreetMap (always works)
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
        const name = el.tags.name || "Unknown Location";

        // calculate distance using Haversine formula
        const R = 6371e3;
        const φ1 = lat * (Math.PI / 180);
        const φ2 = el.lat * (Math.PI / 180);
        const Δφ = (el.lat - lat) * (Math.PI / 180);
        const Δλ = (el.lon - lon) * (Math.PI / 180);

        const a =
          Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) *
            Math.cos(φ2) *
            Math.sin(Δλ / 2) *
            Math.sin(Δλ / 2);
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return {
          type: el.tags.amenity.replace("_", " "), // readable
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

  // ✅ Fetch streetlight data from Overpass (OpenStreetMap)
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

  // small helper to clear previous non-base overlays (polyline, markers we added)
  const clearOverlays = () => {
    if (!map) return;
    map.eachLayer((layer) => {
      if (layer.options && layer.options.attribution) return; // base tiles
      if (layer instanceof L.TileLayer) return;
      map.removeLayer(layer);
    });

    // remove ETA marker if present
    if (etaMarkerRef.current) {
      try {
        map.removeLayer(etaMarkerRef.current);
      } catch (e) {}
      etaMarkerRef.current = null;
    }
  };

  // ✅ Handle Navigation (OSRM keyless routing)
  const handleNavigate = async () => {
      const token = localStorage.getItem("token");

      await fetch("http://localhost:5000/history/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source,
          destination,
        }),
      });
    if (!source || !destination) return;
    try {
      const src = await geocode(source);
      const dest = await geocode(destination);

      // clear overlays
      clearOverlays();

      // re-add base map (tile layer)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      // Markers
      const srcMarker = L.marker([src.lat, src.lon]).addTo(map);
      const destMarker = L.marker([dest.lat, dest.lon]).addTo(map);

      srcMarker.bindPopup(`<b>Source:</b><br>${src.displayName}`).openPopup();
      destMarker.bindPopup(`<b>Destination:</b><br>${dest.displayName}`);

      // Route (no key, via OSRM)
      const routeRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${src.lon},${src.lat};${dest.lon},${dest.lat}?overview=full&geometries=geojson`
      );
      const routeData = await routeRes.json();

      if (
        routeData.code !== "Ok" ||
        !routeData.routes ||
        routeData.routes.length === 0
      ) {
        throw new Error("No route found");
      }

      const coords = routeData.routes[0].geometry.coordinates.map((c) => [
        c[1],
        c[0],
      ]);
      const poly = L.polyline(coords, { color: "blue", weight: 4 }).addTo(map);
      map.fitBounds(poly.getBounds());

      // --- NEW: compute ETA using user's rule: 7-15 min per 2 km
      const distanceMeters = routeData.routes[0].distance || 0; // meters
      const distanceKm = distanceMeters / 1000;

      // lower: 7 min per 2 km => 3.5 min per km
      // upper: 15 min per 2 km => 7.5 min per km
      const lowerPerKm = 3.5; // minutes
      const upperPerKm = 7.5; // minutes

      const estMinLower = Math.max(1, distanceKm * lowerPerKm); // at least 1 minute
      const estMinUpper = Math.max(1, distanceKm * upperPerKm);

      const now = new Date();
      const arrivalLower = new Date(now.getTime() + estMinLower * 60000);
      const arrivalUpper = new Date(now.getTime() + estMinUpper * 60000);

      setEta({
        distanceKm: distanceKm.toFixed(2),
        lowerMinutes: Math.round(estMinLower),
        upperMinutes: Math.round(estMinUpper),
        arrivalLower: arrivalLower,
        arrivalUpper: arrivalUpper,
        osrmDurationSec: routeData.routes[0].duration || null,
      });

      // --- NEW: show ETA on the map as a DivIcon at the route midpoint
      if (coords.length > 0 && map) {
        // remove previous
        if (etaMarkerRef.current) {
          try { map.removeLayer(etaMarkerRef.current); } catch (e) {}
          etaMarkerRef.current = null;
        }

        const midIndex = Math.floor(coords.length / 2);
        const midPoint = coords[midIndex]; // [lat, lon]

        const etaHtml = `
          <div style="padding:8px 10px;border-radius:10px;background:rgba(17,24,39,0.95);color:#fff;border:1px solid rgba(156,163,175,0.12);font-size:12px;box-shadow:0 6px 18px rgba(0,0,0,0.4);">
            <div style="font-weight:600;margin-bottom:4px;">ETA</div>
            <div style="line-height:1.05">${Math.round(estMinLower)} - ${Math.round(estMinUpper)} min</div>
            <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">Arr: ${arrivalLower.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} - ${arrivalUpper.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        `;

        const icon = L.divIcon({
          className: "eta-div-icon",
          html: etaHtml,
          iconSize: [140, 48],
          iconAnchor: [70, 24],
        });

        const marker = L.marker(midPoint, { icon, interactive: false }).addTo(map);
        etaMarkerRef.current = marker;

        // keep popup on destination too
        destMarker.bindPopup(`
          <div style='min-width:160px'>
            <strong>ETA</strong><br/>
            Distance: ${distanceKm.toFixed(2)} km<br/>
            Time: ${Math.round(estMinLower)} - ${Math.round(estMinUpper)} min<br/>
            Arrival: ${arrivalLower.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})} - ${arrivalUpper.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}
          </div>
        `);
      }


      // Fetch all extra data
      fetchWeather(dest.lat, dest.lon);
      fetchCrimes(dest.lat, dest.lon);
      fetchStreetLights(dest.lat, dest.lon);
    } catch (e) {
      alert("Error finding route or locations.");
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-gray-800 shadow-lg">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield size={24} /> Safe Journey
        </h1>
        <Settings size={20} className="cursor-pointer" />
      </header>

      {/* Input Section */}
      <div className="flex flex-col md:flex-row items-center gap-4 p-4 bg-gray-800">
        <div className="flex items-center bg-gray-700 px-3 py-2 rounded-lg w-full md:w-1/3">
          <MapPin className="text-blue-400 mr-2" />
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Enter source"
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
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition"
        >
          <Activity size={18} /> Navigate
        </button>
      </div>

      {/* NOTE: Fixed/floating ETA panel removed — ETA is shown as a floating DivIcon on the map only */}

      {/* Map */}
      <div
        ref={mapRef}
        id="map"
        className="flex-1 w-full"
        style={{ minHeight: "400px" }}
      ></div>

      {/* Info Section */}
      <div className="p-4 bg-gray-800 border-t border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-4">
        {weather && (
          <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
              <Cloud /> Weather Update
            </h2>
            <p>Condition: {weather.condition}</p>
            <p>Temperature: {weather.temp}°C</p>
            <p>Humidity: {weather.humidity}%</p>
          </div>
        )}

        <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <AlertTriangle /> Nearby Safety
          </h2>
          {crimeData.length > 0 ? (
            <ul className="space-y-1">
              {crimeData.map((p, idx) => (
                <li key={idx}>
                  {p.name} ({p.type}) — {(p.distance / 1000).toFixed(2)} km away
                </li>
              ))}
            </ul>
          ) : (
            <p>No safety issues nearby 🚓</p>
          )}
        </div>

        <div className="flex flex-col bg-gray-700 p-4 rounded-lg">
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-2">
            <Lightbulb /> Streetlights
          </h2>
          <p>
            {lights.length > 0
              ? `${lights.length} streetlights found nearby 💡`
              : "No streetlight data available"}
          </p>
        </div>
      </div>
    </div>
  );
}
