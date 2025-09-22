// Utility to add slight delays to image loading to reduce burst requests
export const throttleImageLoading = (() => {
  let loadCount = 0;
  const MAX_CONCURRENT = 6; // Limit concurrent image optimizations
  
  return (callback: () => void, delay = 50) => {
    if (loadCount < MAX_CONCURRENT) {
      loadCount++;
      callback();
      setTimeout(() => loadCount--, 1000); // Reset after 1 second
    } else {
      // Add small delay for subsequent images
      setTimeout(() => {
        loadCount++;
        callback();
        setTimeout(() => loadCount--, 1000);
      }, delay * (loadCount - MAX_CONCURRENT));
    }
  };
})();

// Add cache busting for retries while preserving original URL
export const addRetryParam = (url: string, retryCount: number): string => {
  if (retryCount === 0) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}retry=${retryCount}&t=${Date.now()}`;
};

// Check if URL is an image optimization URL
export const isOptimizationUrl = (url: string): boolean => {
  return url.includes('/_next/image');
};
