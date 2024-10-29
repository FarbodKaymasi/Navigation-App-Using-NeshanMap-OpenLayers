import { useEffect, useRef, useState } from "react";
import "@neshan-maps-platform/react-openlayers/dist/style.css";
import NeshanMap, {
  NeshanMapRef,
  OlMap,
  Ol,
} from "@neshan-maps-platform/react-openlayers";
import "./App.css";

function App() {
  const mapRef = useRef<NeshanMapRef | null>(null);
  const [ol, setOl] = useState<Ol>();
  const [olMap, setOlMap] = useState<OlMap>();
  const [markerLayer, setMarkerLayer] = useState<any>(null);
  const [currentMarker, setCurrentMarker] = useState<any>(null);
  const [pathMarkers, setPathMarkers] = useState<any[]>([]);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [averageSpeed, setAverageSpeed] = useState<number>(0);
  const [previousPosition, setPreviousPosition] = useState<{
    latitude: number;
    longitude: number;
    timestamp: number;
  } | null>(null);
  const [totalDistance, setTotalDistance] = useState<number>(0);
  const [travelTime, setTravelTime] = useState<number>(0);
  const [apiResponse, setApiResponse] = useState<string[]>([]);

  interface RouteStep {
    name: string;
    distance: number;
  }

  if (pathMarkers.length === 2 && olMap) {
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${pathMarkers[0][1]},${pathMarkers[0][0]};${pathMarkers[1][1]},${pathMarkers[1][0]}?geometries=geojson&overview=full`;

    fetch(routeUrl)
      .then((response) => response.json())
      .then((data) => {
        const coordinates = data.routes[0].geometry.coordinates.map(
          (point: [number, number]) => ol.proj.fromLonLat([point[0], point[1]])
        );

        const lineFeature = new ol.Feature({
          geometry: new ol.geom.LineString(coordinates),
        });

        lineFeature.setStyle(
          new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: "blue",
              width: 3,
            }),
          })
        );

        markerLayer.getSource().addFeature(lineFeature);

        setTravelTime(data.routes[0].duration / 60);
        setTotalDistance(data.routes[0].distance / 1000);

        const streetNames = data.routes[0].legs[0].steps.map(
          (step: RouteStep) => step.name
        );
        console.log("Streets passed through:", streetNames);
      })
      .catch((error) => console.error("Error fetching the route:", error));
  }

  const onInit = (ol: Ol, map: OlMap) => {
    try {
      setOl(ol);
      setOlMap(map);

      const view = map.getView();
      const initialCoordinates = ol.proj.fromLonLat([
        51.36281969540723, 35.69672648316882,
      ]);

      view.animate({
        center: initialCoordinates,
        zoom: 12,
        duration: 1000,
      });

      const newMarkerLayer = new ol.layer.Vector({
        source: new ol.source.Vector(),
      });
      map.addLayer(newMarkerLayer);
      setMarkerLayer(newMarkerLayer);

      const markerElement = document.createElement("div");
      markerElement.innerHTML = `
        <img src="https://cdn-icons-png.flaticon.com/512/684/684908.png" alt="Map Pointer" style="width: 40px; height: 40px;" />
      `;
      markerElement.style.transform = "translate(50%, -90%)";
      markerElement.style.position = "absolute";

      const markerOverlay = new ol.Overlay({
        element: markerElement,
        positioning: "center-center",
      });
      map.addOverlay(markerOverlay);

      const updateMarkerPosition = () => {
        const center = view.getCenter();
        markerOverlay.setPosition(center);
      };

      updateMarkerPosition();

      map.on("postrender", updateMarkerPosition);

      const snapToNearestRoad = async (lat: number, lon: number) => {
        const nearestRoadUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;

        try {
          const response = await fetch(nearestRoadUrl);
          const data = await response.json();
          console.log(data);

          if (data) {
            const nearestLat = parseFloat(data.lat);
            const nearestLon = parseFloat(data.lon);
            const nearestCoords = ol.proj.fromLonLat([nearestLon, nearestLat]);

            view.animate({
              center: nearestCoords,
              duration: 1000,
            });

            markerOverlay.setPosition(nearestCoords);

            if (markerLayer && markerLayer.getSource()) {
              const newMarkerFeature = new ol.Feature({
                geometry: new ol.geom.Point(nearestCoords),
              });

              newMarkerFeature.setStyle(
                new ol.style.Style({
                  image: new ol.style.Icon({
                    anchor: [0.5, 1],
                    src: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
                  }),
                })
              );

              markerLayer.getSource().clear();
              markerLayer.getSource().addFeature(newMarkerFeature);
            }

            return true;
          } else {
            console.log("Not a valid road type, skipping snapping.");
            return false; // No valid road found
          }
        } catch (error) {
          console.error("Error snapping to nearest road:", error);
          return false;
        }
      };
      map.on("moveend", async () => {
        const center = view.getCenter();
        const [lon, lat] = ol.proj.toLonLat(center);

        const snapped = await snapToNearestRoad(lat, lon);
        if (!snapped) {
          console.log("No road close enough to snap to.");
        }
      });
    } catch (error) {
      console.error("Initialization error:", error);
    }
  };



  useEffect(() => {
    if (ol && olMap && markerLayer) {
      let hasCenteredOnUser = false;

      const updatePosition = (position: GeolocationPosition) => {
        try {
          const { latitude, longitude } = position.coords;

          setLatitude(latitude);
          setLongitude(longitude);

          const newCurrentMarker = new ol.Feature({
            geometry: new ol.geom.Point(
              ol.proj.fromLonLat([longitude, latitude])
            ),
          });

          newCurrentMarker.setStyle(
            new ol.style.Style({
              image: new ol.style.Icon({
                anchor: [0.5, 1],
                src: "https://upload.wikimedia.org/wikipedia/commons/e/ec/RedDot.svg",
              }),
            })
          );

          markerLayer.getSource().addFeature(newCurrentMarker);

          if (pathMarkers.length === 2) {
            const routeUrl = `https://api.openstreetmap.org/routed-car/route/v1/driving/${pathMarkers[0][1]},${pathMarkers[0][0]};${pathMarkers[1][1]},${pathMarkers[1][0]}?geometries=geojson&overview=full`;

            fetch(routeUrl)
              .then((response) => response.json())
              .then((data) => {
                const coordinates = data.routes[0].geometry.coordinates.map(
                  (point: any) => ol.proj.fromLonLat([point[0], point[1]])
                );

                const lineFeature = new ol.Feature({
                  geometry: new ol.geom.LineString(coordinates),
                });

                lineFeature.setStyle(
                  new ol.style.Style({
                    stroke: new ol.style.Stroke({
                      color: "blue",
                      width: 3,
                    }),
                  })
                );

                markerLayer.getSource().addFeature(lineFeature);
              })
              .catch((error) =>
                console.error("Error fetching the route:", error)
              );
          }

          if (!hasCenteredOnUser) {
            olMap
              .getView()
              .setCenter(ol.proj.fromLonLat([longitude, latitude]));
            hasCenteredOnUser = true;
          }
        } catch (error) {
          console.error("Error updating position:", error);
        }
      };

      const intervalId = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          updatePosition,
          (error) => {
            console.error("Error getting location:", error);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000,
          }
        );
      }, 1000);

      return () => {
        clearInterval(intervalId);
      };
    }
  }, [ol, olMap, markerLayer, pathMarkers]);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const haversineDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  return (
    <>
      <>
        <NeshanMap
          mapKey="web.409d4f260d7a45b7809344ccbe3a4f2d"
          defaultType="neshan"
          center={{ latitude: 35.7665394, longitude: 51.4749824 }}
          style={{ height: "100vh", width: "100%" }}
          onInit={onInit}
          zoom={60}
          traffic={true}
          poi={true}
        />

        <div
          style={{
            position: "absolute",
            bottom: "10px",
            display: "flex",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            gap: "10px",
          }}
        >
          <button
            style={{
              padding: "10px 20px",
              backgroundColor: "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              marginRight: "10px",
            }}
            onClick={() => {
              if (olMap && pathMarkers.length < 2) {
                const center = olMap.getView().getCenter();
                if (center) {
                  const [lon, lat] = ol.proj.toLonLat(center);
                  setLatitude(lat);
                  setLongitude(lon);

                  const newMarker = new ol.Feature({
                    geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                  });

                  newMarker.setStyle(
                    new ol.style.Style({
                      image: new ol.style.Circle({
                        radius: 10,
                        fill: new ol.style.Fill({ color: "Green" }),
                        stroke: new ol.style.Stroke({
                          color: "white",
                          width: 2,
                        }),
                      }),
                    })
                  );

                  markerLayer.getSource().addFeature(newMarker);

                  setPathMarkers((prevMarkers) => [...prevMarkers, [lat, lon]]);
                }
              } else {
                alert("فقط می‌توانید 2 نقطه ثبت کنید");
              }
            }}
          >
            ثبت موقعیت
          </button>

          <button
            style={{
              padding: "10px 20px",
              backgroundColor: "#dc3545",
              color: "#fff",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
            onClick={() => {
              if (markerLayer) {
                markerLayer.getSource().clear();
                setPathMarkers([]);
              }
            }}
          >
            حذف موقعیت‌ها
          </button>
        </div>
      </>

      <button className="toggle-button" onClick={togglePanel}>
        {isPanelOpen ? "بستن پنل اطلاعات" : "نمایش پنل اطلاعات"}
      </button>

      {isPanelOpen && (
        <div className="side-panel">
          <h2>پنل اطلاعات</h2>
          <p>عرض جغرافیایی: {latitude}</p>
          <p>طول جغرافیایی: {longitude}</p>
          <p>سرعت فعلی: {currentSpeed.toFixed(2)} متر بر ثانیه</p>
          <p>سرعت متوسط: {averageSpeed.toFixed(2)} متر بر ثانیه</p>
          <p>مساحت برحسب کیلومتر: {totalDistance.toFixed(1)} </p>
          <p>زمان تقریبی سفر: {travelTime.toFixed(0)} دقیقه</p>
        </div>
      )}
    </>
  );
}

export default App;
