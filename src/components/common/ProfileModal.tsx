import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserAchievements } from "@/hooks/useUserAchievements";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faCopy, faCheck } from '@fortawesome/free-solid-svg-icons';
import { toast } from "sonner";
import { generateReferralCode } from "@/lib/referralUtils";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { publicKey } = useWallet();
  const { achievements, loading, error } = useUserAchievements();
  const [copied, setCopied] = useState(false);

  const formatAddress = (address: string) => {
    if (!address) return "";
    return address;
  };

  const getRankFromWagered = (wagered: number) => {
    if (wagered < 10000) return "Rookie";
    if (wagered < 25000) return "Grinder";
    if (wagered < 100000) return "Highroller";
    if (wagered < 1000000) return "Whale";
    return "Legend";
  };

  const getProgressPercentage = (wagered: number) => {
    // Progress towards $10k for Rookie rank
    return Math.min((wagered / 10000) * 100, 100);
  };

  // Generate referral link
  const generateReferralLink = () => {
    if (!publicKey) return "";
    const referralCode = generateReferralCode(publicKey.toBase58());
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://sols.bet';
    return `${baseUrl}?ref=${referralCode}`;
  };

  const copyReferralLink = async () => {
    const referralLink = generateReferralLink();
    if (!referralLink) return;

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success("Referral link copied to clipboard!");
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy referral link");
    }
  };

  // Default values when no data is available - fix negative wagered amounts
  const rawWagered = achievements?.totalWagered || 0;
  const totalWagered = Math.abs(rawWagered); // Ensure positive value
  const currentRank = getRankFromWagered(totalWagered);
  
  const profileData = {
    ...achievements,
    totalWagered,
    currentRank,
         largestPayout: achievements?.largestPayout || {
       amount: 0,
       multiplier: 0,
       gameName: "No wins yet",
       gameImage: "/sols-bet-logo.png"
     },
     luckiestBet: achievements?.luckiestBet || {
       multiplier: 0,
       payout: 0,
       gameName: "No wins yet",
       gameImage: "/sols-bet-logo.png"
     }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md w-full bg-cardMedium rounded-xl p-0 gap-0 border-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4">
          <div className="w-6 h-6 flex items-center justify-center">
            <FontAwesomeIcon icon={faUser} className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">Profile</h2>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-6">
          {/* Avatar Image */}
          <div className="flex justify-center mb-6">
            <img 
              src="/avatar.png" 
              alt="Avatar" 
              className="w-24 h-24 object-cover rounded-full"
            />
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Wagered</div>
              <div className="text-white font-bold text-xl">
                {loading ? "Loading..." : `$${profileData.totalWagered.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Current Rank</div>
              <div className="text-white font-bold text-xl">{loading ? "Loading..." : profileData.currentRank}</div>
            </div>
          </div>

          {/* Progress Bar (for rank) */}
          <div className="w-full bg-darkLuxuryPurple rounded-full h-2">
            <div className="bg-richGold h-2 rounded-full" style={{ width: `${getProgressPercentage(profileData.totalWagered)}%` }}></div>
          </div>

          {/* Referral Link */}
          <div className="space-y-2">
            <div className="text-gray-400 text-sm">Your Referral Link</div>
            <div className="bg-darkLuxuryPurple rounded-lg p-3">
              {publicKey ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyReferralLink}
                    className="text-white font-mono text-sm break-all flex-1 text-left underline hover:text-richGold transition-colors cursor-pointer"
                    title="Click to copy referral link"
                  >
                    {generateReferralLink()}
                  </button>
                  <button
                    onClick={copyReferralLink}
                    className="p-2 rounded-md hover:bg-gray-600 transition-colors duration-200 flex-shrink-0"
                    title="Copy Referral Link"
                  >
                    {copied ? (
                      <FontAwesomeIcon icon={faCheck} className="w-4 h-4 text-green-500" />
                    ) : (
                      <FontAwesomeIcon icon={faCopy} className="w-4 h-4 text-richGold hover:text-yellow-400" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="text-white font-mono text-sm break-all">
                  Connect wallet to get referral link
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              Share this link to earn commissions when your friends play!
            </div>
          </div>

          {/* Achievements */}
          <div className="space-y-4">
            {/* Largest Payout */}
            <div className="flex items-center gap-3 p-3 bg-darkLuxuryPurple rounded-lg">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img 
                  src={profileData.largestPayout.gameImage} 
                  alt={profileData.largestPayout.gameName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/sols-bet-logo.png";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-400 text-xs">Largest Payout</div>
                <div className="text-richGold font-bold">
                  ${profileData.largestPayout.amount.toFixed(2)} 
                  <span className="text-gray-400 font-normal ml-1">
                    ({profileData.largestPayout.multiplier.toFixed(2)}x Multiplier)
                  </span>
                </div>
                <div className="text-white text-sm flex items-center gap-1">

                  {profileData.largestPayout.gameName}
                </div>
              </div>
            </div>

            {/* Luckiest Bet */}
            <div className="flex items-center gap-3 p-3 bg-darkLuxuryPurple rounded-lg">
              <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <img 
                  src={profileData.luckiestBet.gameImage} 
                  alt={profileData.luckiestBet.gameName}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/sols-bet-logo.png";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-gray-400 text-xs">Luckiest Bet</div>
                <div className="text-richGold font-bold">
                  {profileData.luckiestBet.multiplier.toFixed(2)}x 
                  <span className="text-gray-400 font-normal ml-1">
                    (${profileData.luckiestBet.payout.toFixed(2)} Payout)
                  </span>
                </div>
                <div className="text-white text-sm flex items-center gap-1">
                  {profileData.luckiestBet.gameName}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 