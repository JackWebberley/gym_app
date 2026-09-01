import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache configured: every route in this app is `force-dynamic`
// (it reads a live database), so there is nothing to cache and adding a KV or R2
// binding would be dead weight.
export default defineCloudflareConfig();
