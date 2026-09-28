// Expo entry point. Registers the root React component so the native runtime can
// mount it. The capture *logic* lives in `src/` (platform-agnostic, unit-tested);
// this file and everything under `src/native` + `src/screens` is the device layer.
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
