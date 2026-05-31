import { getAppOrigin } from '@/lib/google';

/** Cookie name for CSRF state token — shared by connect + callback routes. */
export const MAILCHIMP_STATE_COOKIE = 'mailchimp_oauth_state';

/**
 * Returns the Mailchimp OAuth2 redirect URI pinned to the canonical app origin.
 * Must EXACTLY match what is registered in the Mailchimp app.
 */
export function getMailchimpRedirectUri(): string {
  return `${getAppOrigin()}/api/integrations/mailchimp/callback`;
}
