import { useState, useEffect } from "react";
import Head from "next/head";
import { Icon } from "@/components/common";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faVault, faCircleInfo, faCircleQuestion, faCheck, faArrowRightArrowLeft, faLink } from '@fortawesome/free-solid-svg-icons';
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { usePrice } from "@/hooks/usePrice";
import { useWalletTokenBalances } from "@/hooks/useWalletTokenBalances";
import { useTransactions } from "@/hooks/useTransactions";
import AddFundsModal from "@/components/common/AddFundsModal";
import WithdrawFundsModal from "@/components/common/WithdrawFundsModal";

const useCurrentToken = () => ({ symbol: "SOL", decimals: 9 });
const TokenValue = ({ amount }: { amount: number }) => (
  <span>{typeof amount === "number" ? (amount / 1e9).toFixed(2) : amount}</span>
);

// Helper function to format vault address for display
const formatVaultAddress = (address: string) => {
  if (!address) return "Loading...";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export default function VaultPage() {
  const { connected, publicKey } = useWallet();
  const token = useCurrentToken();
  const balance = useTokenBalance();
  const { priceUsd: solPrice } = usePrice('SOL');
  const { balances: walletBalances, loading: walletLoading } = useWalletTokenBalances();
  const [openFaqItems, setOpenFaqItems] = useState<number[]>([]);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [withdrawFundsOpen, setWithdrawFundsOpen] = useState(false);
  const [vaultAddress, setVaultAddress] = useState<string | null>(null);
  const [showWalletTooltip, setShowWalletTooltip] = useState(false);
  const [showVaultTooltip, setShowVaultTooltip] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // Get user's wallet address for transactions
  const userAddress = connected && publicKey ? publicKey.toString().substring(0, 20) : null;
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  
  // Fetch transactions from API
  const { 
    transactions: apiTransactions, 
    loading: transactionsLoading, 
    error: transactionsError, 
    total: totalTransactions 
  } = useTransactions(userAddress, ITEMS_PER_PAGE, offset);
  
  // Get user's vault address
  useEffect(() => {
    if (!publicKey) {
      setVaultAddress(null);
      return;
    }

    const fetchVaultAddress = async () => {
      try {
        const res = await fetch(`https://casino-worker-v2.fly.dev/user-smart-vault?walletAddress=${publicKey.toBase58()}`);
        const data = await res.json();
        if (res.ok && data.smart_vault) {
          setVaultAddress(data.smart_vault);
        }
      } catch (err) {
        console.error('Failed to fetch vault address:', err);
      }
    };

    fetchVaultAddress();
  }, [publicKey]);

  // Calculate values from actual balance data
  const vaultBalanceSol = connected ? balance.balanceSol : 0;
  const vaultBalanceUsd = connected ? balance.balanceUsd : 0;
  const totalAssets = vaultBalanceUsd;

  const toggleFaqItem = (index: number) => {
    setOpenFaqItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    )
  }

  const faqItems = [
    {
      question: "What guarantees the security of my deposits?",
      answer: "We utilize professionally audited smart contracts on the Solana network. With our non-custodial architecture, you retain complete ownership and control of your assets at every moment."
    },
    {
      question: "How are my assets handled when I'm playing games?",
      answer: "Your gaming funds are securely held within the game's smart contract while you play, and are automatically released back to your vault immediately when the game concludes."
    },
    {
      question: "Is it possible to verify the fairness of games?",
      answer: "Yes! We exclusively partner with reputable and established game providers who maintain strict fairness standards. You can verify game fairness and randomness through each provider's dedicated platform and certification systems."
    },
    {
      question: "Is identity verification required to use this platform?",
      answer: "No identity verification needed! Just connect your Solana wallet and begin playing immediately. We're committed to maintaining your privacy and anonymity."
                },
                {
      question: "What happens to my funds if the platform becomes unavailable?",
      answer: "Your assets are protected by blockchain smart contracts on Solana. Should our platform ever go offline, you can still access and withdraw your funds directly through the smart contracts."
    }
  ];

  return (
    <>
      <Head>
        <title>Smart Vault - SOLS.BET | Secure Blockchain Wallet</title>
        <meta name="description" content="Manage your crypto assets securely with SOLS.BET Smart Vault. Deposit, withdraw, and track your SOL and USDC balances with full blockchain transparency and security." />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sols.bet/vault" />
        <meta property="og:title" content="Smart Vault - SOLS.BET" />
        <meta property="og:description" content="Manage your crypto assets securely with SOLS.BET Smart Vault on Solana blockchain." />
        <meta property="og:image" content="https://sols.bet/seo-banner.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="SOLS.BET" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://sols.bet/vault" />
        <meta property="twitter:title" content="Smart Vault - SOLS.BET" />
        <meta property="twitter:description" content="Manage your crypto assets securely with SOLS.BET Smart Vault on Solana blockchain." />
        <meta property="twitter:image" content="https://sols.bet/seo-banner.png" />

        {/* Additional SEO */}
        <meta name="keywords" content="crypto wallet, solana vault, blockchain wallet, secure storage, crypto deposit, crypto withdrawal" />
        <link rel="canonical" href="https://sols.bet/vault" />
      </Head>
      <div className="space-y-8">
        <div className="flex flex-col min-[1386px]:flex-row gap-8">
          {/* Main Content - Left Side */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Smart Vault with Assets */}
            <div className="bg-cardMedium border border-cardMedium rounded-lg p-4 sm:p-8">
              {/* Desktop layout - side by side */}
              <div className="hidden sm:flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-6 h-6 flex items-center justify-center">
                    <FontAwesomeIcon icon={faVault} className="text-white text-lg" />
                  </div>
                  <h1 className="text-xl font-bold text-white">Smart Vault</h1>
                  <p className="text-gray-400 font-bold">Total Assets: <span className="text-richGold">≈ ${totalAssets.toFixed(2)}</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setWithdrawFundsOpen(true)}
                    className="bg-darkLuxuryPurple hover:bg-darkLuxuryPurple/80 border border-cardMedium text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2"
                  >
                    <Icon name="arrow-down" size="sm" />
                    Withdraw Funds
                  </button>
                  <button
                    onClick={() => setAddFundsOpen(true)}
                    className="bg-richGold hover:brightness-110 text-black px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.4)]"
                  >
                    <Icon name="arrow-up" size="sm" className="!text-black" />
                    Add Funds
                  </button>
                </div>
              </div>

              {/* Mobile layout - stacked */}
              <div className="block sm:hidden mb-6">
                <div className="flex flex-col gap-2 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      <FontAwesomeIcon icon={faVault} className="text-white text-sm" />
                    </div>
                    <h1 className="text-lg font-bold text-white">Smart Vault</h1>
                  </div>
                  <p className="text-gray-400 text-sm font-bold">Total Assets: <span className="text-richGold">≈ ${totalAssets.toFixed(2)}</span></p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setAddFundsOpen(true)}
                    className="bg-richGold hover:brightness-110 text-black px-4 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,215,0,0.4)] text-sm"
                  >
                    <Icon name="arrow-up" size="sm" className="!text-black" />
                    Add Funds
                  </button>
                  <button
                    onClick={() => setWithdrawFundsOpen(true)}
                    className="bg-darkLuxuryPurple hover:bg-darkLuxuryPurple/80 border border-cardMedium text-white px-4 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm"
                  >
                    <Icon name="arrow-down" size="sm" />
                    Withdraw Funds
                  </button>
                </div>
              </div>
              {/* Horizontally Scrollable Table */}
              <div className="overflow-x-auto">
                <div className="min-w-[490px]">
                  {/* Table Header */}
                  <div className="flex items-center px-6 py-3 text-gray-400 text-xs font-medium uppercase tracking-wider border-b border-cardMedium">
                    <div className="w-20 min-w-[100px] lg:w-1/4 lg:min-w-[120px] text-left">Asset</div>
                    <div className="w-32 min-w-[120px] lg:w-1/4 lg:min-w-[140px] text-left">Value (USD)</div>
                    <div className="w-32 min-w-[120px] lg:w-1/4 lg:min-w-[140px] text-left">Amount</div>
                    <div className="flex-1 min-w-[150px] lg:w-1/4 lg:min-w-[200px] text-left">Address</div>
                  </div>

                  {/* Table Row */}
                  <div className="bg-darkLuxuryPurple rounded-lg my-2">
                    <div className="flex items-center px-6 py-4 hover:bg-darkLuxuryPurple/80 transition-colors duration-200 group rounded-lg">
                      {/* Asset */}
                      <div className="flex items-center gap-3 overflow-hidden w-20 min-w-[100px] lg:w-1/4 lg:min-w-[120px]">
                        <div className="relative">
                          <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                            <Image src="/sol-logo.svg" alt="SOL" width={12} height={12} className="w-3 h-3" />
                          </span>
                          <div className="absolute -inset-0.5 bg-gradient-to-r from-richGold/20 to-richGold/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 -z-10"></div>
                        </div>
                        <span className="text-sm text-white font-medium">SOL</span>
                      </div>

                      {/* Value (USD) */}
                      <div className="text-sm text-white font-semibold w-32 min-w-[120px] lg:w-1/4 lg:min-w-[140px]">
                        ${vaultBalanceUsd.toFixed(2)}
                      </div>

                      {/* Amount */}
                      <div className="text-sm text-white font-semibold w-32 min-w-[120px] lg:w-1/4 lg:min-w-[140px]">
                        {vaultBalanceSol.toFixed(4)} SOL
                      </div>

                      {/* Address */}
                      <div className="text-sm text-richGold font-mono flex-1 min-w-[150px] lg:w-1/4 lg:min-w-[200px]">
                        {vaultAddress ? (
                          <a 
                            href={`https://solscan.io/account/${vaultAddress}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-richGold hover:text-richGold/80 transition-colors font-medium"
                          >
                            {formatVaultAddress(vaultAddress)}
                          </a>
                        ) : connected ? "Loading..." : "Not connected"}
                      </div>
                    </div>
                  </div>

                  {/* Empty State */}
                  {!connected && (
                    <div className="text-center py-8">
                      <p className="text-gray-400 mb-4">Connect your wallet to view your vault assets</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Transactions Section */}
            <div className="bg-cardMedium border border-cardMedium rounded-lg p-6 sm:p-8">
              <div className="mb-6">
                <div className="flex items-center gap-3 sm:gap-4 mb-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
                    <FontAwesomeIcon icon={faArrowRightArrowLeft} className="text-white text-sm sm:text-lg" />
                  </div>
                  <h2 className="text-xl font-bold text-white">Transactions</h2>
                </div>
              </div>

              <div className="mb-4">
                {/* Table Header */}
                <div className="hidden sm:grid grid-cols-3 gap-4 text-gray-400 text-sm font-medium mb-3 px-4">
                  <div>Date</div>
                  <div>Amount</div>
                  <div>Txid</div>
                </div>

                {/* Transaction List */}
                <div className="space-y-2">
                  {transactionsLoading ? (
                    <div className="text-center py-8">
                      <p className="text-gray-400">Loading transactions...</p>
                    </div>
                  ) : transactionsError ? (
                    <div className="text-center py-8">
                      <p className="text-red-400">Error: {transactionsError}</p>
                    </div>
                  ) : apiTransactions.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-400">No transactions found</p>
                    </div>
                  ) : (
                    apiTransactions.map((transaction: any, index: number) => {
                      // Format date for display
                      const formattedDate = new Date(transaction.date).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                      });

                      return (
                    <div key={index} className="bg-darkLuxuryPurple rounded-lg p-4 hover:bg-darkLuxuryPurple/80 transition-colors">
                      <div className="flex flex-col sm:grid sm:grid-cols-3 gap-2 sm:gap-4 sm:items-center">
                        {/* Date */}
                        <div className="text-gray-300 text-sm">
                          <span className="sm:hidden text-gray-500 text-sm mr-2">Date:</span>
                          {formattedDate}
                        </div>
                        
                        {/* Amount */}
                        <div className="flex items-center gap-2">
                          <span className="sm:hidden text-gray-500 text-sm">Amount:</span>
                          <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                            <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                          </span>
                          <span className={`font-medium text-sm ${transaction.type === 'deposit' ? 'text-richGold' : 'text-red-400'}`}>
                            {transaction.type === 'deposit' ? '+' : (transaction.type === 'withdrawal' || transaction.type === 'withdraw') ? '' : ''}{transaction.amount.toFixed(4)}
                          </span>
                        </div>
                        
                        {/* Txid */}
                        <div className="flex items-center gap-2">
                          <span className="sm:hidden text-gray-500 text-sm">Txid:</span>
                          <a 
                            href={`https://solscan.io/tx/${transaction.signature}${process.env.NEXT_PUBLIC_RPC_ENDPOINT?.includes('devnet') ? '?cluster=devnet' : ''}`}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-richGold hover:text-richGold/80 transition-colors font-mono font-medium text-sm flex items-center gap-1"
                          >
                            <FontAwesomeIcon icon={faLink} className="text-richGold text-xs" />
                            {transaction.txid}
                          </a>
                        </div>
                      </div>
                    </div>
                      );
                    })
                  )}
                </div>

                {/* Pagination Controls */}
                {(() => {
                  const totalPages = Math.ceil(totalTransactions / ITEMS_PER_PAGE);
                  
                  if (totalPages <= 1 || transactionsLoading) return null;
                  
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-6 pt-4image.png">
                      <div className="text-xs sm:text-sm text-gray-400 text-center sm:text-left">
                        Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, totalTransactions)} of {totalTransactions} transactions
                      </div>
                      
                      <div className="flex items-center justify-center gap-1 sm:gap-2">
                        <button
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-darkLuxuryPurple text-white rounded-lg hover:bg-darkLuxuryPurple/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        
                        <div className="flex items-center gap-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setCurrentPage(page)}
                              className={`w-6 h-6 sm:w-8 sm:h-8 text-xs sm:text-sm rounded-lg transition-colors ${
                                page === currentPage
                                  ? 'bg-richGold text-black font-medium'
                                  : 'bg-darkLuxuryPurple text-white hover:bg-darkLuxuryPurple/80'
                              }`}
                            >
                              {page}
                            </button>
                          ))}
                        </div>
                        
                        <button
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-darkLuxuryPurple text-white rounded-lg hover:bg-darkLuxuryPurple/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* How it Works Section */}
            <div className="bg-cardMedium border border-cardMedium rounded-lg p-8">
              <div className="mb-6">
                <div className="flex items-center gap-3 sm:gap-4 mb-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
                    <FontAwesomeIcon icon={faCircleQuestion} className="text-white text-sm sm:text-lg" />
                  </div>
                  <h2 className="text-xl font-bold text-white">How it Works</h2>
                </div>
              </div>

              <p className="text-gray-300 mb-8 leading-relaxed">
                Experience true ownership with our non-custodial vault system that ensures complete control over your assets without requiring registration or identity verification—all operations are secured by blockchain technology. Built specifically for gaming on advanced blockchain infrastructure, we provide verifiable randomness, immediate on-chain payouts, and complete transparency with our publicly auditable treasury.
              </p>

                             <div className="flex gap-8 items-center">
                 {/* Left Side - All Bullet Points */}
                 <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                   {/* Left Column */}
                   <div className="space-y-6">
                     {[
                       "Solana-based",
                       "Non-custodial",
                       "No KYC needed",
                       "100% secure and transparent"
                     ].map((text, index) => (
                       <div key={index} className="flex items-center gap-3">
                         <div className="w-6 h-6 flex items-center justify-center">
                           <FontAwesomeIcon icon={faCheck} className="text-richGold text-sm" />
                         </div>
                         <span className="text-white">{text}</span>
                       </div>
                     ))}
                   </div>

                   {/* Right Column */}
                   <div className="space-y-6">
                     {[
                       "Provably fair games",
                       "Payouts settled on-chain",
                       "Instant payouts",
                       "Reputable game providers"
                     ].map((text, index) => (
                       <div key={index} className="flex items-center gap-3">
                         <div className="w-6 h-6 flex items-center justify-center">
                           <FontAwesomeIcon icon={faCheck} className="text-richGold text-sm" />
                         </div>
                         <span className="text-white">{text}</span>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Right Side - Image */}
                 <div className="hidden lg:block flex-shrink-0">
                   <img 
                     src="/golden-vault.png" 
                     alt="Smart Vault" 
                     className="w-48 h-48 object-contain"
                   />
          </div>
        </div>
      </div>

            {/* FAQ Section */}
            <div id="faq" className="bg-cardMedium border border-cardMedium rounded-lg p-8">
              <div className="mb-6">
                <div className="flex items-center gap-3 sm:gap-4 mb-2">
                  <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center">
                    <FontAwesomeIcon icon={faCircleQuestion} className="text-white text-sm sm:text-lg" />
                  </div>
                  <h2 className="text-xl font-bold text-white">FAQ</h2>
                </div>
              </div>

              <div className="space-y-4">
                {faqItems.map((item, index) => (
                  <div key={index} className="border-b border-cardMedium last:border-b-0 pb-4 last:pb-0">
                    <button
                      onClick={() => toggleFaqItem(index)}
                      className="w-full flex items-center justify-between text-left py-2 text-white hover:text-richGold transition-colors"
                    >
                      <span className="font-medium">{item.question}</span>
                      {openFaqItems.includes(index) ? (
                        <ChevronUpIcon className="w-5 h-5 text-white" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-white" />
                      )}
                    </button>
                    {openFaqItems.includes(index) && (
                      <div className="mt-3 text-gray-300 text-sm leading-relaxed">
                        {item.answer}
              </div>
                    )}
            </div>
          ))}
        </div>
      </div>
          </div>

          {/* Sidebar - Right Side */}
          <div className="space-y-6 min-[1386px]:w-72 min-[1386px]:flex-shrink-0">
                         {/* Wallet Info */}
             <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
               <div className="flex items-center gap-4 mb-6">
                 <img 
                   src="/phantom-wallet.svg" 
                   alt="Phantom Wallet" 
                   className="w-12 h-12"
                 />
                 <div className="flex-1">
                   <h3 className="text-white font-bold">Phantom Wallet</h3>
                   <p className="text-gray-400 text-sm">
                     {connected && publicKey ? formatVaultAddress(publicKey.toBase58()) : "Not connected"}
                   </p>
                 </div>
               </div>

              <div className="space-y-3">
                {/* Wallet Balance */}
                <div className="bg-darkLuxuryPurple rounded-lg p-4 relative">
                  <div className="mb-1">
                    <span className="text-gray-400 text-sm">Wallet Balance</span>
                  </div>
                  <div className="text-white font-bold text-lg">
                    {connected ? 
                      `$${walletBalances.reduce((total, tokenBalance) => {
                        const usdValue = tokenBalance.symbol === 'SOL' 
                          ? tokenBalance.balance * solPrice 
                          : tokenBalance.balance; // USDC/USDT are ~$1
                        return total + usdValue;
                      }, 0).toFixed(2)}` 
                      : "$0.00"
                    }
                  </div>
                  <button 
                    className="absolute top-1/2 right-4 transform -translate-y-1/2 w-4 h-4 flex items-center justify-center hover:text-gray-300 transition-colors"
                    onMouseEnter={() => setShowWalletTooltip(true)}
                    onMouseLeave={() => setShowWalletTooltip(false)}
                  >
                    <FontAwesomeIcon icon={faCircleInfo} className="text-gray-400 text-sm" />
                  </button>
                  {showWalletTooltip && (
                    <div className="absolute top-1/3 right-3 transform -translate-y-full -translate-y-2 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg z-10 w-64">
                      <div className="absolute top-full right-3 transform -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                      Combined USD worth of all compatible digital assets currently held in your linked wallet.
                    </div>
                  )}
                </div>

                {/* Smart Vault Balance */}
                <div className="bg-darkLuxuryPurple rounded-lg p-4 relative">
                  <div className="mb-1">
                    <span className="text-gray-400 text-sm">Smart Vault Balance</span>
                  </div>
                  <div className="text-white font-bold text-lg">${vaultBalanceUsd.toFixed(2)}</div>
                  <button 
                    className="absolute top-1/2 right-4 transform -translate-y-1/2 w-4 h-4 flex items-center justify-center hover:text-gray-300 transition-colors"
                    onMouseEnter={() => setShowVaultTooltip(true)}
                    onMouseLeave={() => setShowVaultTooltip(false)}
                  >
                    <FontAwesomeIcon icon={faCircleInfo} className="text-gray-400 text-sm" />
                  </button>
                  {showVaultTooltip && (
                    <div className="absolute top-1/3 right-3 transform -translate-y-full -translate-y-2 bg-gray-800 text-white text-xs rounded-lg p-3 shadow-lg z-10 w-64">
                      <div className="absolute top-full right-3 transform -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                      Aggregate USD value of all compatible digital assets stored within your secure vault.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Available in your wallet */}
            <div className="bg-cardMedium border border-cardMedium rounded-lg p-6">
              <h3 className="text-white font-bold mb-4">Available in your wallet</h3>
              
              <div className="space-y-4">
                {connected ? (
                  walletLoading ? (
                    <div className="text-gray-400 text-center py-4">Loading balances...</div>
                  ) : (
                    walletBalances.map((tokenBalance) => {
                      const usdValue = tokenBalance.symbol === 'SOL' 
                        ? tokenBalance.balance * solPrice 
                        : tokenBalance.balance; // USDC/USDT are ~$1
                      
                      return (
                        <div key={tokenBalance.symbol} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {tokenBalance.symbol === 'SOL' ? (
                              <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                                <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                              </span>
                            ) : tokenBalance.symbol === 'USDC' ? (
                              <img src="/usdc-logo.svg" alt="USDC" className="w-5 h-5" />
                            ) : (
                              <img src="/usdt-logo.svg" alt="USDT" className="w-5 h-5" />
                            )}
                            <span className="text-white">{tokenBalance.symbol}</span>
                          </div>
                          <div className="text-right">
                            <div className="text-white">
                              {tokenBalance.balance.toFixed(tokenBalance.symbol === 'SOL' ? 4 : 2)}
                            </div>
                            <div className="text-gray-400 text-sm">
                              ${usdValue.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  <div className="text-gray-400 text-center py-4">Connect wallet to view balances</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <AddFundsModal open={addFundsOpen} onOpenChange={setAddFundsOpen} />
      <WithdrawFundsModal open={withdrawFundsOpen} onOpenChange={setWithdrawFundsOpen} />
    </>
  );
} 