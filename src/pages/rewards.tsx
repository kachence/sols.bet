import Head from "next/head";
import { Icon } from "@/components/common";

export default function RewardsPage() {
  // Rewards system has been removed

  return (
    <>
      <Head>
        <title>Rewards Center - SOLS.BET | Player Rewards & Bonuses</title>
        <meta name="description" content="Earn exclusive rewards through gameplay, claim special bonuses, and level up your player status at SOLS.BET - the premier blockchain casino on Solana." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sols.bet/rewards" />
        <meta property="og:title" content="Rewards Center - SOLS.BET" />
        <meta property="og:description" content="Earn exclusive rewards through gameplay and claim special bonuses at SOLS.BET blockchain casino." />
        <meta property="og:image" content="https://sols.bet/seo-banner.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="SOLS.BET" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://sols.bet/rewards" />
        <meta property="twitter:title" content="Rewards Center - SOLS.BET" />
        <meta property="twitter:description" content="Earn exclusive rewards through gameplay and claim special bonuses at SOLS.BET blockchain casino." />
        <meta property="twitter:image" content="https://sols.bet/seo-banner.png" />

        {/* Additional SEO */}
        <meta name="keywords" content="casino rewards, player bonuses, crypto casino bonuses, blockchain rewards, loyalty program" />
        <link rel="canonical" href="https://sols.bet/rewards" />
      </Head>
      <div className="flex flex-col items-center gap-6 py-24 text-center">
        <Icon name="info" size="lg" className="text-secondary" />
        <h1 className="text-3xl font-bold text-white">Rewards Feature Removed</h1>
        <p className="text-gray-400 max-w-md">Stay tuned for future updates.</p>
      </div>
    </>
  );
} 