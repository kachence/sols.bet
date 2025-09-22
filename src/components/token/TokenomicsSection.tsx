// src/components/token/TokenomicsSection.tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartPie, faCoins, faZap, faShield, faCrown } from '@fortawesome/free-solid-svg-icons';

export function TokenomicsSection() {
  const tokenUtility = [
    {
      icon: faCoins,
      title: "Native Gaming Currency",
      description: "Use $SOLS for all casino games with reduced fees"
    },
    {
      icon: faZap,
      title: "Enhanced Rewards",
      description: "Earn higher rakeback rates and bonus multipliers with $SOLS"
    },
    {
      icon: faShield,
      title: "Governance Rights",
      description: "Vote on platform decisions and game additions"
    },
    {
      icon: faCrown,
      title: "Premium Features", 
      description: "Access exclusive tournaments and premium game variants"
    }
  ];

  const revenueDistribution = [
    "40-50% of daily casino profits allocated to game providers",
    "20% of daily profits used for $SOLS buyback & burn mechanism", 
    "Remaining profits fund platform development and marketing",
    "Deflationary tokenomics through systematic token burns",
  ];

  const platformGoals = [
    "Grow our user base through exceptional gaming experience",
    "Fulfill requirements to partner with major game providers",
    "Open-source our code to build community trust and transparency"
  ];

  return (
    <section className="bg-cardMedium border border-cardMedium rounded-lg p-6 relative z-10">
      <div className="flex items-center gap-3 mb-6">
        <FontAwesomeIcon 
          icon={faChartPie} 
          className="text-richGold w-8 h-8" 
          style={{ fontSize: '32px' }}
        />
        <h2 className="text-3xl font-bold font-heading text-white">Tokenomics</h2>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Token Utility */}
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Token Utility</h3>
          
          {/* Utility Features */}
          <div className="space-y-3">
            {tokenUtility.map((item, index) => (
              <div key={index} className="bg-darkLuxuryPurple rounded-lg p-4 hover:bg-darkLuxuryPurple/80 transition-colors duration-200">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <FontAwesomeIcon 
                      icon={item.icon} 
                      className="text-richGold w-6 h-6" 
                      style={{ fontSize: '24px' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-base mb-1">{item.title}</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Casino Economics */}
        <div>
          <h3 className="text-xl font-bold text-white mb-4">Casino Economics</h3>
          <div className="bg-darkLuxuryPurple rounded-lg p-4 mb-4">
            <h4 className="text-sm font-bold text-richGold mb-3">Revenue Distribution</h4>
            <div className="space-y-3">
              {revenueDistribution.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-richGold mt-2 flex-shrink-0"></div>
                  <span className="text-gray-300 text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-darkLuxuryPurple rounded-lg p-4 mb-4">
            <h4 className="text-sm font-bold text-richGold mb-3">Platform Goals</h4>
            <div className="space-y-3">
              {platformGoals.map((goal, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-richGold mt-2 flex-shrink-0"></div>
                  <span className="text-gray-300 text-sm">{goal}</span>
                </div>
              ))}
            </div>
          </div>


        </div>
      </div>
    </section>
  );
} 