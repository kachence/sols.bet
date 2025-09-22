/** @type {import('next').NextConfig} */
const nextConfig = {
  // Exclude contract tests from TypeScript compilation
  typescript: {
    ignoreBuildErrors: false,
  },
  
  images: {
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [32, 80, 400, 533], // Optimized for your specific use cases
    domains: ['www.sols.bet', 'sols.bet'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days cache
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Reduce concurrent image processing to avoid rate limits
    loader: 'default',
    path: '/_next/image',
    // Limit concurrent optimizations
    unoptimized: false,
  },
  
  async headers() {
    return [
      {
        source: '/_next/image(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Rate-Limit-Bypass',
            value: 'image-optimization',
          },
          {
            key: 'Vary',
            value: 'Accept',
          },
        ],
      },
      {
        source: '/games/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*\\.(jpg|jpeg|png|webp|avif|gif|svg)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  // Reduce build-time image optimization
  experimental: {
    // optimizePackageImports: ['@fortawesome/react-fontawesome'], // Disabled - not available in this Next.js version
  },

  // Production optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;