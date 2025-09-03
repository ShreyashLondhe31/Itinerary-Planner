// script.js

class TravelPlanner {
  constructor() {
    this.map = null;
    this.sourceMarker = null;
    this.destinationMarker = null;
    this.routeLayer = null;
    this.sourceLocation = null;
    this.destinationLocation = null;
    this.stops = [];
    this.recommendations = [];
    this.recommendationMarkers = []; // Track recommendation markers
    // No local locationDatabase needed if fully API-driven
    this.initializeMap();
    this.bindEvents();
  }

  // --- Nominatim helpers ---
  async geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(
      query
    )}&limit=5`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Geocoding failed");
    return res.json(); // array of results
  }

  async reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Reverse geocoding failed");
    return res.json(); // single result
  }

  // createLocationDatabase() method is DELETED

  initializeMap() {
    // Initialize map centered on India (initial view, not hardcoded data)
    this.map = L.map("map").setView([20.5937, 78.9629], 5);

    // Add OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(this.map);

    // Add click event to map
    this.map.on("click", (e) => this.handleMapClick(e));
  }

  handleMapClick = (e) => {
    const { lat, lng } = e.latlng;

    // Drop a temporary marker immediately
    const tempPopup = L.popup()
      .setLatLng(e.latlng)
      .setContent(
        `<div class="popup-content"><p>Loading place info...</p></div>`
      )
      .openOn(this.map);

    // Async reverse geocode
    this.reverseGeocode(lat, lng)
      .then((data) => {
        const displayName =
          data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        const country =
          (data.address &&
            (data.address.country || data.address.country_code)) ||
          "Unknown";
        this.showLocationPopup(
          { lat, lng },
          {
            display_name: displayName,
            address: {
              country,
              coordinates: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            },
          }
        );
      })
      .catch((error) => {
        console.error("Reverse geocoding failed:", error);
        // Fallback to just coordinates if API fails
        this.showLocationPopup(
          { lat, lng },
          {
            display_name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            address: {
              country: "Unknown",
              coordinates: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
            },
          }
        );
      });
  };

  // generateLocationInfo() method is DELETED
  // getRegionName() method is DELETED

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  showLocationPopup(latlng, locationData) {
    const address = locationData.address || {};
    const popupContent = document.createElement("div");
    popupContent.className = "popup-content";

    popupContent.innerHTML = `
                    <h3>📍 ${locationData.display_name}</h3>
                    <p><strong>Country:</strong> ${address.country || "—"}</p>
                    <p><strong>Coordinates:</strong> ${address.coordinates || "—"
      }</p>
                    <div style="margin-top: 10px;">
                        <button class="popup-btn" id="setSourceBtn">Set as Source</button>
                        <button class="popup-btn" id="setDestBtn">Set as Destination</button>
                    </div>
                `;

    const popup = L.popup()
      .setLatLng(latlng)
      .setContent(popupContent)
      .openOn(this.map);

    // Bind safely AFTER popup is added
    setTimeout(() => {
      document.getElementById("setSourceBtn").onclick = () =>
        this.setAsSource(latlng.lat, latlng.lng, locationData.display_name);

      document.getElementById("setDestBtn").onclick = () =>
        this.setAsDestination(
          latlng.lat,
          latlng.lng,
          locationData.display_name
        );
    }, 50);
  }

  setAsSource(lat, lng, name) {
    this.sourceLocation = { lat, lng, name };
    document.getElementById("source").value = name;

    if (this.sourceMarker) {
      this.map.removeLayer(this.sourceMarker);
    }

    this.sourceMarker = L.marker([lat, lng])
      .addTo(this.map)
      .bindPopup(`🚀 Source: ${name}`);

    this.map.closePopup();
    this.checkAndPlanRoute();
  }

  setAsDestination(lat, lng, name) {
    this.destinationLocation = { lat, lng, name };
    document.getElementById("destination").value = name;

    if (this.destinationMarker) {
      this.map.removeLayer(this.destinationMarker);
    }

    this.destinationMarker = L.marker([lat, lng])
      .addTo(this.map)
      .bindPopup(`🎯 Destination: ${name}`);

    this.map.closePopup();
    this.checkAndPlanRoute();
  }

  async searchLocation(query, type) {
    const trimmed = (query || "").trim();
    if (!trimmed) return;

    try {
      const results = await this.geocode(trimmed);
      if (Array.isArray(results) && results.length > 0) {
        const top = results[0];
        const lat = parseFloat(top.lat);
        const lng = parseFloat(top.lon);
        const name = top.display_name || trimmed;

        if (type === "source") {
          this.setAsSource(lat, lng, name);
        } else {
          this.setAsDestination(lat, lng, name);
        }

        this.map.setView([lat, lng], 12);
      } else {
        alert(`No results for "${trimmed}". Try a more specific place name.`);
      }
    } catch (err) {
      alert(
        "Could not reach the geocoding service. Check your connection and try again."
      );
    }
  }

  async checkAndPlanRoute() {
    if (this.sourceLocation && this.destinationLocation) {
      this.planRoute();
      this.getRecommendations();
      this.showExportButtons();
    }
  }

  planRoute() {
    // Collect all active points (source, stops, destination)
    let waypoints = [];
    if (this.sourceLocation) {
      waypoints.push(L.latLng(this.sourceLocation.lat, this.sourceLocation.lng));
    }

    this.stops.forEach((stop) => {
      if (stop) {
        waypoints.push(L.latLng(stop.lat, stop.lng));
      }
    });

    if (this.destinationLocation) {
      waypoints.push(L.latLng(this.destinationLocation.lat, this.destinationLocation.lng));
    }

    if (waypoints.length < 2) return; // Need at least 2 points

    // Remove old route
    if (this.routeLayer) {
      this.map.removeControl(this.routeLayer);
    }

    // Get route preference
    const option = document.getElementById("routeOption").value;
    let routingProfile = 'driving'; // default

    // Create routing control with waypoints
    this.routeLayer = L.Routing.control({
      waypoints: waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      createMarker: function () { return null; }, // Don't create default markers
      lineOptions: {
        styles: [
          {
            color: '#ff6b6b',
            weight: 6,
            opacity: 0.8
          }
        ]
      },
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        profile: routingProfile
      }),
      formatter: new L.Routing.Formatter({
        language: 'en'
      }),
      show: false, // Hide the instruction panel
      createMarker: function () { return null; } // Don't override our custom markers
    }).addTo(this.map);

    // Listen for route found event to update UI
    this.routeLayer.on('routesfound', (e) => {
      const routes = e.routes;
      const summary = routes[0].summary;

      // Update distance and time from actual route
      const distanceKm = (summary.totalDistance / 1000).toFixed(0);
      const timeMinutes = Math.round(summary.totalTime / 60);

      document.getElementById("distance").textContent = `${distanceKm} km`;

      if (timeMinutes < 60) {
        document.getElementById("duration").textContent = `${timeMinutes} min`;
      } else {
        const hours = Math.floor(timeMinutes / 60);
        const mins = timeMinutes % 60;
        document.getElementById("duration").textContent =
          mins === 0 ? `${hours} h` : `${hours}h ${mins}m`;
      }

      // Calculate cost based on actual distance
      let costPerKm = 10;
      if (option === "cheapest") {
        costPerKm = 6;
      } else if (option === "scenic") {
        costPerKm = 8;
      }

      const cost = Math.round(distanceKm * costPerKm);

      // Update route type
      document.getElementById("routeType").textContent =
        option.charAt(0).toUpperCase() + option.slice(1) + " Route";

      // Add/update cost field
      if (!document.getElementById("tripCost")) {
        const p = document.createElement("p");
        p.innerHTML = `<strong>Estimated Cost:</strong> <span id="tripCost">-</span>`;
        document.getElementById("routeInfo").appendChild(p);
      }
      document.getElementById("tripCost").textContent = `₹${cost}`;

      // Show route info
      document.getElementById("routeInfo").style.display = "block";
    });

    // Handle routing errors
    this.routeLayer.on('routingerror', (e) => {
      console.error('Routing error:', e);
      alert('Could not find a route between the selected points. Please try different locations.');
    });
  }

  async getRecommendations() {
    document.getElementById("recommendationsContent").innerHTML =
      '<p class="loading">Loading recommendations...</p>';

    const sourceRecs = await this.getLocationRecommendations(
      this.sourceLocation
    );
    const destRecs = await this.getLocationRecommendations(
      this.destinationLocation
    );

    this.recommendations = [
      ...sourceRecs.map((r) => ({ ...r, area: "Source Area" })),
      ...destRecs.map((r) => ({ ...r, area: "Destination Area" })),
    ];

    this.displayRecommendations();
  }

  async getLocationRecommendations(location) {
    if (!location) return [];

    const lat = location.lat;
    const lon = location.lng;

    // Fetch mainly tourist places, museums, historic sites, parks using Overpass API
    const query = `
                  [out:json][timeout:25];
                  (
                  node["tourism"~"attraction|museum|gallery|zoo|theme_park"](around:5000,${lat},${lon});
                  node["historic"](around:5000,${lat},${lon});
                  node["leisure"="park"](around:5000,${lat},${lon});
                  );
                  out center 15;
              `;

    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "text/plain" },
      });
      const data = await res.json();

      if (!data.elements) return [];

      return data.elements.map((el) => {
        const localName = el.tags.name || "";
        const engName = el.tags["name:en"] || "";
        let displayName;
        if (engName && engName !== localName) {
          displayName = `${localName} (${engName})`;
        } else if (localName) {
          displayName = `${localName}`;
        } else {
          displayName = "Unnamed Place";
        }

        return {
          name: displayName || "Unnamed Place",
          type: el.tags.tourism || el.tags.historic || el.tags.leisure || "place",
          description:
            el.tags["description"] ||
            (el.tags.historic
              ? `Historic site`
              : el.tags.tourism
                ? `Tourist attraction`
                : el.tags.leisure
                  ? `Leisure spot`
                  : "Nearby place"),
          lat: el.lat, // Include coordinates from Overpass
          lng: el.lon, // Include coordinates from Overpass
        };
      });
    } catch (err) {
      console.error("Overpass fetch failed:", err);
      return [];
    }
  }

  displayRecommendations() {
    const container = document.getElementById("recommendationsContent");

    // Clear existing recommendation markers
    this.clearRecommendationMarkers();

    if (this.recommendations.length === 0) {
      container.innerHTML = "<p>No recommendations found for this route.</p>";
      return;
    }

    const groupedByArea = this.recommendations.reduce((groups, rec) => {
      if (!groups[rec.area]) groups[rec.area] = [];
      groups[rec.area].push(rec);
      return groups;
    }, {});

    let html = "";
    Object.keys(groupedByArea).forEach((area) => {
      html += `<h3 style="margin: 20px 0 15px 0; color: #333;">${area}</h3>`;
      groupedByArea[area].forEach((rec, index) => {
        const recId = `rec-${area.replace(/\s+/g, '')}-${index}`;
        html += `
        <div class="recommendation-item" data-rec-id="${recId}">
          <h4>${rec.name}</h4>
          <p>${rec.description}</p>
          <span class="category-tag">${rec.type}</span>
          <button class="btn-small show-on-map" data-lat="${rec.lat}" data-lng="${rec.lng}" data-name="${rec.name}">
            📍 Show on Map
          </button>
        </div>
      `;
      });
    });

    container.innerHTML = html;

    // Add map markers for all recommendations
    this.addRecommendationMarkers();

    // Bind show on map buttons
    container.querySelectorAll('.show-on-map').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lat = parseFloat(e.target.dataset.lat);
        const lng = parseFloat(e.target.dataset.lng);
        const name = e.target.dataset.name;

        // Center map on this location
        this.map.setView([lat, lng], 15);

        // Open popup for this marker
        const marker = this.recommendationMarkers.find(m =>
          m.getLatLng().lat === lat && m.getLatLng().lng === lng
        );
        if (marker) {
          marker.openPopup();
        }
      });
    });
  }

  // Method to add recommendation markers to map
  addRecommendationMarkers() {
    this.recommendations.forEach((rec) => {
      if (rec.lat && rec.lng) {
        // Create custom icon for recommendations
        const icon = L.divIcon({
          className: 'recommendation-marker',
          html: this.getRecommendationIcon(rec.type),
          iconSize: [25, 25],
          iconAnchor: [12, 12],
          popupAnchor: [0, -15]
        });

        const marker = L.marker([rec.lat, rec.lng], { icon })
          .addTo(this.map)
          .bindPopup(`
          <div class="recommendation-popup">
            <h4>${rec.name}</h4>
            <p><strong>Type:</strong> ${rec.type}</p>
            <p>${rec.description}</p>
            <p><strong>Area:</strong> ${rec.area}</p>
          </div>
        `);

        this.recommendationMarkers.push(marker);
      }
    });
  }

  // Method to clear recommendation markers
  clearRecommendationMarkers() {
    this.recommendationMarkers.forEach(marker => {
      this.map.removeLayer(marker);
    });
    this.recommendationMarkers = [];
  }

  // Get appropriate icon for recommendation type
  getRecommendationIcon(type) {
    const iconMap = {
      'attraction': '🎯',
      'museum': '🏛️',
      'gallery': '🖼️',
      'zoo': '🦁',
      'theme_park': '🎢',
      'historic': '🏛️',
      'park': '🌳',
      'place': '📍',
      'fort': '🏰',
      'palace': '🏰',
      'temple': '🛕',
      'church': '⛪',
      'monument': '🗿'
    };

    return iconMap[type] || '📍';
  }

  clearRoute() {
    // Clear source marker
    if (this.sourceMarker) {
      this.map.removeLayer(this.sourceMarker);
      this.sourceMarker = null;
    }

    // Clear destination marker
    if (this.destinationMarker) {
      this.map.removeLayer(this.destinationMarker);
      this.destinationMarker = null;
    }

    // Clear routing control (route layer)
    if (this.routeLayer) {
      this.map.removeControl(this.routeLayer);
      this.routeLayer = null;
    }

    // Clear all stop input groups from the UI
    this.stops.forEach((stop, index) => {
      const stopGroup = document.getElementById(`stop-group-${index}`);
      if (stopGroup) stopGroup.remove();
    });
    this.stops = [];

    // Clear input fields and UI elements
    document.getElementById("source").value = "";
    document.getElementById("destination").value = "";
    document.getElementById("routeInfo").style.display = "none";
    document.getElementById("recommendationsContent").innerHTML =
      '<p class="loading">Select source and destination to get recommendations...</p>';
    document.getElementById("exportButtons").style.display = "none";

    // Reset stored locations and recommendations
    this.sourceLocation = null;
    this.destinationLocation = null;
    this.recommendations = [];

    // Clear recommendation markers from the map
    this.clearRecommendationMarkers();

    // Reset map view to default
    this.map.setView([20.5937, 78.9629], 5);
  }


  showExportButtons() {
    document.getElementById("exportButtons").style.display = "block";
  }

  exportAsPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(102, 126, 234);
    doc.text("Travel Itinerary", 20, 30);

    // Trip details
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("Trip Details:", 20, 50);
    doc.setFontSize(12);
    doc.text(`Source: ${this.sourceLocation.name}`, 20, 65);
    doc.text(`Destination: ${this.destinationLocation.name}`, 20, 75);

    // Route info
    const distance = document.getElementById("distance").textContent;
    const duration = document.getElementById("duration").textContent;
    doc.text(`Distance: ${distance}`, 20, 85);
    doc.text(`Estimated Time: ${duration}`, 20, 95);

    // Recommendations
    doc.setFontSize(14);
    doc.text("Recommendations:", 20, 115);

    let yPosition = 130;
    doc.setFontSize(10);

    this.recommendations.forEach((rec, index) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      doc.text(`${rec.name} (${rec.type}) - ${rec.area}`, 20, yPosition);
      yPosition += 7;
      doc.text(`${rec.description}`, 25, yPosition);
      yPosition += 15;
    });

    doc.save("travel-itinerary.pdf");
  }

  // --- AUTOCOMPLETE using Nominatim API ---
  async autocomplete(query, type) {
    if (query.length < 2) {
      this.clearSuggestions(type);
      return;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(query)}&limit=5`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Autocomplete geocoding failed");
      const data = await res.json();
      this.showSuggestions(data, type);
    } catch (error) {
      console.error("Autocomplete error:", error);
      this.clearSuggestions(type);
    }
  }

  showSuggestions(results, type) {
    const isStop = type && type.startsWith("stop-");
    const boxId = isStop ? type + "-suggestions" :
      (type === 'source' ? 'sourceSuggestions' : 'destinationSuggestions');

    const box = document.getElementById(boxId);
    if (!box) return;

    box.innerHTML = '';
    box.style.display = results.length ? 'block' : 'none';

    results.forEach(place => {
      let fullName = place.display_name;

      let div = document.createElement("div");
      div.textContent = fullName;

      div.onclick = () => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);

        if (type === 'source') {
          this.setAsSource(lat, lng, fullName);
          document.getElementById('source').value = fullName;
        } else if (type === 'destination') {
          this.setAsDestination(lat, lng, fullName);
          document.getElementById('destination').value = fullName;
        } else if (isStop) {
          const index = parseInt(type.split("-")[1]);
          this.stops[index] = { lat, lng, name: fullName };
          document.getElementById(type).value = fullName;
        }

        this.saveRecent(fullName);
        box.innerHTML = '';
        box.style.display = 'none';
        this.checkAndPlanRoute();
      };
      box.appendChild(div);
    });
  }


  clearSuggestions(type) {
    const box = document.getElementById(
      type === "source" ? "sourceSuggestions" : "destinationSuggestions"
    );
    box.innerHTML = "";
    box.style.display = "none";
  }

  // --- RECENT & FAVORITES (localStorage) ---
  saveRecent(location) {
    let recent = JSON.parse(localStorage.getItem("recent")) || [];
    if (!recent.includes(location)) {
      recent.unshift(location);
    }
    if (recent.length > 5) recent.pop();
    localStorage.setItem("recent", JSON.stringify(recent));
  }

  renderFavorites(type) {
    const containerId = type === "source" ? "sourceFavorites" : "destinationFavorites";
    const container = document.getElementById(containerId);
    const favorites = this.getFavorites();
    container.innerHTML = "";
    if (favorites.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    favorites.forEach((fav) => {
      const btn = document.createElement("button");
      btn.textContent = fav;
      btn.title = `Set as ${type}`;
      btn.addEventListener("click", () => {
        if (type === "source") {
          this.searchLocation(fav, "source");
          document.getElementById("source").value = fav;
        } else {
          this.searchLocation(fav, "destination");
          document.getElementById("destination").value = fav;
        }
        this.updateFavoriteToggle(type);
      });
      container.appendChild(btn);
    });
  }

  updateFavoriteToggle(type) {
    const inputId = type === "source" ? "source" : "destination";
    const toggleId = type === "source" ? "toggleSourceFavorite" : "toggleDestinationFavorite";
    const val = document.getElementById(inputId).value.trim();
    const toggleBtn = document.getElementById(toggleId);
    const favorites = this.getFavorites();
    if (val && favorites.includes(val)) {
      toggleBtn.classList.add("active");
      toggleBtn.title = "Remove from favorites";
    } else {
      toggleBtn.classList.remove("active");
      toggleBtn.title = "Add to favorites";
    }
  }

  toggleFavorite(location) {
    let favs = JSON.parse(localStorage.getItem("favorites")) || [];
    if (favs.includes(location)) {
      favs = favs.filter((f) => f !== location);
    } else {
      favs.push(location);
    }
    localStorage.setItem("favorites", JSON.stringify(favs));
  }

  getRecent() {
    return JSON.parse(localStorage.getItem("recent")) || [];
  }

  getFavorites() {
    return JSON.parse(localStorage.getItem("favorites")) || [];
  }

  renumberStops() {
    const stopGroups = document.querySelectorAll("#stopsContainer .stop-group");
    stopGroups.forEach((div, index) => {
      const label = div.querySelector("label");
      const input = div.querySelector(".stop-input");
      const suggestions = div.querySelector(".suggestions-box");

      label.textContent = `Stop ${index + 1}:`;
      input.id = `stop-${index}`;
      suggestions.id = `stop-${index}-suggestions`;
    });
  }

  addStopField() {
    const container = document.getElementById("stopsContainer");

    const div = document.createElement("div");
    div.className = "input-group stop-group";
    div.innerHTML = `
    <label>Stop:</label>
    <div style="position: relative; display: flex; gap: 8px;">
      <input type="text" class="stop-input" placeholder="Enter stop location" style="flex: 1;">
      <button class="btn remove-stop">❌</button>
      <div class="suggestions-box"></div>
    </div>
  `;
    container.appendChild(div);

    // Track placeholder for this stop
    this.stops.push(null);

    // Bind input autocomplete
    const input = div.querySelector(".stop-input");
    input.addEventListener("input", (e) => {
      this.autocomplete(e.target.value, input.id);
    });

    // Bind remove button
    div.querySelector(".remove-stop").addEventListener("click", () => {
      div.remove();
      // Find the index of the removed stop and remove it from the array
      const removedIndex = Array.from(container.children).indexOf(div);
      if (removedIndex !== -1) {
        this.stops.splice(removedIndex, 1);
      }
      this.renumberStops();
      this.checkAndPlanRoute();
    });

    this.renumberStops();
  }

  removeStop(index) {
    // This method is not directly called by the UI in the provided code,
    // but if it were, it would need to be updated to match the addStopField logic.
    // The current remove-stop button handler directly removes from DOM and then splices.
    // For consistency, if you call this, ensure it removes the correct DOM element.
    const stopGroup = document.querySelector(`#stopsContainer .stop-group:nth-child(${index + 1})`);
    if (stopGroup) {
      stopGroup.remove();
      this.stops.splice(index, 1);
      this.renumberStops();
      this.clearRecommendationMarkers();
      this.checkAndPlanRoute();
    }
  }

  exportAsJSON() {
    const itineraryData = {
      tripDetails: {
        source: this.sourceLocation,
        destination: this.destinationLocation,
        distance: document.getElementById("distance").textContent,
        duration: document.getElementById("duration").textContent,
      },
      recommendations: this.recommendations,
      exportDate: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(itineraryData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "travel-itinerary.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  bindEvents() {
    document
      .getElementById("source")
      .addEventListener("input", (e) =>
        this.autocomplete(e.target.value, "source")
      );
    document
      .getElementById("destination")
      .addEventListener("input", (e) =>
        this.autocomplete(e.target.value, "destination")
      );

    document
      .getElementById("addStop")
      .addEventListener("click", () => this.addStopField());

    document
      .getElementById("clearRoute")
      .addEventListener("click", () => this.clearRoute());
    document
      .getElementById("exportPDF")
      .addEventListener("click", () => this.exportAsPDF());
    document
      .getElementById("exportJSON")
      .addEventListener("click", () => this.exportAsJSON());

    document.getElementById("searchSource").addEventListener("click", () => {
      const query = document.getElementById("source").value;
      this.searchLocation(query, "source");
    });

    document
      .getElementById("searchDestination")
      .addEventListener("click", () => {
        const query = document.getElementById("destination").value;
        this.searchLocation(query, "destination");
      });

    // Enter key support
    document.getElementById("source").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const query = e.target.value;
        this.searchLocation(query, "source");
      }
    });

    document.getElementById("destination").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const query = e.target.value;
        this.searchLocation(query, "destination");
      }
    });
    document.getElementById("toggleSourceFavorite").addEventListener("click", () => {
      const val = document.getElementById("source").value.trim();
      if (val) {
        this.toggleFavorite(val);
        this.renderFavorites("source");
        this.updateFavoriteToggle("source");
      }
    });
    document.getElementById("toggleDestinationFavorite").addEventListener("click", () => {
      const val = document.getElementById("destination").value.trim();
      if (val) {
        this.toggleFavorite(val);
        this.renderFavorites("destination");
        this.updateFavoriteToggle("destination");
      }
    });
    document.getElementById("source").addEventListener("input", () => {
      this.updateFavoriteToggle("source");
    });
    document.getElementById("destination").addEventListener("input", () => {
      this.updateFavoriteToggle("destination");
    });

    this.renderFavorites("source")
    this.renderFavorites("destination")

  }
}



// Initialize the application
let travelPlanner;
document.addEventListener("DOMContentLoaded", () => {
  travelPlanner = new TravelPlanner();
});
