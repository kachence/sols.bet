import { NextApiRequest } from 'next';

export function logRequest(req: NextApiRequest, endpoint: string, requestId: string) {
  console.log(`[REQ-${endpoint}-${requestId}] ${req.method} ${req.url}`);
  console.log(`[REQ-${endpoint}-${requestId}] Headers:`, JSON.stringify(req.headers));
  if (req.method === 'POST') {
    console.log(`[REQ-${endpoint}-${requestId}] Body:`, JSON.stringify(req.body));
  } else {
    console.log(`[REQ-${endpoint}-${requestId}] Query:`, JSON.stringify(req.query));
  }
}

export function logError(endpoint: string, requestId: string, err: unknown) {
  console.error(`[ERR-${endpoint}-${requestId}]`, err);
}

export function logResponse(endpoint: string, requestId: string, payload: unknown, start: number) {
  console.log(`[RES-${endpoint}-${requestId}]`, JSON.stringify(payload));
  console.log(`[RES-${endpoint}-${requestId}] Duration: ${Date.now() - start}ms`);
} 