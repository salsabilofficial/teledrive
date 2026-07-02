import { isMobileWeb, isAndroidWeb } from '../api/platform';

export function usePlatform() {
    return {
        isMobile: isMobileWeb(),
        isAndroid: isAndroidWeb(),
        platform: isMobileWeb() ? 'web-mobile' : 'web-desktop',
    };
}
