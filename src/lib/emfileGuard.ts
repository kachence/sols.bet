// Simple guard that forces the process to exit (allowing the platform to
// spawn a fresh instance) when we hit the "too many open files" error.
// Import this module once at startup (e.g. from supabase.ts) – it is
// idempotent thanks to the global flag.

const key = '__EMFILE_GUARD_INSTALLED__';

if (!(global as any)[key]) {
  process.on('uncaughtException', (err: any) => {
    if (err && typeof err.message === 'string' && /EMFILE|too many open files/i.test(err.message)) {
      // Log and exit fast; Vercel / serverless platform will start a new worker.
      console.error('[EMFILE GUARD] Exiting process due to EMFILE:', err.message);
      // Give the logs a brief moment to flush.
      setTimeout(() => process.exit(1), 50);
    }
  });

  (global as any)[key] = true;
}

export {}; 