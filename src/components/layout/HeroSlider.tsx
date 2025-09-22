import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/common";
import { PLATFORM_REFERRAL_FEE } from "@/constants";
import Image from "next/image";

interface SlideData {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  buttonText: string;
  buttonAction: () => void;
  image: string;
  primaryColor: string;
  secondaryColor: string;
}

interface HeroSliderProps {
  onCopyInvite: () => void;
}

export function HeroSlider({ onCopyInvite }: HeroSliderProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  const slides: SlideData[] = [
    {
      id: 1,
      title: "No Registration\nRequired",
      subtitle: "Connect & Play Instantly",
      description: "Skip the paperwork! No KYC, no registration forms, no waiting. Just connect your Solana wallet and start playing immediately. Your privacy, your choice.",
      buttonText: "Connect Wallet",
      buttonAction: () => {
        // This will be handled by wallet connection logic
        console.log("Connect wallet clicked");
      },
      image: "/avatar.png",
      primaryColor: "#FFC700", // Electric Cyan - theme secondary
      secondaryColor: "#FFC700", // Electric Cyan - theme secondary
    },
    {
      id: 2,
      title: "Non Custodial\nSmart Vault",
      subtitle: "Your Keys, Your Crypto",
      description: "Experience true ownership with our smart vault technology. Your funds remain in your wallet at all times - we never hold custody. Play with confidence knowing you maintain complete control.",
      buttonText: "Learn More",
      buttonAction: () => {
        // This could navigate to vault documentation or modal
        console.log("Learn more about vault clicked");
      },
      image: "/golden-vault.png",
      primaryColor: "#FFC700", // Electric Cyan - theme secondary
      secondaryColor: "#FFC700", // Electric Cyan - theme secondary
    },
    {
      id: 3,
      title: "Instant On Chain\nSettlements",
      subtitle: "Win & Get Paid Immediately",
      description: "No waiting, no delays, no middlemen. Every win is instantly settled on the Solana blockchain. Your winnings are transferred directly to your wallet the moment you win - guaranteed by smart contracts.",
      buttonText: "See How It Works",
      buttonAction: () => {
        // This could show a technical explanation or demo
        console.log("See how it works clicked");
      },
      image: "/golden-terminal.png",
      primaryColor: "#FFC700", // Gold (representing instant payments/value)
      secondaryColor: "#FFC700", // Electric Cyan - theme secondary
    },
  ];

  // Auto-advance slides every 5 seconds
  useEffect(() => {
    if (!autoPlay) return;
    
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [autoPlay, slides.length]);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
    setAutoPlay(false); // Pause auto-play when user manually navigates
    
    // Resume auto-play after 10 seconds
    setTimeout(() => setAutoPlay(true), 10000);
  };

  const currentSlideData = slides[currentSlide];

  return (
    <div className="bg-cardMedium border border-cardMedium rounded-2xl p-8 mb-12 relative overflow-visible z-10">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-1/3 h-full opacity-10">
        <div className="w-full h-full bg-gradient-to-l from-cyberTeal to-transparent rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative z-10 overflow-visible">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center overflow-visible"
          >
            {/* Text Content */}
            <div className="space-y-6 text-center">
              <div className="space-y-2">

                
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-4xl lg:text-6xl font-bold font-heading text-white"
                >
                  {currentSlideData.title.split('\n').map((line, index) => (
                    <span key={index}>
                      {line}
                      {index < currentSlideData.title.split('\n').length - 1 && <br />}
                    </span>
                  ))}
                </motion.h1>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xl text-richGold font-semibold"
                >
                  {currentSlideData.subtitle}
                </motion.p>
              </div>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-gray-300 text-lg max-w-md leading-relaxed mx-auto"
              >
                {currentSlideData.description}
              </motion.p>


            </div>

            {/* Image Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="relative flex items-center justify-center overflow-visible"
            >
              {/* Contained golden glow effects */}
              <motion.div
                className="absolute inset-0 -z-10 flex items-center justify-center"
                animate={{
                  background: [
                    `radial-gradient(ellipse 60% 70% at center, ${currentSlideData.primaryColor}15 0%, ${currentSlideData.primaryColor}08 40%, transparent 65%)`,
                    `radial-gradient(ellipse 70% 60% at center, ${currentSlideData.secondaryColor}18 0%, ${currentSlideData.secondaryColor}10 45%, transparent 70%)`,
                    `radial-gradient(ellipse 60% 70% at center, ${currentSlideData.primaryColor}15 0%, ${currentSlideData.primaryColor}08 40%, transparent 65%)`,
                  ],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />

              {/* Inner glow layer for subtle depth */}
              <motion.div
                className="absolute inset-4 -z-5 flex items-center justify-center"
                animate={{
                  background: [
                    `radial-gradient(circle at center, ${currentSlideData.secondaryColor}12 0%, ${currentSlideData.secondaryColor}06 35%, transparent 55%)`,
                    `radial-gradient(circle at center, ${currentSlideData.primaryColor}14 0%, ${currentSlideData.primaryColor}08 40%, transparent 60%)`,
                    `radial-gradient(circle at center, ${currentSlideData.secondaryColor}12 0%, ${currentSlideData.secondaryColor}06 35%, transparent 55%)`,
                  ],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1,
                }}
              />

              {/* Main image with subtle scaling animation */}
              <motion.div
                className="relative z-10 w-80 h-80 sm:w-96 sm:h-96 lg:w-[28rem] lg:h-[28rem] xl:w-[32rem] xl:h-[32rem]"
                animate={{
                  scale: [1, 1.02, 1],
                  rotateY: [0, 2, 0],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Image
                  src={currentSlideData.image}
                  alt={currentSlideData.title}
                  width={512}
                  height={512}
                  className="w-full h-full object-contain drop-shadow-lg"
                  priority
              />
              </motion.div>

              {/* Floating particles effect with randomized positions */}
              <div className="absolute inset-0 pointer-events-none overflow-visible">
                {[
                  { left: 15, top: 25 }, { left: 75, top: 15 }, { left: 45, top: 80 }, 
                  { left: 85, top: 45 }, { left: 25, top: 65 }, { left: 65, top: 30 },
                  { left: 35, top: 15 }, { left: 80, top: 75 }, { left: 20, top: 45 },
                  { left: 55, top: 60 }, { left: 90, top: 20 }, { left: 40, top: 35 }
                ].map((position, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full opacity-70"
                    style={{
                      background: i % 2 === 0 ? currentSlideData.primaryColor : currentSlideData.secondaryColor,
                      left: `${position.left}%`,
                      top: `${position.top}%`,
                    }}
                    animate={{
                      y: [-8, -25, -8],
                      x: [0, Math.sin(i) * 12, 0],
                      opacity: [0.4, 0.9, 0.4],
                      scale: [0.8, 1.3, 0.8],
                    }}
                    transition={{
                      duration: 2.5 + (i * 0.3),
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.25,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>


      </div>
    </div>
  );
} 