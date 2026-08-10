import { dbService } from './db';

const ONBOARDING_KEY = 'media-logger-onboarding-complete';

/**
 * Check if the user is new (database has no entries)
 */
export async function checkIsNewUser(): Promise<boolean> {
    try {
        return !(await dbService.hasEntries());
    } catch (error) {
        // If we can't connect to DB, assume new user
        console.log('[Onboarding] Could not check entries, assuming new user');
        return true;
    }
}

/**
 * Check if user has completed onboarding before
 */
export function hasCompletedOnboarding(): boolean {
    return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

/**
 * Mark onboarding as complete
 */
export function markOnboardingComplete(): void {
    localStorage.setItem(ONBOARDING_KEY, 'true');
}

/**
 * Determine if we should show the welcome screen
 * - Show if user hasn't completed onboarding AND has no entries
 */
export async function shouldShowWelcome(): Promise<boolean> {
    // If already completed onboarding, don't show
    if (hasCompletedOnboarding()) {
        return false;
    }

    // Show only if user is new (no entries)
    return await checkIsNewUser();
}
