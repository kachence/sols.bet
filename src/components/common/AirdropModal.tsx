import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGift, faGem, faTrophy } from '@fortawesome/free-solid-svg-icons';

interface AirdropModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AirdropModal({ open, onOpenChange }: AirdropModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md w-full bg-cardMedium rounded-xl p-0 gap-0 border-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4">
          <div className="w-6 h-6 flex items-center justify-center">
            <FontAwesomeIcon icon={faGift} className="w-5 h-5 text-richGold" />
          </div>
          <h2 className="text-lg font-bold text-white">Devnet Airdrop</h2>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Total Supply</div>
              <div className="text-white font-bold text-xl">2%</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400 text-sm mb-1">Duration</div>
              <div className="text-white font-bold text-xl">10-14 days</div>
            </div>
          </div>

          {/* Get Devnet SOL Link */}
          <div className="space-y-2">
            <div className="text-gray-400 text-sm">Need Devnet SOL?</div>
            <div className="bg-darkLuxuryPurple rounded-lg p-3">
              <a
                href="https://solfaucet.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-richGold font-mono text-sm break-all underline hover:text-yellow-400 transition-colors"
              >
                Get Free Devnet SOL → solfaucet.com
              </a>
            </div>
            <div className="text-xs text-gray-500">
              Use devnet SOL to play and earn gems for the airdrop!
            </div>
          </div>

          {/* Airdrop Details */}
          <div className="space-y-4">
            {/* Top Players */}
            <div className="flex items-center gap-3 p-4 bg-darkLuxuryPurple rounded-lg">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-richGold to-yellow-600 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faTrophy} className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-richGold font-bold text-lg">Top 100 Players</div>
                <div className="text-gray-300 text-sm">
                  2% of total token supply will be distributed to the top 100 players based on total wagered amount.
                </div>
              </div>
            </div>

            {/* Gem-Based Distribution */}
            <div className="flex items-center gap-3 p-4 bg-darkLuxuryPurple rounded-lg">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faGem} className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-richGold font-bold text-lg">Gem-Based Rewards</div>
                <div className="text-gray-300 text-sm">
                  The airdrop distribution will be based on the gems that the top 100 players earned during devnet testing.
                </div>
              </div>
            </div>
          </div>

          {/* Purpose Section */}
          <div className="bg-darkLuxuryPurple rounded-lg p-4">
            <h3 className="text-richGold font-bold text-lg mb-2">Testing Purpose</h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              This devnet launch helps us test our application for errors and edge cases before mainnet deployment. 
              Your participation is valuable for making our platform robust and secure!
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
