import { redirect } from "next/navigation";

// The Integrations surface lives at /dashboard/integrations. This alias
// catches the predictable-but-wrong /dashboard/settings/integrations URL
// (e.g. typed by users following the page hierarchy of the Settings card)
// and forwards them server-side, no client flash.
export default function SettingsIntegrationsRedirect() {
  redirect("/dashboard/integrations");
}
