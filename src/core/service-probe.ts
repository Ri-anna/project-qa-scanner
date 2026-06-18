import axios from 'axios';

/** Returns true if the base URL responds within the timeout (ms). */
export async function isReachable(baseUrl: string, timeoutMs = 5000): Promise<boolean> {
  try {
    await axios.get(baseUrl, { timeout: timeoutMs, validateStatus: () => true });
    return true;
  } catch {
    return false;
  }
}

/** Returns a map of service name → reachable boolean for every entry in the services map. */
export async function probeServices(
  services: Record<string, string>,
  timeoutMs = 5000,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    Object.entries(services).map(async ([name, url]) => [name, await isReachable(url, timeoutMs)] as const)
  );
  return Object.fromEntries(entries);
}
