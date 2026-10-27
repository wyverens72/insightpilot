declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    MONITOR_CRON_PUBLIC_KEY?: string;
    BUCKET?: R2Bucket;
  }
}
