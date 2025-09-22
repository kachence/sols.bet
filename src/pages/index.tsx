// src/pages/index.tsx
import Head from "next/head";
import { GameCarousel } from "@/components/game/GameCarousel";
import { HeroSlider } from "@/components/layout/HeroSlider";
import { LiveWins } from "@/components/game/LiveWins";
import Image from "next/image";

import { PLATFORM_REFERRAL_FEE } from "@/constants";
import RecentPlays from "@/components/game/RecentPlays/RecentPlays";
import { toast } from "sonner";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Icon } from "@/components/common";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPiggyBank, faBuildingColumns } from '@fortawesome/free-solid-svg-icons';
import { useBankrollValue } from "@/hooks/useBankrollValue";
import { GemCollection } from "@/components/common/GemCollection";
import { useState } from "react";

// Dummy referral helper
const useReferral = () => ({ copyLinkToClipboard: () => navigator.clipboard && navigator.clipboard.writeText(window.location.href) });

export default function HomePage() {
  const walletModal = useWalletModal();
  const wallet = useWallet();
  const { copyLinkToClipboard } = useReferral();
  const { bankrollUsd, loading: bankrollLoading } = useBankrollValue();

  const handleCopyInvite = () => {
    if (!wallet.publicKey) {
      return walletModal.setVisible(true);
    }
    copyLinkToClipboard();
    toast.success(
      `Copied! Share your link to earn a ${PLATFORM_REFERRAL_FEE * 100}% fee when players use this platform`,
    );
  };

  return (
    <>
      <Head>
        <title>SOLS.BET - Premier On-Chain Casino | Provably Fair Blockchain Gaming</title>
        <meta name="description" content="Experience the future of gambling with SOLS.BET - A next-generation casino gaming platform built on Solana blockchain with provably fair games, instant payouts, and transparent gaming." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sols.bet/" />
        <meta property="og:title" content="SOLS.BET - Premier On-Chain Casino" />
        <meta property="og:description" content="A next-generation casino gaming platform built on Solana blockchain with provably fair games." />
        <meta property="og:image" content="https://sols.bet/seo-banner.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="SOLS.BET" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://sols.bet/" />
        <meta property="twitter:title" content="SOLS.BET - Premier On-Chain Casino" />
        <meta property="twitter:description" content="A next-generation casino gaming platform built on Solana blockchain with provably fair games." />
        <meta property="twitter:image" content="https://sols.bet/seo-banner.png" />

        {/* Additional SEO */}
        <meta name="keywords" content="blockchain casino, solana gambling, provably fair, crypto casino, on-chain gaming, web3 casino, decentralized gambling" />
        <meta name="author" content="SOLS.BET" />
        <link rel="canonical" href="https://sols.bet/" />
      </Head>
      <div className="space-y-8">
      {/* Live Wins - Full Width */}
      <LiveWins />

      <div className="flex flex-col min-[1386px]:flex-row gap-8">
        {/* Main Content - Left Side */}
        <div className="flex-1 min-w-0 space-y-8">
          {/* Hero Slider */}
          <HeroSlider onCopyInvite={handleCopyInvite} />

          {/* Play Slots Section */}
          <section className="bg-cardMedium border border-cardMedium rounded-lg p-6 relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Image src="/slot-machine.png" alt="Slots" width={32} height={32} className="w-8 h-8" priority />
                <h2 className="text-3xl font-bold font-heading text-white">Play Slots</h2>
              </div>
              <div className="flex items-center gap-3">
                  <button
                    id="slots-prev"
                  className="p-2 rounded-lg bg-darkLuxuryPurple border border-cardDivider text-white hover:bg-darkLuxuryPurple/80 hover:text-richGold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:bg-cardDarkAlt">
                  <Icon name="chevron-left" size="lg" />
                  </button>
                  <button
                    id="slots-next"
                  className="p-2 rounded-lg bg-darkLuxuryPurple border border-cardDivider text-white hover:bg-darkLuxuryPurple/80 hover:text-richGold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:bg-cardDarkAlt">
                  <Icon name="chevron-right" size="lg" />
                  </button>
              </div>
            </div>
            <GameCarousel gameType="slots" />
          </section>

          {/* Play Classics Section */}
          <section className="bg-cardMedium border border-cardMedium rounded-lg p-6 relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Image src="/casino.png" alt="Classics" width={32} height={32} className="w-8 h-8" priority />
                <h2 className="text-3xl font-bold font-heading text-white">Play Classics</h2>
              </div>
              <div className="flex items-center gap-3">
                  <button
                    id="classics-prev"
                  className="p-2 rounded-lg bg-darkLuxuryPurple border border-cardDivider text-white hover:bg-darkLuxuryPurple/80 hover:text-richGold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:bg-cardDarkAlt">
                  <Icon name="chevron-left" size="lg" />
                  </button>
                  <button
                    id="classics-next"
                  className="p-2 rounded-lg bg-darkLuxuryPurple border border-cardDivider text-white hover:bg-darkLuxuryPurple/80 hover:text-richGold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:bg-cardDarkAlt">
                  <Icon name="chevron-right" size="lg" />
                  </button>
              </div>
            </div>
            <GameCarousel gameType="classics" />
          </section>

          {/* Recent Plays Section */}
          <section className="bg-cardMedium border border-cardMedium rounded-lg relative z-10">
            <RecentPlays />
          </section>
        </div>

        {/* Sidebar - Right Side */}
        <div className="min-[1386px]:w-80 space-y-6">
          {/* Total Bankroll Value */}
          <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon 
                  icon={faBuildingColumns} 
                  className="text-white w-5 h-5" 
                  style={{ fontSize: '20px' }}
                />
                <h3 className="text-white font-bold">Bankroll Value</h3>
              </div>
              <a 
                href={`https://solscan.io/account/FGxFyyspz79vCm5KvawzzBZ3rE3jzdFUDFzyL2Tnu3X3${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                target="_blank" 
                rel="noopener noreferrer"
                className="text-richGold hover:text-richGold/80 transition-colors text-base font-medium"
              >
                Verify
              </a>
            </div>
            
                        <div className="bg-darkLuxuryPurple rounded-lg p-4">
              <div className="flex items-center gap-3">
                <FontAwesomeIcon 
                  icon={faPiggyBank} 
                  className="text-richGold w-5 h-5" 
                  style={{ fontSize: '20px' }}
                />
                <div className="text-white font-bold text-base">
                  {bankrollLoading ? (
                    <span className="animate-pulse">Loading...</span>
                  ) : (
                    `$${bankrollUsd.toLocaleString('en-US', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}`
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {/* Gem Collection */}
          <GemCollection />
        </div>
      </div>
    </div>
    </>
  );
}
