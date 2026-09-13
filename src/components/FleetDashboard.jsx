import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import 'leaflet-polylinedecorator';
import '../index.css';

// Fix for default Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const greenIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function ArrowDecorator({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (!map || positions.length < 2) return;

    const polyline = L.polyline(positions);
    const decorator = L.polylineDecorator(polyline, {
      patterns: [
        {
          offset: '25px',
          repeat: '80px',
          symbol: L.Symbol.arrowHead({
            pixelSize: 10,
            polygon: false,
            pathOptions: { stroke: true, weight: 2, color: '#3b82f6' }
          })
        }
      ]
    }).addTo(map);

    return () => {
      map.removeLayer(decorator);
    };
  }, [map, positions]);

  return null;
}

function MapController({ selectedLocation, markerRefs }) {
  const map = useMap();
  
  useEffect(() => {
    if (selectedLocation && map) {
      // Use setView instead of flyTo. setView just slides the map over, 
      // which is much better for points that are very close together.
      map.setView([selectedLocation.latitude, selectedLocation.longitude], 16, {
        animate: true,
        duration: 0.5
      });
      
      // Use a simple timeout instead of listening for map events. 
      // Map events can misfire if you click two points very close together!
      const timer = setTimeout(() => {
         const marker = markerRefs.current[selectedLocation.id];
         if (marker) {
            marker.openPopup();
         }
      }, 550); // Wait just slightly longer than the 0.5s pan animation
      
      return () => clearTimeout(timer); // Clean up if user clicks another row quickly
    }
  }, [selectedLocation, map, markerRefs]);

  return null;
}

function FleetDashboard() {
  const [date, setDate] = useState(new Date());
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const markerRefs = useRef({});

  useEffect(() => {
    const fetchAvailableDates = async () => {
      // Lightning-fast lookup from the aggregate table!
      const { data } = await supabase.from('active_dates').select('active_date');
      if (data) {
        const dateObjects = data.map(row => {
           const [year, month, day] = row.active_date.split('-');
           return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
        });
        setAvailableDates(dateObjects);
      }
    };
    fetchAvailableDates();
  }, []);

  useEffect(() => {
    fetchDataForDate(date);
    setSelectedLocation(null); // Reset selection when date changes
  }, [date]);

  const fetchDataForDate = async (selectedDate) => {
    setLoading(true);
    
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    // In PostgreSQL, we query by comparing the date part of the timestamp
    // We add 'T00:00:00' and 'T23:59:59' to get the full day's range
    const startOfDay = `${dateString}T00:00:00Z`;
    const endOfDay = `${dateString}T23:59:59Z`;

    const { data, error } = await supabase
      .from('machine_locations')
      .select('*')
      .gte('timestamp', startOfDay)
      .lte('timestamp', endOfDay)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error("Error fetching data:", error);
    } else {
      setLocations(data || []);
    }
    setLoading(false);
  };

  return (
    <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Side: Glassmorphic Data Table & Controls */}
        <div className="w-full h-1/2 md:h-auto md:w-1/2 p-4 md:p-6 flex flex-col bg-slate-50 border-t md:border-t-0 md:border-r border-slate-200 shadow-xl overflow-hidden z-10 order-last md:order-first">
          
          <div className="mb-4 md:mb-6 flex flex-col gap-2 relative z-50">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select Timeline</label>
            <DatePicker 
              selected={date} 
              onChange={(d) => setDate(d)}
              includeDates={availableDates.length > 0 ? availableDates : undefined}
              dateFormat="yyyy-MM-dd"
              popperPlacement="bottom-start"
              wrapperClassName="w-full sm:w-48"
              className="bg-white border border-slate-300 p-2 md:p-2.5 rounded-lg shadow-sm w-full text-slate-700 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-all cursor-pointer text-sm md:text-base"
            />
          </div>

          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm md:text-base">Syncing Data...</div>
            ) : locations.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-medium text-sm md:text-base">No activity recorded on this date.</div>
            ) : (
              <table className="min-w-full text-left text-xs md:text-sm whitespace-nowrap">
                <thead className="uppercase tracking-wider border-b border-slate-200 bg-slate-50 font-bold text-slate-500 sticky top-0 z-20">
                  <tr>
                    <th scope="col" className="px-4 md:px-6 py-3 md:py-4">Seq</th>
                    <th scope="col" className="px-4 md:px-6 py-3 md:py-4">Events</th>
                    <th scope="col" className="px-4 md:px-6 py-3 md:py-4">Status</th>
                    <th scope="col" className="px-4 md:px-6 py-3 md:py-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((loc, index) => {
                    const statusName = loc.status.split('#')[0] || loc.status;
                    const isSelected = selectedLocation && selectedLocation.id === loc.id;
                    return (
                      <tr 
                        key={loc.id} 
                        onClick={() => setSelectedLocation(loc)}
                        className={`border-b border-slate-100 transition-all duration-300 cursor-pointer ${
                          isSelected 
                            ? 'bg-yellow-50/80 border-l-4 border-l-yellow-500 shadow-sm' 
                            : 'hover:bg-slate-50 hover:-translate-y-px hover:shadow-md border-l-4 border-l-transparent'
                        }`}
                      >
                        <td className="px-4 md:px-6 py-3 md:py-4 text-slate-600">{index + 1}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4 font-semibold text-slate-800 truncate max-w-[120px] md:max-w-none">{statusName}</td>
                        <td className="px-4 md:px-6 py-3 md:py-4">
                          <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${statusName.includes('ENGINE_ON') ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                        </td>
                        <td className="px-4 md:px-6 py-3 md:py-4 text-slate-500 tracking-wide font-medium">{new Date(loc.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: Interactive Map */}
        <div className="w-full h-1/2 md:h-auto md:w-1/2 bg-slate-200 relative z-0 order-first md:order-last">
          <MapContainer 
            key={locations.length > 0 ? locations[0].id : 'empty'}  
            center={locations.length > 0 ? [locations[0].latitude, locations[0].longitude] : [26.84, 81.02]} 
            zoom={14} 
            className="w-full h-full absolute inset-0"
          >
            <TileLayer
              url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
            />
            <MapController selectedLocation={selectedLocation} markerRefs={markerRefs} />
            {locations.length > 0 && (
              <>
                <Polyline 
                  positions={locations.map(loc => [loc.latitude, loc.longitude])} 
                  color="#000000" // Thin faint black line
                  weight={2}
                  opacity={0.4}
                />
                <ArrowDecorator positions={locations.map(loc => [loc.latitude, loc.longitude])} />
                {locations.map((loc, index) => {
                  const statusName = loc.status.split('#')[0] || loc.status;
                  
                  let markerIcon = DefaultIcon;
                  if (index === 0) markerIcon = greenIcon; // Start of the route
                  else if (index === locations.length - 1) markerIcon = redIcon; // End of the route

                  return (
                    <Marker 
                      key={loc.id} 
                      position={[loc.latitude, loc.longitude]} 
                      icon={markerIcon}
                      ref={(ref) => {
                        if (ref) {
                          markerRefs.current[loc.id] = ref;
                        }
                      }}
                    >
                      <Popup autoPan={false} className="custom-popup">
                        <div className="font-sans bg-white p-2 text-slate-800 rounded-md shadow-sm">
                          <b className="text-yellow-600 text-lg">Step {index + 1}</b><br/>
                          <span className="text-slate-500 text-xs uppercase tracking-wider">Time:</span> {new Date(loc.timestamp).toLocaleTimeString()}<br/>
                          <span className="text-slate-500 text-xs uppercase tracking-wider">Status:</span> <b className="text-slate-900">{statusName}</b>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </>
            )}
          </MapContainer>
        </div>

      </main>
  );
}

export default FleetDashboard;


