class TravelPlanner {
  constructor() {
    this.map = null;
    this.sourceMarker = null;
    this.destinationMarker = null;
    this.routeLayer = null;
    this.sourceLocation = null;
    this.destinationLocation = null;
    this.recommendations = [];
    this.locationDatabase = this.createLocationDatabase();

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

  createLocationDatabase() {
    // Mock location database for demo purposes
    return {
      // Major cities with their coordinates and nearby attractions
      cities: [
        {
          name: "New York, USA",
          lat: 40.7128,
          lng: -74.006,
          country: "United States",
        },
        {
          name: "London, UK",
          lat: 51.5074,
          lng: -0.1278,
          country: "United Kingdom",
        },
        { name: "Paris, France", lat: 48.8566, lng: 2.3522, country: "France" },
        { name: "Tokyo, Japan", lat: 35.6762, lng: 139.6503, country: "Japan" },
        {
          name: "Sydney, Australia",
          lat: -33.8688,
          lng: 151.2093,
          country: "Australia",
        },
        { name: "Mumbai, India", lat: 19.076, lng: 72.8777, country: "India" },
        { name: "Delhi, India", lat: 28.7041, lng: 77.1025, country: "India" },
        { name: "Pune, India", lat: 18.5204, lng: 73.8567, country: "India" },
        {
          name: "Bangalore, India",
          lat: 12.9716,
          lng: 77.5946,
          country: "India",
        },
      ],
      attractions: {
        "New York": [
          {
            name: "Central Park",
            type: "park",
            description: "Large public park in Manhattan",
          },
          {
            name: "Times Square",
            type: "attraction",
            description: "Famous commercial intersection",
          },
          {
            name: "Statue of Liberty",
            type: "monument",
            description: "Iconic symbol of freedom",
          },
          {
            name: "Brooklyn Bridge",
            type: "bridge",
            description: "Historic suspension bridge",
          },
          {
            name: "The High Line",
            type: "park",
            description: "Elevated linear park",
          },
        ],
        London: [
          {
            name: "Big Ben",
            type: "monument",
            description: "Iconic clock tower",
          },
          {
            name: "London Eye",
            type: "attraction",
            description: "Giant observation wheel",
          },
          {
            name: "Tower Bridge",
            type: "bridge",
            description: "Famous bascule bridge",
          },
          {
            name: "British Museum",
            type: "museum",
            description: "World-famous museum",
          },
          { name: "Hyde Park", type: "park", description: "Large royal park" },
        ],
        Paris: [
          {
            name: "Eiffel Tower",
            type: "monument",
            description: "Iconic iron lattice tower",
          },
          {
            name: "Louvre Museum",
            type: "museum",
            description: "World's largest art museum",
          },
          {
            name: "Notre-Dame",
            type: "cathedral",
            description: "Medieval Catholic cathedral",
          },
          {
            name: "Arc de Triomphe",
            type: "monument",
            description: "Famous triumphal arch",
          },
          {
            name: "Champs-Élysées",
            type: "avenue",
            description: "Famous avenue",
          },
        ],
        Mumbai: [
          {
            name: "Gateway of India",
            type: "monument",
            description: "Historic monument overlooking the harbor",
          },
          {
            name: "Marine Drive",
            type: "promenade",
            description: "Beautiful seafront promenade",
          },
          {
            name: "Elephanta Caves",
            type: "heritage",
            description: "Ancient rock-cut caves",
          },
          {
            name: "Chhatrapati Shivaji Terminus",
            type: "railway",
            description: "Historic railway station",
          },
          {
            name: "Juhu Beach",
            type: "beach",
            description: "Popular beach destination",
          },
        ],
        Delhi: [
          {
            name: "Red Fort",
            type: "fort",
            description: "Historic Mughal fort",
          },
          {
            name: "India Gate",
            type: "monument",
            description: "War memorial monument",
          },
          {
            name: "Qutub Minar",
            type: "tower",
            description: "Medieval Islamic monument",
          },
          {
            name: "Lotus Temple",
            type: "temple",
            description: "Bahá'í House of Worship",
          },
          {
            name: "Humayun's Tomb",
            type: "tomb",
            description: "Mughal emperor's tomb",
          },
        ],
        Pune: [
          {
            name: "Shaniwar Wada",
            type: "fort",
            description: "Historic fortification",
          },
          {
            name: "Aga Khan Palace",
            type: "palace",
            description: "Historic palace and memorial",
          },
          {
            name: "Sinhagad Fort",
            type: "fort",
            description: "Ancient hill fortress",
          },
          {
            name: "Osho Ashram",
            type: "spiritual",
            description: "Meditation resort",
          },
          {
            name: "Pune-Okayama Friendship Garden",
            type: "garden",
            description: "Beautiful Japanese garden",
          },
        ],
      },
    };
  }

  initializeMap() {
    // Initialize map centered on India
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
      .catch(() => {
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

  generateLocationInfo(lat, lng) {
    // Find closest city
    let closestCity = null;
    let minDistance = Infinity;

    this.locationDatabase.cities.forEach((city) => {
      const distance = this.calculateDistance(lat, lng, city.lat, city.lng);
      if (distance < minDistance) {
        minDistance = distance;
        closestCity = city;
      }
    });

    // Generate location name based on proximity
    let locationName;
    if (minDistance < 50) {
      // Within 50km
      locationName = closestCity.name;
    } else {
      // Generate a regional name
      const region = this.getRegionName(lat, lng);
      locationName = `${region}, ${closestCity.country}`;
    }

    return {
      display_name: locationName,
      address: {
        country: closestCity.country,
        city: closestCity.name.split(",")[0],
        coordinates: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      },
      closestCity: closestCity,
    };
  }

  getRegionName(lat, lng) {
    // Simple region determination based on coordinates
    if (lat >= 8 && lat <= 37 && lng >= 68 && lng <= 97) {
      return "India Region";
    } else if (lat >= 25 && lat <= 49 && lng >= -125 && lng <= -66) {
      return "United States Region";
    } else if (lat >= 35 && lat <= 71 && lng >= -10 && lng <= 40) {
      return "European Region";
    } else {
      return "Global Region";
    }
  }

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
                    <p><strong>Coordinates:</strong> ${
                      address.coordinates || "—"
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
        // Fallback to your local DB if nothing is found
        const foundCity = this.locationDatabase.cities.find((city) =>
          city.name.toLowerCase().includes(trimmed.toLowerCase())
        );
        if (foundCity) {
          if (type === "source") {
            this.setAsSource(foundCity.lat, foundCity.lng, foundCity.name);
          } else {
            this.setAsDestination(foundCity.lat, foundCity.lng, foundCity.name);
          }
          this.map.setView([foundCity.lat, foundCity.lng], 10);
        } else {
          alert(`No results for "${trimmed}". Try a more specific place name.`);
        }
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
    // Calculate straight-line distance and estimated time
    const distance = this.calculateDistance(
      this.sourceLocation.lat,
      this.sourceLocation.lng,
      this.destinationLocation.lat,
      this.destinationLocation.lng
    );

    // More realistic time calculation
    // Assuming average speed of 60 km/h for road travel
    // Add 20% extra for actual road routes (not straight line)
    const roadDistance = distance * 1.2; // Account for actual road routes
    const averageSpeed = 60; // km/h
    const estimatedTimeHours = roadDistance / averageSpeed;
    const estimatedTimeMinutes = Math.round(estimatedTimeHours * 60);

    // Remove existing route
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
    }

    // Draw straight line route (demo purposes)
    this.routeLayer = L.polyline(
      [
        [this.sourceLocation.lat, this.sourceLocation.lng],
        [this.destinationLocation.lat, this.destinationLocation.lng],
      ],
      {
        color: "#ff6b6b",
        weight: 5,
        opacity: 0.8,
      }
    ).addTo(this.map);

    // Fit map to show entire route
    this.map.fitBounds(this.routeLayer.getBounds(), { padding: [20, 20] });

    // Update route info with better time formatting
    document.getElementById("distance").textContent = `${distance.toFixed(
      0
    )} km`;

    // Format time nicely (hours and minutes)
    if (estimatedTimeMinutes < 60) {
      document.getElementById(
        "duration"
      ).textContent = `${estimatedTimeMinutes} minutes`;
    } else if (estimatedTimeMinutes < 1440) {
      // Less than 24 hours
      const hours = Math.floor(estimatedTimeMinutes / 60);
      const minutes = estimatedTimeMinutes % 60;
      if (minutes === 0) {
        document.getElementById("duration").textContent = `${hours} hours`;
      } else {
        document.getElementById(
          "duration"
        ).textContent = `${hours}h ${minutes}m`;
      }
    } else {
      // More than 24 hours
      const days = Math.floor(estimatedTimeMinutes / 1440);
      const hours = Math.floor((estimatedTimeMinutes % 1440) / 60);
      document.getElementById(
        "duration"
      ).textContent = `${days} days ${hours}h`;
    }

    document.getElementById("routeInfo").style.display = "block";
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

    // Fetch mainly tourist places, museums, historic sites, parks
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
          displayName = `${localName} (No English label)`;
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
        };
      });
    } catch (err) {
      console.error("Overpass fetch failed:", err);
      return [];
    }
  }

  displayRecommendations() {
    const container = document.getElementById("recommendationsContent");

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
      groupedByArea[area].forEach((rec) => {
        html += `
                            <div class="recommendation-item">
                                <h4>${rec.name}</h4>
                                <p>${rec.description}</p>
                                <span class="category-tag">${rec.type}</span>
                            </div>
                        `;
      });
    });

    container.innerHTML = html;
  }

  clearRoute() {
    // Clear markers
    if (this.sourceMarker) {
      this.map.removeLayer(this.sourceMarker);
      this.sourceMarker = null;
    }
    if (this.destinationMarker) {
      this.map.removeLayer(this.destinationMarker);
      this.destinationMarker = null;
    }
    if (this.routeLayer) {
      this.map.removeLayer(this.routeLayer);
      this.routeLayer = null;
    }

    // Clear inputs and data
    document.getElementById("source").value = "";
    document.getElementById("destination").value = "";
    document.getElementById("routeInfo").style.display = "none";
    document.getElementById("recommendationsContent").innerHTML =
      '<p class="loading">Select source and destination to get recommendations...</p>';
    document.getElementById("exportButtons").style.display = "none";

    this.sourceLocation = null;
    this.destinationLocation = null;
    this.recommendations = [];

    // Reset map view
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

  // --- AUTOCOMPLETE using Photon API ---
  async autocomplete(query, type) {
    if (query.length < 2) {
      this.clearSuggestions(type);
      return;
    }
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}`
    );
    const data = await res.json();
    const results = data.features.slice(0, 5);
    this.showSuggestions(results, type);
  }

  showSuggestions(results, type) {
    const box = document.getElementById(
      type === "source" ? "sourceSuggestions" : "destinationSuggestions"
    );
    box.innerHTML = "";
    box.style.display = results.length ? "block" : "none";

    results.forEach((place) => {
      let name = place.properties.name || "Unnamed";
      let country = place.properties.country || "";
      let fullName = `${name}, ${country}`;

      let div = document.createElement("div");
      div.textContent = fullName;

      div.onclick = () => {
        if (type === "source") {
          this.setAsSource(
            place.geometry.coordinates[1],
            place.geometry.coordinates[0],
            fullName
          );
          document.getElementById("source").value = fullName;
        } else {
          this.setAsDestination(
            place.geometry.coordinates[1],
            place.geometry.coordinates[0],
            fullName
          );
          document.getElementById("destination").value = fullName;
        }
        this.saveRecent(fullName);
        box.innerHTML = "";
        box.style.display = "none";
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
  }
}

// Initialize the application
let travelPlanner;
document.addEventListener("DOMContentLoaded", () => {
  travelPlanner = new TravelPlanner();
});
