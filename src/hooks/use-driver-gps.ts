import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SEND_INTERVAL_MS = 20_000;
const isGitHubPages = import.meta.env.VITE_GITHUB_PAGES === "true";

export function useDriverGps(
  enabled: boolean,
  driverId?: string | null,
  vehicleId?: string | null
) {
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !navigator.geolocation) {
      setError("GPS not available on this device");
      return;
    }

    const send = async (pos: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSent.current < SEND_INTERVAL_MS) return;
      lastSent.current = now;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const payload = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        speed: pos.coords.speed != null ? pos.coords.speed * 3.6 : undefined,
        accuracy_m: pos.coords.accuracy,
      };

      try {
        if (isGitHubPages) {
          if (!driverId) return;
          const { error: insertErr } = await supabase.from("driver_location_pings").insert({
            driver_id: driverId,
            vehicle_id: vehicleId ?? null,
            latitude: payload.latitude,
            longitude: payload.longitude,
            speed: payload.speed ?? null,
            accuracy_m: payload.accuracy_m ?? null,
            source: "browser",
          });
          if (insertErr) throw insertErr;
          setTracking(true);
          return;
        }

        const res = await fetch("/api/driver/location", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) setTracking(true);
        else setError("Failed to send location");
      } catch {
        setError("Failed to send location");
      }
    };

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(null);
        send(pos);
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 }
    );

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled, driverId, vehicleId]);

  return { tracking, error };
}
