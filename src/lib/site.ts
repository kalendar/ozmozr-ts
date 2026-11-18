/** The public origin of this deployment, e.g. https://ozmozr.example */
export function siteOrigin(request?: Request): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return request ? new URL(request.url).origin : "http://localhost:3000";
}
