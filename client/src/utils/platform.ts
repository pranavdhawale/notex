/**
 * Platform detection utility
 * Uses modern navigator.userAgentData when available,
 * falls back to navigator.platform for older browsers
 */

// Cache the result to avoid repeated checks
let cachedIsMac: boolean | null = null;

/**
 * Check if the current platform is macOS
 * Uses navigator.userAgentData when available (modern API),
 * falls back to navigator.platform for older browsers
 */
export function isMacOS(): boolean {
	// Return cached result if available
	if (cachedIsMac !== null) return cachedIsMac;

	// Try modern API first
	if ('userAgentData' in navigator && navigator.userAgentData) {
		const navData = navigator.userAgentData as NavigatorUAData;
		if (navData.platform) {
			cachedIsMac = navData.platform.toLowerCase().includes('mac');
			return cachedIsMac;
		}
	}

	// Fallback to navigator.platform
	cachedIsMac = navigator.platform.toUpperCase().includes('MAC');
	return cachedIsMac;
}

/**
 * Get the modifier key for keyboard shortcuts
 * Returns 'Meta' for Mac, 'Control' for other platforms
 */
export function getModKey(): 'Meta' | 'Control' {
	return isMacOS() ? 'Meta' : 'Control';
}

// Type definition for NavigatorUAData (not yet in standard lib)
interface NavigatorUAData {
	platform?: string;
	brands?: Array<{ brand: string; version: string }>;
}