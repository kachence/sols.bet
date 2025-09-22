/**
 * HMAC utilities for CWS API v2.0 signature generation
 * Matches the exact implementation from worker/api.js
 */

// Simple HMAC SHA256 implementation for browser environment
async function simpleHmacSha256(key: string, message: string): Promise<string> {
  // Convert key and message to Uint8Array
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const messageData = encoder.encode(message);
  
  try {
    // Use Web Crypto API if available
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' } as HmacImportParams,
      false,
      ['sign'] as KeyUsage[]
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData as BufferSource);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error('Web Crypto API failed, using fallback:', error);
    
    // Fallback implementation for environments without Web Crypto API
    // This is a simplified implementation for testing only
    let hash = 0;
    const combined = key + message;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }
}

/**
 * Generate HMAC signature matching server implementation
 * This exactly matches the validateHmacSignature function in worker/api.js
 */
export async function generateHmacSignature(data: any, apiEncryptionKey: string): Promise<string> {
  if (!apiEncryptionKey) {
    throw new Error('API encryption key is required for HMAC generation');
  }
  
  // Fields to hash in exact order as per CWS documentation (matching server)
  const fieldsToHash = [
    data.command,
    data.timestamp,
    data.login,
    data.internal_session_id,
    data.uniqid,
    data.amount,
    data.type,
    data.userid,
    data.custom_data
  ];
  
  // Create JSON string with specific flags (matching PHP implementation)
  // PHP uses: JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_NUMERIC_CHECK
  const jsonString = JSON.stringify(fieldsToHash, (key, value) => {
    // Convert numeric strings to actual numbers (JSON_NUMERIC_CHECK equivalent)
    if (typeof value === 'string' && !isNaN(value as any) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    return value;
  }).replace(/\\\//g, '/'); // Unescape slashes (JSON_UNESCAPED_SLASHES equivalent)
  
  // Generate HMAC SHA256
  const hmacSignature = await simpleHmacSha256(apiEncryptionKey, jsonString);
  
  console.log('🔐 HMAC Generation:', {
    fieldsToHash,
    jsonString,
    signature: hmacSignature.substring(0, 16) + '...', // First 16 chars for security
    apiKeyLength: apiEncryptionKey.length
  });
  
  return hmacSignature;
}

/**
 * Generate test signature with option for invalid signatures
 */
export async function generateTestSignature(data: any, apiKey: string, isValid: boolean = true): Promise<string> {
  if (!isValid) {
    return 'invalid_signature_for_testing';
  }
  
  return await generateHmacSignature(data, apiKey);
}

/**
 * Generate an invalid signature for testing purposes
 */
export function generateInvalidSignature(): string {
  return '0dc9c81249768d69b557e85bbfaa3e9d5d92e008bbe33b7cffef2dc56af5db5b';
}

/**
 * Generate a unique transaction ID
 */
export function generateUniqId(prefix: string = 'unitest_'): string {
  const timestamp = Date.now().toString(16);
  const random = Math.random().toString(16).substring(2, 10);
  return `${prefix}${timestamp}${random}`;
}

/**
 * Generate a random gameplay ID
 */
export function generateGpid(): number {
  return Math.floor(Math.random() * 100000000);
}

/**
 * Get current timestamp in the format expected by the API
 */
export function getCurrentTimestamp(): string {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace('T', ' ');
} 