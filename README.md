🗺️ Travel Itinerary Planner

Plan your journeys with interactive maps, route optimization, and personalized travel recommendations.

🚀 Features
🌍 Interactive Map

Built with Leaflet.js and OpenStreetMap.

Click any location on the map to set it as Source or Destination.

Displays detailed location info with coordinates and country.

📍 Trip Planning

Set Source and Destination manually or via map clicks.

Add multiple stops for multi-day itineraries.

Supports trip duration setup (1–7 days), generating separate day blocks with stops.

Choose route preference:

Fastest

Cheapest

Scenic

🛣️ Route Information

Visualizes route directly on the map using Leaflet Routing Machine.

Displays:

Distance (km)

Estimated travel time

Route type

Estimated cost (based on chosen route type)

⭐ Favorites & Recents

Save frequently used source/destination locations as favorites.

Quickly access recent searches.

Stored in localStorage for persistence.

🏛️ Travel Recommendations

Uses Overpass API to fetch nearby attractions around source & destination:

Tourist attractions

Museums, parks, historic sites, monuments, etc.

Interactive list of recommended places:

Show on map with a single click

Custom map markers with icons for each type (e.g., 🏛️ museum, 🌳 park, 🎢 theme park)

📤 Export Options

Export as PDF – generates a detailed itinerary with trip info and recommendations.

Export as JSON – saves itinerary data (source, destination, route details, recommendations).

🧹 Clear & Reset

Clear Route button resets the map, input fields, trip duration, and recommendations.

🎨 Modern UI

Clean, responsive design built with CSS Grid & Flexbox.

Styled with gradients, shadows, and hover effects for an elegant feel.

Mobile-friendly layout.

🛠️ Tech Stack

Frontend: HTML, CSS, JavaScript

Maps & Routing: Leaflet.js, Leaflet Routing Machine, OpenStreetMap, OSRM API

Geocoding: Nominatim API

Attraction Data: Overpass API

Export: jsPDF

📦 Installation

Clone or download this repository.

git clone https://github.com/your-username/travel-itinerary-planner.git
cd travel-itinerary-planner


Make sure the project files are together in one folder:

projectai.html

script.js

style.css

No build process or external server is required since it’s pure HTML/CSS/JS.

(Optional but recommended) Run with a local server for best performance:

Using VS Code Live Server extension, or

Run:

python -m http.server 8000


and open http://localhost:8000/projectai.html in your browser.

▶️ Usage

Open projectai.html in your browser.

Enter Source and Destination:

Type in the input fields, or

Click on the map and choose Set as Source/Destination.

Set Trip Duration and add stops for each day.

Choose Route Preference (Fastest / Cheapest / Scenic).

View Route Information (distance, time, cost).

Explore Recommended Places around your trip locations.

Save useful places as Favorites for quick access.

Export your itinerary as PDF or JSON.

Use Clear Route to reset everything and plan a new trip.
