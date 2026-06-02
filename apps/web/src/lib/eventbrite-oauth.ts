import { getAppOrigin } from '@/lib/google';

/** Cookie name for CSRF state token — shared by connect + callback routes. */
export const EVENTBRITE_STATE_COOKIE = 'eventbrite_oauth_state';

/**
 * Returns the Eventbrite OAuth2 redirect URI pinned to the canonical app origin.
 * Must EXACTLY match what is registered in the Eventbrite app.
 */
export function getEventbriteRedirectUri(): string {
  return `${getAppOrigin()}/api/integrations/eventbrite/callback`;
}
