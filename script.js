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
    this.tripDuration = 0;
    // No local locationDatabase needed if fully API-driven
    this.latestQuery = { source: "", destination: "" };
    this.debounceTimers = { source: null, destination: null };
    this.initializeMap();
    this.bindEvents();

    const oldStopsContainer = document.getElementById("stopsContainer");
    if (oldStopsContainer) oldStopsContainer.style.display = "none";
    const addStopBtn = document.getElementById("addStop");
    if (addStopBtn) addStopBtn.style.display = "none";
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
      attribution: " OpenStreetMap contributors",
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
                      <h3>📍${locationData.display_name}</h3>
                      <p><strong>Country:</strong> ${
                        address.country || "📍"
                      }</p>
                      <p><strong>Coordinates:</strong> ${
                        address.coordinates || "📍"
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

    this.clearAllSuggestions(); // 👈 ADD THIS
    this.checkAndPlanRoute();
  }

  setAsDestination(lat, lng, name) {
    this.destinationLocation = { lat, lng, name: name || "Destination" };
    document.getElementById("destination").value = name;

    if (this.destinationMarker) {
      this.map.removeLayer(this.destinationMarker);
    }

    this.destinationMarker = L.marker([lat, lng])
      .addTo(this.map)
      .bindPopup(`🎯 Destination: ${name}`);

    this.map.closePopup();

    this.clearAllSuggestions(); // 👈 ADD THIS
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
      // alert(
      //   "Could not reach the geocoding service. Check your connection and try again."
      // );
    }
  }

  checkAndPlanRoute() {
    if (this.sourceLocation && this.destinationLocation) {
      this.stopsFlat = [];
      for (let dayStops of this.stops) {
        if (Array.isArray(dayStops)) {
          for (let stop of dayStops) {
            if (stop) this.stopsFlat.push(stop);
          }
        }
      }

      this.planRoute();
      this.getRecommendations();
      this.showExportButtons();

      // Add stop markers on the map
      this.addStopMarkers();
    }
  }

  planRoute() {
    // Collect all active points (source, stops, destination)
    let waypoints = [];
    if (this.sourceLocation) {
      waypoints.push(
        L.latLng(this.sourceLocation.lat, this.sourceLocation.lng)
      );
    }

    this.stops.forEach((stop) => {
      if (stop) {
        waypoints.push(L.latLng(stop.lat, stop.lng));
      }
    });

    if (this.destinationLocation) {
      waypoints.push(
        L.latLng(this.destinationLocation.lat, this.destinationLocation.lng)
      );
    }

    if (waypoints.length < 2) return; // Need at least 2 points

    // Remove old route
    if (this.routeLayer) {
      this.map.removeControl(this.routeLayer);
    }

    // Get route preference
    const option = document.getElementById("routeOption").value;
    let routingProfile = "driving"; // default

    // Create routing control with waypoints
    this.routeLayer = L.Routing.control({
      waypoints: waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      createMarker: function () {
        return null;
      }, // Don't create default markers
      lineOptions: {
        styles: [
          {
            color: "#ff6b6b",
            weight: 6,
            opacity: 0.8,
          },
        ],
      },
      router: L.Routing.osrmv1({
        serviceUrl: "https://router.project-osrm.org/route/v1",
        profile: routingProfile,
      }),
      formatter: new L.Routing.Formatter({
        language: "en",
      }),
      show: false, // Hide the instruction panel
      createMarker: function () {
        return null;
      }, // Don't override our custom markers
    }).addTo(this.map);

    // Listen for route found event to update UI
    this.routeLayer.on("routesfound", (e) => {
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
      document.getElementById("tripCost").textContent = `${cost}`;

      // Show route info
      document.getElementById("routeInfo").style.display = "block";
    });

    // Handle routing errors
    // this.routeLayer.on("routingerror", (e) => {
    //   console.error("Routing error:", e);
    //   alert(
    //     "Could not find a route between the selected points. Please try different locations."
    //   );
    // });
  }

  async getRecommendations() {
    document.getElementById("recommendationsContent").innerHTML =
      '<p class="loading">Loading recommendations...</p>';

    // Get recommendations from source, destination, AND all stops
    const allRecommendations = [];

    // Source recommendations
    if (this.sourceLocation) {
      const sourceRecs = await this.getLocationRecommendations(
        this.sourceLocation
      );
      allRecommendations.push(
        ...sourceRecs.map((r) => ({
          ...r,
          area: `${this.sourceLocation.name} Area`,
        }))
      );
    }

    // Stop recommendations - get from all stops across all days
    if (this.stopsFlat && this.stopsFlat.length > 0) {
      for (const stop of this.stopsFlat) {
        if (stop && stop.lat && stop.lng) {
          const stopRecs = await this.getLocationRecommendations(stop);
          allRecommendations.push(
            ...stopRecs.map((r) => ({
              ...r,
              area: `${stop.name} Area`,
            }))
          );
        }
      }
    }

    // Destination recommendations
    if (this.destinationLocation) {
      const destRecs = await this.getLocationRecommendations(
        this.destinationLocation
      );
      allRecommendations.push(
        ...destRecs.map((r) => ({
          ...r,
          area: `${this.destinationLocation.name} Area`,
        }))
      );
    }

    this.recommendations = allRecommendations;
    console.log("All recommendations including stops:", this.recommendations);
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
          type:
            el.tags.tourism || el.tags.historic || el.tags.leisure || "place",
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
        const recId = `rec-${area.replace(/\s+/g, "")}-${index}`;
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
    container.querySelectorAll(".show-on-map").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const lat = parseFloat(e.target.dataset.lat);
        const lng = parseFloat(e.target.dataset.lng);
        const name = e.target.dataset.name;

        // Center map on this location
        this.map.setView([lat, lng], 15);

        // Open popup for this marker
        const marker = this.recommendationMarkers.find(
          (m) => m.getLatLng().lat === lat && m.getLatLng().lng === lng
        );
        if (marker) {
          marker.openPopup();
        }
      });
    });
  }

  // Add this method to create a stop input inside a day block
  createStopInput(dayIndex, stopIndex) {
    const stopDiv = document.createElement("div");
    stopDiv.className = "input-group stop-input-group";
    stopDiv.style.marginBottom = "8px";

    const label = document.createElement("label");
    label.textContent = `Stop ${stopIndex + 1}:`;
    label.style.display = "block";
    label.style.marginBottom = "4px";

    const inputWrapper = document.createElement("div");
    inputWrapper.style.display = "flex";
    inputWrapper.style.gap = "8px";
    inputWrapper.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Enter stop location for Day ${dayIndex + 1}`;
    input.className = "stop-input";
    input.id = `day${dayIndex}-stop${stopIndex}`; // Make sure this is set BEFORE the event listener
    input.style.flex = "1";

    // Suggestions box for autocomplete
    // Suggestions box for autocomplete
    const suggestionsBox = document.createElement("div");
    suggestionsBox.className = "suggestions-box";
    suggestionsBox.id = `${input.id}-suggestions`; // This will be "day0-stop1-suggestions"
    suggestionsBox.className = "suggestions-box";
    suggestionsBox.id = `${input.id}-suggestions`;
    suggestionsBox.style.position = "absolute";
    suggestionsBox.style.background = "#fff";
    suggestionsBox.style.border = "1px solid #ccc";
    suggestionsBox.style.zIndex = "1000";
    suggestionsBox.style.width = "100%";
    suggestionsBox.style.maxHeight = "150px";
    suggestionsBox.style.overflowY = "auto";
    suggestionsBox.style.display = "none";

    // Remove stop button
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "❌";
    removeBtn.title = "Remove this stop";
    removeBtn.style.flex = "0 0 auto";

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(removeBtn);

    stopDiv.appendChild(label);
    stopDiv.appendChild(inputWrapper);
    stopDiv.appendChild(suggestionsBox);

    // Bind autocomplete on input
    // Bind autocomplete on input
    input.addEventListener("input", (e) => {
      console.log(
        "Stop input event - ID:",
        e.target.id,
        "Value:",
        e.target.value
      ); // Debug line
      this.autocomplete(e.target.value, e.target.id);
    });

    // Remove stop handler
    removeBtn.addEventListener("click", () => {
      stopDiv.remove();
      // Remove from this.stops structure
      if (this.stops[dayIndex]) {
        this.stops[dayIndex].splice(stopIndex, 1);
        if (this.stops[dayIndex].length === 0) {
          // If no stops left in day, add one empty stop input
          this.stops[dayIndex].push(null);
          this.addStopInputToDay(dayIndex);
        }
      }
      this.renumberStopsInDay(dayIndex);
      this.checkAndPlanRoute();
    });

    return stopDiv;
  }

  // Add a stop input to a specific day block and update this.stops
  addStopInputToDay(dayIndex) {
    const dayBlock = document.getElementById(`day-block-${dayIndex}`);
    if (!dayBlock) return;

    const stopsContainer = dayBlock.querySelector(".stops-container");
    if (!stopsContainer) return;

    const stopIndex = stopsContainer.children.length;
    const stopInput = this.createStopInput(dayIndex, stopIndex);
    stopsContainer.appendChild(stopInput);

    // Initialize stops array for the day if needed
    if (!this.stops[dayIndex]) {
      this.stops[dayIndex] = [];
    }
    this.stops[dayIndex].push(null);
  }

  // Renumber stop labels and input IDs inside a day block after removal
  renumberStopsInDay(dayIndex) {
    const dayBlock = document.getElementById(`day-block-${dayIndex}`);
    if (!dayBlock) return;

    const stopsContainer = dayBlock.querySelector(".stops-container");
    if (!stopsContainer) return;

    const stopInputs = stopsContainer.querySelectorAll(".stop-input-group");
    stopInputs.forEach((stopDiv, idx) => {
      const label = stopDiv.querySelector("label");
      const input = stopDiv.querySelector("input.stop-input");
      const suggestions = stopDiv.querySelector(".suggestions-box");

      label.textContent = `Stop ${idx + 1}:`;
      input.id = `day${dayIndex}-stop${idx}`;
      suggestions.id = `${input.id}-suggestions`;
    });
  }

  // Create day blocks with one stop input and add stop button
  createDayBlock(dayIndex) {
    const dayDiv = document.createElement("div");
    dayDiv.className = "day-block";
    dayDiv.id = `day-block-${dayIndex}`;
    dayDiv.style.border = "1px solid #ccc";
    dayDiv.style.padding = "10px";
    dayDiv.style.marginBottom = "15px";
    dayDiv.style.position = "relative";

    const dayHeader = document.createElement("h3");
    dayHeader.textContent = `Day ${dayIndex + 1}`;
    dayDiv.appendChild(dayHeader);

    const stopsContainer = document.createElement("div");
    stopsContainer.className = "stops-container";
    dayDiv.appendChild(stopsContainer);

    // Add first stop input by default
    this.stops[dayIndex] = [null];
    stopsContainer.appendChild(this.createStopInput(dayIndex, 0));

    // Add Stop button inside day block
    const addStopBtn = document.createElement("button");
    addStopBtn.type = "button";
    addStopBtn.textContent = "➕ Add Stop";
    addStopBtn.style.marginTop = "10px";

    addStopBtn.addEventListener("click", () => {
      this.addStopInputToDay(dayIndex);
    });

    dayDiv.appendChild(addStopBtn);

    return dayDiv;
  }

  // Override setTripDuration to create day blocks with stops inside days
  setTripDuration() {
    const duration = prompt(
      "Enter the number of days for your trip (1-7):",
      "3"
    );

    if (duration === null) return; // User cancelled

    const days = parseInt(duration);
    if (isNaN(days) || days < 1 || days > 7) {
      alert("Please enter a valid number between 1 and 7 days.");
      return;
    }

    this.tripDuration = days;

    // Clear existing stops and days container
    this.stops = [];
    const daysContainer = document.getElementById("daysContainer");
    daysContainer.innerHTML = "";

    // Hide old stopsContainer and addStop button if present
    const oldStopsContainer = document.getElementById("stopsContainer");
    if (oldStopsContainer) oldStopsContainer.style.display = "none";
    const addStopBtn = document.getElementById("addStop");
    if (addStopBtn) addStopBtn.style.display = "none";

    // Show duration display
    const durationDisplay = document.getElementById("durationDisplay");
    durationDisplay.textContent = `${days} day${days > 1 ? "s" : ""} trip`;
    durationDisplay.style.display = "inline";

    // Create day blocks with one stop each
    for (let i = 0; i < days; i++) {
      const dayBlock = this.createDayBlock(i);
      daysContainer.appendChild(dayBlock);
    }
  }

  // Override checkAndPlanRoute to collect stops from days structure
  checkAndPlanRoute() {
    if (this.sourceLocation && this.destinationLocation) {
      if (this.tripDuration > 0) {
        const lastDayIndex = this.tripDuration - 1;
        if (!this.stops[lastDayIndex]) {
          this.stops[lastDayIndex] = [];
        }

        // Remove any previous destination stops on last day (by lat/lng)
        this.stops[lastDayIndex] = this.stops[lastDayIndex].filter(
          (stop) =>
            !(
              stop &&
              stop.lat === this.destinationLocation.lat &&
              stop.lng === this.destinationLocation.lng
            )
        );

        // Insert destination as first stop on last day
        const destStop = {
          lat: this.destinationLocation.lat,
          lng: this.destinationLocation.lng,
          name: this.destinationLocation.name || "Destination",
        };
        this.stops[lastDayIndex].unshift(destStop);
      }

      // Flatten stops from days into this.stopsFlat array
      this.stopsFlat = [];
      for (let dayStops of this.stops) {
        if (Array.isArray(dayStops)) {
          for (let stop of dayStops) {
            if (stop) this.stopsFlat.push(stop);
          }
        }
      }

      console.log("Stops per day:", this.stops);
      console.log("Flattened stopsFlat:", this.stopsFlat);

      this.planRoute();
      this.getRecommendations();
      this.showExportButtons();

      this.addStopMarkers();
    }
  }

  // Override planRoute to use stopsFlat instead of stops
  planRoute() {
    let waypoints = [];
    if (this.sourceLocation) {
      waypoints.push(
        L.latLng(this.sourceLocation.lat, this.sourceLocation.lng)
      );
    }

    if (this.stopsFlat && this.stopsFlat.length > 0) {
      this.stopsFlat.forEach((stop) => {
        if (stop) {
          waypoints.push(L.latLng(stop.lat, stop.lng));
        }
      });
    }

    if (this.destinationLocation) {
      waypoints.push(
        L.latLng(this.destinationLocation.lat, this.destinationLocation.lng)
      );
    }

    if (waypoints.length < 2) return;

    if (this.routeLayer) {
      this.map.removeControl(this.routeLayer);
    }

    const option = document.getElementById("routeOption").value;
    let routingProfile = "driving";

    this.routeLayer = L.Routing.control({
      waypoints: waypoints,
      routeWhileDragging: false,
      addWaypoints: false,
      createMarker: () => null,
      lineOptions: {
        styles: [
          {
            color: "#ff6b6b",
            weight: 6,
            opacity: 0.8,
          },
        ],
      },
      router: L.Routing.osrmv1({
        serviceUrl: "https://router.project-osrm.org/route/v1",
        profile: routingProfile,
      }),
      formatter: new L.Routing.Formatter({
        language: "en",
      }),
      show: false,
    }).addTo(this.map);

    // ... rest unchanged
  }

  // Override autocomplete to handle new stop input IDs (dayX-stopY)
  showSuggestions(results, type) {
    const isStop = type && type.startsWith("day"); // Correctly identify if it's a day-based stop input
    let boxId;
    if (isStop) {
      boxId = `${type}-suggestions`;
    } else if (type === "source") {
      boxId = "sourceSuggestions";
    } else if (type === "destination") {
      boxId = "destinationSuggestions";
    } else {
      return;
    }

    const box = document.getElementById(boxId);
    if (!box) return;
    box.innerHTML = "";
    box.style.display = results.length ? "block" : "none";
    results.forEach((place) => {
      let fullName = place.display_name;
      let div = document.createElement("div");
      div.textContent = fullName;
      div.onclick = () => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);

        if (type === "source") {
          this.setAsSource(lat, lng, fullName);
          document.getElementById("source").value = fullName;
        } else if (type === "destination") {
          this.setAsDestination(lat, lng, fullName);
          document.getElementById("destination").value = fullName;
        } else if (isStop) {
          // Parse day and stop indices from input id, e.g., "day0-stop1"
          const match = type.match(/^day(\d+)-stop(\d+)$/);
          if (match) {
            const dayIndex = parseInt(match[1], 10);
            const stopIndex = parseInt(match[2], 10);

            if (!this.stops[dayIndex]) {
              this.stops[dayIndex] = [];
            }
            // Update the specific stop in the nested array
            this.stops[dayIndex][stopIndex] = { lat, lng, name: fullName };
            // Update the value of the specific stop input field
            const input = document.getElementById(type);
            if (input) {
              input.value = fullName;
            }
          }
        }
        this.saveRecent(fullName);
        box.innerHTML = "";
        box.style.display = "none";
        this.checkAndPlanRoute();
      };
      box.appendChild(div);
    });
  }

  clearAllSuggestions() {
    const boxes = document.querySelectorAll(".suggestions-box");
    boxes.forEach((box) => {
      box.innerHTML = "";
      box.style.display = "none";
    });
  }

  // Method to add recommendation markers to map
  addRecommendationMarkers() {
    this.recommendations.forEach((rec) => {
      if (rec.lat && rec.lng) {
        // Create custom icon for recommendations
        const icon = L.divIcon({
          className: "recommendation-marker",
          html: this.getRecommendationIcon(rec.type),
          iconSize: [25, 25],
          iconAnchor: [12, 12],
          popupAnchor: [0, -15],
        });

        const marker = L.marker([rec.lat, rec.lng], { icon }).addTo(this.map)
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

  addStopMarkers() {
    if (this.stopMarkers) {
      this.stopMarkers.forEach((marker) => this.map.removeLayer(marker));
    }
    this.stopMarkers = [];

    if (!this.stopsFlat || this.stopsFlat.length === 0) return;

    this.stopsFlat.forEach((stop) => {
      if (stop && stop.lat && stop.lng) {
        const icon = L.divIcon({
          className: "stop-marker",
          html: "📍",
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        });

        const marker = L.marker([stop.lat, stop.lng], { icon }).addTo(this.map);
        marker.bindPopup(`Stop: ${stop.name || "Unnamed"}`);
        this.stopMarkers.push(marker);
      }
    });
  }

  // Method to clear recommendation markers
  clearRecommendationMarkers() {
    this.recommendationMarkers.forEach((marker) => {
      this.map.removeLayer(marker);
    });
    this.recommendationMarkers = [];
  }

  // Get appropriate icon for recommendation type
  getRecommendationIcon(type) {
    const iconMap = {
      attraction: "🎯",
      museum: "🏛️",
      gallery: "🖼️",
      zoo: "🦁",
      theme_park: "🎢",
      historic: "🏛️",
      park: "🌳",
      place: "📍",
      fort: "🏰",
      palace: "🏰",
      temple: "🛕",
      church: "⛪",
      monument: "🗿",
      castle: "🏰",
      district: "🏢",
      memorial: "🏛️",
      artwork: "🎨",
      aircraft: "🛦",
    };

    return iconMap[type] || "🌍";
  }

  clearRoute() {
    window.location.reload();
  }

  // Enhanced PDF Export Function with Fixed Encoding - Replace the existing exportAsPDF method
  // Enhanced PDF Export Function with Fixes
  // Complete PDF Export Function with Character Encoding Fixes
  // Inside the TravelPlanner class

  // 1. New function to fetch nearby restaurants
  async getNearbyRestaurants(lat, lng) {
    if (!lat || !lng) return [];
    const query = `
        [out:json][timeout:25];
        node["amenity"="restaurant"](around:2000,${lat},${lng});
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
      return data.elements.map((el) => ({
        name: el.tags.name || "Unnamed Restaurant",
        lat: el.lat,
        lng: el.lon,
      }));
    } catch (err) {
      console.error("Overpass restaurant fetch failed:", err);
      return [];
    }
  }

  // 2. Modified exportAsPDF function
  // Inside the TravelPlanner class
  generateCleanFileName() {
    const source = this.sourceLocation ? this.sourceLocation.name : "source";
    const dest = this.destinationLocation
      ? this.destinationLocation.name
      : "destination";
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    // Sanitize names: remove special chars, spaces replaced with underscores
    const sanitize = (str) =>
      str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const fileName = `itinerary_${sanitize(source)}_to_${sanitize(
      dest
    )}_${dateStr}.pdf`;
    return fileName;
  }
  // 2. Modified exportAsPDF function (now async)

  async exportAsPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    console.log("=== DEBUG: All recommendations ===");
    this.recommendations.forEach((rec) => {
      console.log(`Area: "${rec.area}" | Name: "${rec.name}"`);
    });
    console.log("=== END DEBUG ===");

    // Define colors
    const primaryColor = [102, 126, 234];
    const textColor = [34, 34, 34];
    const lightGray = [128, 128, 128];

    let yPos = 20;

    // Header section
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 60, "F");

    doc.setTextColor(...lightGray);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    //doc.text("Palace   Tower   Church   Castle   Stadium", 20, 15);

    doc.setTextColor(...textColor);
    doc.setFontSize(32);
    doc.setFont("times", "bold");
    doc.text("Travel", 130, 25);
    doc.text("Itinerary", 100, 40);

    yPos = 70;

    // Trip summary box
    doc.setFillColor(245, 245, 245);
    doc.rect(15, yPos - 5, 180, 25, "F");
    doc.setDrawColor(...lightGray);
    doc.rect(15, yPos - 5, 180, 25);

    doc.setTextColor(...primaryColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Trip Summary", 20, yPos + 3);

    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    if (this.sourceLocation && this.destinationLocation) {
      const sourceName = this.sanitizeForPDF(this.sourceLocation.name);
      const destName = this.sanitizeForPDF(this.destinationLocation.name);

      doc.text(`From: ${sourceName}`, 20, yPos + 10);
      doc.text(`To: ${destName}`, 20, yPos + 16);
    }

    // Route info
    if (document.getElementById("routeInfo").style.display !== "none") {
      const distance = document.getElementById("distance").textContent;
      const duration = document.getElementById("duration").textContent;
      const cost = document.getElementById("tripCost")?.textContent || "N/A";

      doc.text(
        `Distance: ${distance} | Duration: ${duration} | Cost: Rs.${cost}`,
        110,
        yPos + 10
      );
    }

    yPos += 35;

    // Get and clean recommendations from both areas
    const topRecommendations = this.getCleanRecommendations(10); // Increased limit

    // Fetch nearby restaurants from both source and destination areas
    let nearbyRestaurants = [];
    if (this.sourceLocation) {
      const sourceRestaurants = await this.getNearbyRestaurants(
        this.sourceLocation.lat,
        this.sourceLocation.lng
      );
      nearbyRestaurants = nearbyRestaurants.concat(
        sourceRestaurants.map((r) => ({ ...r, area: "source" }))
      );
    }
    if (this.destinationLocation) {
      const destRestaurants = await this.getNearbyRestaurants(
        this.destinationLocation.lat,
        this.destinationLocation.lng
      );
      nearbyRestaurants = nearbyRestaurants.concat(
        destRestaurants.map((r) => ({ ...r, area: "destination" }))
      );
    }

    console.log("Restaurants found:", nearbyRestaurants.length); // Debug log

    // Create daily itinerary
    if (this.tripDuration > 0) {
      for (let dayIndex = 0; dayIndex < this.tripDuration; dayIndex++) {
        if (yPos > 220) {
          doc.addPage();
          yPos = 20;
        }

        yPos = this.createCleanDaySchedule(
          doc,
          dayIndex + 1,
          yPos,
          topRecommendations,
          nearbyRestaurants,
          dayIndex
        );
        yPos += 10;
      }
    } else {
      yPos = this.createCleanDaySchedule(
        doc,
        1,
        yPos,
        topRecommendations,
        nearbyRestaurants,
        0
      );
    }

    // Enhanced Recommendations section with area breakdown
    if (topRecommendations.length > 0) {
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFillColor(...primaryColor);
      doc.rect(0, yPos - 5, 210, 15, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Recommended Places by Area", 20, yPos + 5);
      yPos += 20;

      // Group recommendations by area for better organization
      const groupedRecommendations = topRecommendations.reduce(
        (groups, rec) => {
          if (!groups[rec.area]) groups[rec.area] = [];
          groups[rec.area].push(rec);
          return groups;
        },
        {}
      );

      Object.keys(groupedRecommendations).forEach((area) => {
        if (yPos > 260) {
          doc.addPage();
          yPos = 20;
        }

        // Area header
        doc.setTextColor(...primaryColor);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(area, 20, yPos);
        yPos += 8;

        groupedRecommendations[area].forEach((rec, index) => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }

          doc.setTextColor(...textColor);
          doc.setFontSize(11);
          doc.setFont("helvetica", "bold");
          doc.text(`• ${this.sanitizeForPDF(rec.name)}`, 25, yPos);

          doc.setTextColor(...lightGray);
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.text(`[${rec.type}]`, 25, yPos + 6);

          doc.setTextColor(...textColor);
          doc.setFontSize(9);
          const description = doc.splitTextToSize(
            this.sanitizeForPDF(rec.description),
            165
          );
          doc.text(description, 25, yPos + 12);

          yPos += 12 + description.length * 3.5 + 8;
        });

        yPos += 5; // Extra space between areas
      });
    }

    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFillColor(248, 248, 248);
      doc.rect(0, 285, 210, 12, "F");

      doc.setTextColor(...lightGray);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Generated on ${new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })} | Travel Itinerary Planner`,
        15,
        291
      );
      doc.text(`Page ${i} of ${pageCount}`, 175, 291);
    }

    for (let i = 0; i < this.tripDuration; i++) {
      console.log(`Day ${i + 1} stops:`, this.getCleanStopsForDay(i));
    }

    // Save PDF
    const fileName = this.generateCleanFileName();
    doc.save(fileName);
  }

  getCleanRecommendations(limit = 15) {
    // Increased default limit
    if (!Array.isArray(this.recommendations)) return [];

    // Filter out recommendations without a name or description
    const filtered = this.recommendations.filter(
      (rec) => rec.name && rec.description
    );

    // Separate recommendations by area type
    const sourceRecs = filtered.filter(
      (rec) =>
        this.sourceLocation && rec.area.includes(this.sourceLocation.name)
    );

    const destRecs = filtered.filter(
      (rec) =>
        this.destinationLocation &&
        rec.area.includes(this.destinationLocation.name)
    );

    const stopRecs = filtered.filter(
      (rec) =>
        !sourceRecs.some((sr) => sr.name === rec.name) &&
        !destRecs.some((dr) => dr.name === rec.name)
    );

    console.log("Source recommendations:", sourceRecs.length);
    console.log("Destination recommendations:", destRecs.length);
    console.log("Stop recommendations:", stopRecs.length);

    // Distribute recommendations more evenly
    const result = [];
    const maxPerArea = Math.ceil(limit / 3);

    result.push(...sourceRecs.slice(0, maxPerArea));
    result.push(...destRecs.slice(0, maxPerArea));
    result.push(...stopRecs.slice(0, maxPerArea));

    // If we still have space and one category has more, add them
    const remaining = limit - result.length;
    if (remaining > 0) {
      const allRemaining = [
        ...sourceRecs.slice(maxPerArea),
        ...destRecs.slice(maxPerArea),
        ...stopRecs.slice(maxPerArea),
      ];
      result.push(...allRemaining.slice(0, remaining));
    }

    console.log("Final selected recommendations:", result.length, result);
    return result.slice(0, limit);
  }
  getRecommendationsForDay(dayIndex, allRecommendations) {
    const totalDays = this.tripDuration || 1;
    const isLastDay = dayIndex === totalDays - 1;
    const isFirstDay = dayIndex === 0;

    // Get stops for this specific day
    const dayStops = this.getCleanStopsForDay(dayIndex);

    // Special handling for first and last days
    if (isFirstDay && dayStops.length === 0) {
      // First day with no stops - use source area
      const sourceArea = this.sourceLocation
        ? `${this.sourceLocation.name} Area`
        : null;
      if (sourceArea) {
        return allRecommendations
          .filter((rec) => rec.area === sourceArea)
          .slice(0, 3);
      }
    }

    if (isLastDay) {
      // Last day should focus on destination area regardless of stops
      const destinationArea = this.destinationLocation
        ? `${this.destinationLocation.name} Area`
        : null;
      if (destinationArea) {
        const destRecs = allRecommendations.filter(
          (rec) => rec.area === destinationArea
        );
        if (destRecs.length >= 3) {
          return destRecs.slice(0, 3);
        }
        // If not enough destination recommendations, supplement with stop recommendations
        const daySpecificRecs = [...destRecs];
        dayStops.forEach((stop) => {
          const stopAreaRecs = allRecommendations.filter(
            (rec) =>
              rec.area === `${stop.name} Area` &&
              !daySpecificRecs.some((existing) => existing.name === rec.name)
          );
          daySpecificRecs.push(...stopAreaRecs);
        });
        return daySpecificRecs.slice(0, 3);
      }
    }

    if (dayStops.length === 0) {
      // Middle days with no stops - alternate between source/destination
      const useSource = dayIndex % 2 === 0;
      const targetArea = useSource
        ? this.sourceLocation
          ? `${this.sourceLocation.name} Area`
          : null
        : this.destinationLocation
        ? `${this.destinationLocation.name} Area`
        : null;

      if (targetArea) {
        return allRecommendations
          .filter((rec) => rec.area === targetArea)
          .slice(0, 3);
      }
      return [];
    }

    // Get recommendations from areas matching this day's stops
    const daySpecificRecs = [];
    dayStops.forEach((stop) => {
      const stopAreaRecs = allRecommendations.filter(
        (rec) => rec.area === `${stop.name} Area`
      );
      daySpecificRecs.push(...stopAreaRecs);
    });

    // If we don't have enough stop-specific recommendations, supplement with source/destination
    if (daySpecificRecs.length < 3) {
      const supplementRecs = allRecommendations.filter(
        (rec) =>
          !daySpecificRecs.some((existing) => existing.name === rec.name) &&
          (rec.area.includes(this.sourceLocation?.name) ||
            rec.area.includes(this.destinationLocation?.name))
      );
      daySpecificRecs.push(...supplementRecs);
    }

    return daySpecificRecs.slice(0, 3); // Limit to 3 recommendations per day
  }
  // 3. Modified createCleanDaySchedule function
  createCleanDaySchedule(
    doc,
    dayNumber,
    startY,
    recommendations,
    nearbyRestaurants,
    dayIndex = 0
  ) {
    let yPos = startY;
    const primaryColor = [102, 126, 234];
    const textColor = [34, 34, 34];
    const lightGray = [128, 128, 128];

    // Day header
    doc.setDrawColor(...lightGray);
    doc.line(20, yPos, 20, yPos + 120);

    doc.setFillColor(255, 255, 255);
    doc.rect(15, yPos - 5, 30, 25, "F");
    doc.setDrawColor(...primaryColor);
    doc.rect(15, yPos - 5, 30, 25);

    doc.setTextColor(...textColor);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Day ${dayNumber}`, 18, yPos + 8);

    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + dayNumber - 1);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(
      currentDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      18,
      yPos + 16
    );

    // Get clean stops for this day
    const dayStops = this.getCleanStopsForDay(dayIndex);

    // Get recommendations specific to this day's stops
    const daySpecificRecs = this.getRecommendationsForDay(
      dayIndex,
      recommendations
    );

    // --- Dynamic Morning Schedule ---
    doc.setTextColor(...textColor);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Morning:", 60, yPos + 5);

    let currentMorningY = yPos + 15;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Activity 1: Start the day
    doc.text("08:00", 60, currentMorningY);
    doc.text("Enjoy breakfast and prepare for the day", 85, currentMorningY);
    currentMorningY += 7;

    // Activity 2: First stop or recommendation
    if (dayStops.length > 0) {
      doc.text("10:00", 60, currentMorningY);
      const stopName = this.sanitizeForPDF(dayStops[0].name);
      const visitText = doc.splitTextToSize(`Visit ${stopName}`, 100);
      doc.text(visitText, 85, currentMorningY);
      currentMorningY += visitText.length * 3.5;
    } else if (daySpecificRecs.length > 0) {
      const rec = daySpecificRecs[0];
      doc.text("10:00", 60, currentMorningY);
      const visitText = doc.splitTextToSize(
        `Explore ${this.sanitizeForPDF(rec.name)} (${rec.type})`,
        100
      );
      doc.text(visitText, 85, currentMorningY);
      currentMorningY += visitText.length * 3.5;
    } else {
      doc.text("10:00", 60, currentMorningY);
      doc.text("Morning exploration", 85, currentMorningY);
      currentMorningY += 7;
    }

    // --- Dynamic Afternoon Schedule ---
    let currentAfternoonY = Math.max(currentMorningY, yPos + 37);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Afternoon:", 60, currentAfternoonY);

    currentAfternoonY += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Activity 1: Lunch
    doc.text("13:00", 60, currentAfternoonY);
    doc.text("Lunch break", 85, currentAfternoonY);
    currentAfternoonY += 7;

    // Activity 2: Second stop or recommendation
    if (dayStops.length > 1) {
      doc.text("15:00", 60, currentAfternoonY);
      const stopName = this.sanitizeForPDF(dayStops[1].name);
      const exploreText = doc.splitTextToSize(`Discover ${stopName}`, 100);
      doc.text(exploreText, 85, currentAfternoonY);
      currentAfternoonY += exploreText.length * 3.5;
    } else if (daySpecificRecs.length > 1) {
      const rec = daySpecificRecs[1];
      doc.text("15:00", 60, currentAfternoonY);
      const exploreText = doc.splitTextToSize(
        `Visit ${this.sanitizeForPDF(rec.name)}`,
        100
      );
      doc.text(exploreText, 85, currentAfternoonY);
      currentAfternoonY += exploreText.length * 3.5;
    } else {
      doc.text("15:00", 60, currentAfternoonY);
      doc.text("Continue exploring the area", 85, currentAfternoonY);
      currentAfternoonY += 7;
    }

    // --- Dynamic Evening Schedule ---
    let currentEveningY = Math.max(currentAfternoonY, yPos + 70);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Evening:", 60, currentEveningY);

    currentEveningY += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Activity 1: Evening activity - use third recommendation if available
    doc.text("18:00", 60, currentEveningY);
    if (daySpecificRecs.length > 2) {
      const rec = daySpecificRecs[2];
      const eveningText = doc.splitTextToSize(
        `Visit ${this.sanitizeForPDF(rec.name)}`,
        100
      );
      doc.text(eveningText, 85, currentEveningY);
      currentEveningY += eveningText.length * 3.5;
    } else {
      doc.text("Relax and enjoy the evening ambiance", 85, currentEveningY);
      currentEveningY += 7;
    }

    // Activity 2: Dinner at a dynamic restaurant
    doc.text("20:00", 60, currentEveningY);
    let dinnerText = "Dinner at a local restaurant";
    if (nearbyRestaurants && nearbyRestaurants.length > 0) {
      const restaurant = nearbyRestaurants[dayIndex % nearbyRestaurants.length];
      if (restaurant && restaurant.name) {
        dinnerText = `Dinner at ${this.sanitizeForPDF(restaurant.name)}`;
      }
    }
    const dinnerLine = doc.splitTextToSize(dinnerText, 100);
    doc.text(dinnerLine, 85, currentEveningY);
    currentEveningY += dinnerLine.length * 3.5;

    // Separator line
    let finalY = Math.max(currentEveningY, yPos + 120);
    doc.setDrawColor(...lightGray);
    doc.line(15, finalY, 195, finalY);

    return finalY + 5;
  }
  sanitizeForPDF(text) {
    if (!text) return "";
    // Replace problematic Unicode quotes with ASCII quotes
    let cleanText = text.replace(/[\u2018\u2019\u201C\u201D]/g, "'");
    // Remove any non-ASCII characters (optional, depending on your needs)
    cleanText = cleanText.replace(/[^\x00-\x7F]/g, "");
    return cleanText;
  }
  showExportButtons() {
    // Example: show the export PDF button if hidden
    const exportBtn = document.getElementById("exportPDF");
    if (exportBtn) {
      exportBtn.style.display = "inline-block"; // or "block" depending on your layout
    }
  }

  autocomplete(query, type) {
    // Save latest query - but for day-based stops, we need to handle them differently
    if (type.startsWith("day")) {
      // For day-based stops, use the full type as key
      if (!this.latestQuery[type]) this.latestQuery[type] = "";
      this.latestQuery[type] = query;
    } else {
      this.latestQuery[type] = query;
    }

    // Clear previous debounce timer
    if (this.debounceTimers[type]) {
      clearTimeout(this.debounceTimers[type]);
    }

    // Debounce: wait 300ms after user stops typing
    this.debounceTimers[type] = setTimeout(async () => {
      if (query.length < 2) {
        this.clearSuggestions(type);
        return;
      }

      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(
        query
      )}&limit=5`;

      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Autocomplete geocoding failed");
        const data = await res.json();

        // Only show suggestions if query matches latest input
        const currentQuery = type.startsWith("day")
          ? this.latestQuery[type]
          : this.latestQuery[type];
        if (currentQuery === query) {
          this.showSuggestions(data, type);
        }
      } catch (error) {
        console.error("Autocomplete error:", error);
        this.clearSuggestions(type);
      }
    }, 300);
  }

  clearSuggestions(type) {
    let boxId;
    if (type.startsWith("day")) {
      boxId = `${type}-suggestions`;
    } else if (type === "source") {
      boxId = "sourceSuggestions";
    } else if (type === "destination") {
      boxId = "destinationSuggestions";
    }

    const box = document.getElementById(boxId);
    if (box) {
      box.innerHTML = "";
      box.style.display = "none";
    }
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

  async geocodeLocation(name, type) {
    try {
      const results = await this.geocode(name);
      if (Array.isArray(results) && results.length > 0) {
        const top = results[0];
        const lat = parseFloat(top.lat);
        const lng = parseFloat(top.lon);
        const displayName = top.display_name || name;

        if (type === "source") {
          this.setAsSource(lat, lng, displayName);
        } else if (type === "destination") {
          this.setAsDestination(lat, lng, displayName);
        }
        this.map.setView([lat, lng], 12); // Center map on the selected favorite
      } else {
        alert(`Could not find coordinates for "${name}".`);
      }
    } catch (error) {
      console.error("Geocoding favorite failed:", error);
      // alert("Failed to geocode the favorite location. Please try again.");
    }
  }

  renderFavorites(type) {
    const favoritesContainer = document.getElementById(`${type}Favorites`);
    const favorites = this.getFavorites();

    favoritesContainer.innerHTML = "";

    favorites.forEach((fav) => {
      const favItem = document.createElement("div");
      favItem.className = "favorite-item";
      favItem.textContent = fav;

      const removeBtn = document.createElement("span");
      removeBtn.className = "remove-favorite";
      removeBtn.textContent = "❌";
      removeBtn.title = "Remove favorite";
      removeBtn.style.cursor = "pointer";
      removeBtn.style.marginLeft = "8px";
      removeBtn.style.color = "#a00";

      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleFavorite(fav);
        this.renderFavorites(type);
        this.updateFavoriteToggle(type);
      });

      favItem.appendChild(removeBtn);

      // THIS IS THE CRUCIAL LINE TO ENSURE IT CALLS THE NEW METHOD
      favItem.addEventListener("click", () => {
        this.geocodeLocation(fav, type); // Call the new geocodeLocation method
      });

      favoritesContainer.appendChild(favItem);
    });
  }

  updateFavoriteToggle(type) {
    const inputId = type === "source" ? "source" : "destination";
    const toggleId =
      type === "source" ? "toggleSourceFavorite" : "toggleDestinationFavorite";
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

      if (this.tripDuration > 0) {
        label.textContent = `Day ${index + 1} Stop:`;
      } else {
        label.textContent = `Stop ${index + 1}:`;
      }

      input.id = `stop-${index}`;
      suggestions.id = `stop-${index}-suggestions`;
    });
  }

  addStopField() {
    const container = document.getElementById("stopsContainer");
    const currentStops = container.children.length;

    // Check if we've reached the limit based on trip duration
    if (this.tripDuration > 0 && currentStops >= this.tripDuration) {
      alert("Maximum 7 days trip is supported.");
      return;
    }

    const div = document.createElement("div");
    div.className = "input-group stop-group";

    const dayNumber =
      this.tripDuration > 0 ? currentStops + 1 : currentStops + 1;
    const label =
      this.tripDuration > 0
        ? `Day ${dayNumber} Stop:`
        : `Stop ${currentStops + 1}:`;

    div.innerHTML = `
      <label>${label}</label>
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
      const removedIndex = Array.from(container.children).indexOf(div);
      if (removedIndex !== -1) {
        this.stops.splice(removedIndex, 1);
      }
      this.renumberStops();
      this.updateAddStopButton();
      this.checkAndPlanRoute();
    });

    this.renumberStops();
    this.updateAddStopButton();
  }

  updateAddStopButton() {
    const container = document.getElementById("stopsContainer");
    const currentStops = container.children.length;
    const addButton = document.getElementById("addStop");

    if (this.tripDuration > 0) {
      const nextDay = currentStops + 2; // +1 for next day
      if (currentStops < this.tripDuration) {
        addButton.textContent = `➕ Add Day ${nextDay} Stop`;
        addButton.style.display = "inline-block";
      } else {
        addButton.style.display = "none";
      }
    } else {
      addButton.textContent = "➕ Add Stop";
      addButton.style.display = "inline-block";
    }
  }
  removeStop(index) {
    // This method is not directly called by the UI in the provided code,
    // but if it were, it would need to be updated to match the addStopField logic.
    // The current remove-stop button handler directly removes from DOM and then splices.
    // For consistency, if you call this, ensure it removes the correct DOM element.
    const stopGroup = document.querySelector(
      `#stopsContainer .stop-group:nth-child(${index + 1})`
    );
    if (stopGroup) {
      stopGroup.remove();
      this.stops.splice(index, 1);
      this.renumberStops();
      this.clearRecommendationMarkers();
      this.checkAndPlanRoute();
    }
  }

  getCleanStopsForDay(dayIndex) {
    if (!this.stops || !Array.isArray(this.stops[dayIndex])) return [];
    const stops = this.stops[dayIndex].filter(
      (stop) => stop && typeof stop.name === "string" && stop.name.trim() !== ""
    );
    console.log(`Day ${dayIndex + 1} stops (filtered):`, stops);
    return stops;
  }

  // exportAsJSON() {
  //   const itineraryData = {
  //     tripDetails: {
  //       source: this.sourceLocation,
  //       destination: this.destinationLocation,
  //       distance: document.getElementById("distance").textContent,
  //       duration: document.getElementById("duration").textContent,
  //     },
  //     recommendations: this.recommendations,
  //     exportDate: new Date().toISOString(),
  //   };

  //   const dataStr = JSON.stringify(itineraryData, null, 2);
  //   const dataBlob = new Blob([dataStr], { type: "application/json" });
  //   const url = URL.createObjectURL(dataBlob);

  //   const link = document.createElement("a");
  //   link.href = url;
  //   link.download = "travel-itinerary.json";
  //   document.body.appendChild(link);
  //   link.click();
  //   document.body.removeChild(link);
  //   URL.revokeObjectURL(url);
  // }

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
    // Remove this line:
    // document.getElementById("addStop").addEventListener("click", () => this.addStopField());
    document
      .getElementById("clearRoute")
      .addEventListener("click", () => this.clearRoute());
    document.getElementById("exportPDF").addEventListener("click", async () => {
      try {
        await this.exportAsPDF();
      } catch (err) {
        console.error("Error exporting PDF:", err);
        alert("Failed to export PDF. See console for details.");
      }
    });
    //   .getElementById("exportJSON")
    //   .addEventListener("click", () => this.exportAsJSON());
    document
      .getElementById("setDuration")
      .addEventListener("click", () => this.setTripDuration());
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
    document
      .getElementById("toggleSourceFavorite")
      .addEventListener("click", () => {
        const val = document.getElementById("source").value.trim();
        if (val) {
          this.toggleFavorite(val);
          this.renderFavorites("source");
          this.updateFavoriteToggle("source");
        }
      });
    document
      .getElementById("toggleDestinationFavorite")
      .addEventListener("click", () => {
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

    this.renderFavorites("source");
    this.renderFavorites("destination");
  }
}

// Initialize the application
let travelPlanner;
document.addEventListener("DOMContentLoaded", () => {
  travelPlanner = new TravelPlanner();
});








