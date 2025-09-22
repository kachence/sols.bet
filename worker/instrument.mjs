// Import Sentry for ES modules
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://726d1e746a9a0c1ed29a79b4283417f7@o4509729292877824.ingest.us.sentry.io/4509729293205504",

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,

  // Set environment based on NODE_ENV
  environment: process.env.NODE_ENV || 'production',

  // Performance monitoring
  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

  // Enhanced error context
  beforeSend(event) {
    // Add worker context to all events
    if (event.contexts) {
      event.contexts.worker = {
        type: 'casino-worker',
        version: '1.0.0'
      };
    }
    return event;
  },

  // Debug mode only for local development  
  debug: false,

  // Reduce log noise in production
  normalizeDepth: 3,
  maxBreadcrumbs: 50,
});

console.log("🔍 Sentry initialized for casino-worker-100x"); 