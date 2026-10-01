/**
 * Native adapter: GPS via `expo-location` at `BestForNavigation` accuracy
 * (BUILD_ORDER Phase 4 "GPS"). Returns a single fix; the {@link evaluateGpsAccuracy}
 * gate in `gps.ts` decides whether the accuracy is good enough to capture. The
 * caller must have been granted foreground location permission first.
 */
import * as Location from 'expo-location';

import type { GpsFix, LocationProvider } from '../ports.js';
import type { GpsProvider } from '@panchnama/shared/rn';

export class ExpoLocationProvider implements LocationProvider {
  /** Request foreground permission; returns whether it was granted. */
  async ensurePermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  }

  async currentFix(): Promise<GpsFix> {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    const { coords } = position;
    // expo-location does not expose the OS provider; Android fuses sensors and
    // iOS uses its own stack, so 'fused' is the honest label for both.
    const provider: GpsProvider = 'fused';
    const fix: GpsFix = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy_m: coords.accuracy ?? Number.POSITIVE_INFINITY,
      provider,
    };
    if (coords.altitude !== null && coords.altitude !== undefined) {
      return { ...fix, altitude_m: coords.altitude };
    }
    return fix;
  }
}
