// src/pages/token.tsx
import { NextSeo } from "next-seo";
import { BASE_SEO_CONFIG } from "@/constants";
import { TokenomicsSection, RoadmapSection } from "@/components/token";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExternalLinkAlt, faCopy, faCheck } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { toast } from "sonner";

export default function SolsTokenPage() {
  const [copied, setCopied] = useState(false);
  
  const contractAddress = "NOT_LAUNCHED_YET";
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(contractAddress);
      setCopied(true);
      toast.success("Contract address copied to clipboard!");
      
      // Reset the icon after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error("Failed to copy contract address");
    }
  };

  return (
    <>
      <NextSeo 
        title="$SOLS Token - SOLS.BET | Blockchain Casino Tokenomics"
        description="Discover the $SOLS token ecosystem - comprehensive tokenomics, exclusive airdrop opportunities, and the roadmap for the future of decentralized gambling on Solana."
        canonical="https://sols.bet/token"
        openGraph={{
          title: "$SOLS Token - SOLS.BET",
          description: "Discover the $SOLS token ecosystem with comprehensive tokenomics and exclusive airdrop opportunities.",
          url: "https://sols.bet/token",
          images: [{
            url: "https://sols.bet/seo-banner.png",
            width: 1200,
            height: 630,
            alt: "SOLS.BET $SOLS Token"
          }],
          site_name: "SOLS.BET"
        }}
        twitter={{
          cardType: "summary_large_image",
          handle: "@solsbet",
          site: "@solsbet"
        }}
        additionalMetaTags={[
          {
            name: "keywords",
            content: "$SOLS token, crypto casino token, solana token, tokenomics, airdrop, blockchain gambling"
          }
        ]}
      />
      
      <div className="space-y-8">
        {/* Header Section */}
        <div className="bg-cardMedium border border-cardMedium rounded-lg p-8 text-center">
          <div className="flex items-center justify-center gap-4 mb-6">
            <Image 
              src="/sols-bet-logo.png" 
              alt="sols.bet Logo" 
              width={48}
              height={48}
              className="w-12 h-12 object-contain"
              priority
            />
            <h1 className="text-5xl font-bold font-heading text-white">$SOLS Token</h1>
          </div>
          
          {/* Contract Address and External Links */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            {/* Contract Address */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">CA:</span>
              <button
                onClick={copyToClipboard}
                className="text-white hover:text-richGold underline decoration-1 underline-offset-2 transition-colors duration-200 text-sm font-mono flex items-center gap-1"
                title="Click to copy contract address"
              >
                {contractAddress}
                <FontAwesomeIcon 
                  icon={copied ? faCheck : faCopy} 
                  className={`w-3 h-3 transition-colors duration-200 ${copied ? 'text-green-400' : 'opacity-60'}`}
                />
              </button>
            </div>
            
            {/* External Links */}
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">|</span>
              
              {/* DexScreener Link */}
              <a
                href={`https://dexscreener.com/solana/${contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-gray-300 hover:text-richGold transition-colors duration-200 text-sm"
                title="View on DexScreener"
              >
                <span>DexScreener</span>
                <FontAwesomeIcon 
                  icon={faExternalLinkAlt} 
                  className="w-3 h-3"
                />
              </a>
              
              {/* Pump.fun Link */}
              <a
                href={`https://pump.fun/coin/${contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-gray-300 hover:text-richGold transition-colors duration-200 text-sm"
                title="Buy on Jupiter"
              >
                <span>Pump.fun</span>
                <FontAwesomeIcon 
                  icon={faExternalLinkAlt} 
                  className="w-3 h-3"
                />
              </a>
            </div>
          </div>

          <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
            The native utility token powering the sols.bet ecosystem. Discover the casino economics 
            and explore our roadmap for the future of on-chain gaming.
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-8">
          {/* Tokenomics Section */}
          <TokenomicsSection />

          {/* Roadmap Section */}
          <RoadmapSection />
        </div>

        {/* Bottom CTA Section */}
        <div className="bg-cardMedium border border-cardMedium rounded-lg p-8 text-center">
          <h2 className="text-3xl font-bold font-heading text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-gray-300 mb-6">
            Join the sols.bet ecosystem and start earning $SOLS tokens today!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-richGold hover:bg-richGold/90 text-black font-bold px-8 py-3 rounded-lg text-lg shadow-[0_0_20px_rgba(255,199,0,0.3)] hover:shadow-[0_0_30px_rgba(255,199,0,0.5)] transition-all duration-300">
              Start Playing
            </button>
            <button className="bg-darkLuxuryPurple border border-cardDivider hover:bg-darkLuxuryPurple/80 text-white font-bold px-8 py-3 rounded-lg text-lg transition-all duration-300">
              Learn More
            </button>
          </div>
        </div>
      </div>
    </>
  );
} 