/**
 * Native adapter: network reachability over `@react-native-community/netinfo`
 * (Phase "Sync engine"). The sync engine uploads only when this
 * reports a reachable connection, so captures made offline stay queued.
 */
import NetInfo from '@react-native-community/netinfo';

import type { NetworkMonitor } from '../ports.js';

export class NetInfoMonitor implements NetworkMonitor {
  async isConnected(): Promise<boolean> {
    const state = await NetInfo.fetch();
    // `isInternetReachable` can be null while probing; treat only an explicit
    // reachable connection as online so a half-open network never triggers a
    // doomed upload attempt.
    return state.isConnected === true && state.isInternetReachable !== false;
  }
}
