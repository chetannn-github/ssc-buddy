/** Website slots per Focus Lock session across web, mobile, widgets and extension. */
export const MAX_STUDY_WEBSITES = 2;

export const SOCIAL_SITES = ["instagram.com", "facebook.com", "fb.com", "x.com", "twitter.com", "reddit.com", "snapchat.com", "tiktok.com", "threads.net", "threads.com", "pinterest.com", "linkedin.com", "discord.com", "discord.gg", "telegram.org", "t.me", "twitch.tv"];
export const hostWithin = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);
export const isSocialHost = (host: string) => SOCIAL_SITES.some(domain => hostWithin(host, domain));
export function websiteDomain(value: string) {
  const text = value.trim();
  const url = new URL(text.includes("://") ? text : `https://${text}`);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || host.length > 253 || !host.includes(".") || /^\d+(\.\d+){3}$/.test(host) || host.endsWith(".localhost") || host.split(".").some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw Error("Enter a domain like parmar.com.");
  return host;
}
export function splitSelection(values: string[]) {
  const domains = [...new Set(values.map(websiteDomain))];
  if (domains.some(isSocialHost)) throw Error("Social media websites cannot be added.");
  if (domains.length > MAX_STUDY_WEBSITES) throw Error(`Maximum ${MAX_STUDY_WEBSITES} websites per session.`);
  return { domains };
}
