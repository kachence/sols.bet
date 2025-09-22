import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { GemCollection as GemCollectionType, GemIncrement, useGemCollection } from '@/hooks/useGemCollection';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGem } from '@fortawesome/free-solid-svg-icons';
import { GEM_CONFIG } from '@/constants';

interface GemIncrementAnimationProps {
  increment: GemIncrement;
}

// Small +N animation that appears next to the count
const GemIncrementAnimation: React.FC<GemIncrementAnimationProps> = ({ increment }) => {
  return (
    <motion.span
      key={increment.timestamp}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 1.8, ease: "easeOut" }}
      className="mr-2 text-sm font-extrabold text-richGold pointer-events-none select-none"
    >
      +{increment.amount}
    </motion.span>
  );
};

interface GemCollectionProps {
  className?: string;
  // Optional props to override internal hook data (for testing)
  gemCollection?: GemCollectionType | null;
  loading?: boolean;
  error?: string | null;
  gemIncrements?: GemIncrement[];
}

// Component that uses the hook internally and matches sidebar design
export const GemCollection: React.FC<GemCollectionProps> = ({ 
  className = "",
  gemCollection: propGemCollection,
  loading: propLoading,
  error: propError,
  gemIncrements: propGemIncrements
}) => {
  const hookData = useGemCollection();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Use props if provided, otherwise use hook data
  const gemCollection = propGemCollection !== undefined ? propGemCollection : hookData.gemCollection;
  const loading = propLoading !== undefined ? propLoading : hookData.loading;
  const error = propError !== undefined ? propError : hookData.error;
  const gemIncrements = propGemIncrements !== undefined ? propGemIncrements : hookData.gemIncrements;

  console.log('💎 GemCollection - Current increments:', gemIncrements);

  if (!isClient) {
    return <div className={`bg-cardMedium border border-cardMedium rounded-lg p-6 ${className}`}>Loading...</div>;
  }

  return (
    <div className={`bg-cardMedium border border-cardMedium rounded-lg p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon 
            icon={faGem} 
            className="text-white w-5 h-5" 
            style={{ fontSize: '20px' }}
          />
          <h3 className="text-white font-bold">Gem Collection</h3>
        </div>
      </div>

      <div className="space-y-3">
        {GEM_CONFIG.types.map((gem) => {
          const count = gemCollection?.[gem.name.toLowerCase()] || 0;
          
          // Find active increment for this gem type
          const activeIncrement = gemIncrements.find(inc => inc.gemType === gem.name.toLowerCase());
          if (activeIncrement) {
            console.log(`🎬 Found activeIncrement for ${gem.name.toLowerCase()}:`, activeIncrement);
          }
          
          return (
            <div key={gem.name} className="flex items-center justify-between bg-darkLuxuryPurple rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 relative flex-shrink-0">
                    <Image 
                      src={gem.image} 
                      alt={gem.name} 
                      width={32} 
                      height={32}
                      className="object-contain"
                    />
                  </div>
                  <span className="text-white font-medium text-sm">{gem.name}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white font-bold flex items-center">
                  <AnimatePresence>
                    {activeIncrement && (
                      <GemIncrementAnimation key={activeIncrement.timestamp} increment={activeIncrement} />
                    )}
                  </AnimatePresence>
                  {count}
                </div>
              </div>
            </div>
          );
        })}
{/*         
        {loading && (
          <div className="text-center py-4">
            <p className="text-gray-400 text-sm">Loading gems...</p>
          </div>
        )}
        
        {error && (
          <div className="text-center py-4">
            <p className="text-red-400 text-sm">Error: {error}</p>
          </div>
        )} */}
      </div>
    </div>
  );
};

export default GemCollection; 