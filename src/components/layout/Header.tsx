"use client"

import { ChevronDown, LogOut, Menu } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import React, { useCallback, useState } from "react"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUser, faVault, faRightFromBracket, faWallet, faCoins, faLemon, faDiamond } from '@fortawesome/free-solid-svg-icons'
import { library } from '@fortawesome/fontawesome-svg-core'

// Add the wallet icon to the library
library.add(faWallet);

import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"
import { useWallet } from "@solana/wallet-adapter-react"
import { useWalletModal } from "@solana/wallet-adapter-react-ui"
import { useRouter } from "next/router"
import { Icon } from "@/components/common"
import { useTokenBalance } from "@/hooks/useTokenBalance"
import { useUserSignup } from "@/hooks/useUserSignup"
import ConnectWalletModal from "@/components/common/ConnectWalletModal"
import SmartVaultModal from "@/components/common/SmartVaultModal"
import AddFundsModal from "@/components/common/AddFundsModal"
import ProfileModal from "@/components/common/ProfileModal"
import { useSmartVault } from "@/hooks/useSmartVault"

const TokenValue = ({ amount }: { amount: number }) => (
  <span>{typeof amount === "number" ? (amount / 1e9).toFixed(4) : amount}</span>
);
const useCurrentPool = () => ({}) as any;
const useCurrentToken = () => ({ symbol: "SOL", image: "/token.png", decimals: 9 });
const useReferral = () => ({
  referrerAddress: null,
  isOnChain: false,
  referralStatus: null,
  referralLink: "",
  copyLinkToClipboard: () => {},
  clearCache: () => {},
});

export default function Header() {
  const router = useRouter()
  const { connected, publicKey, disconnect, wallet, connecting, connect } = useWallet()
  const walletModal = useWalletModal()
  const pool = useCurrentPool()
  const token = useCurrentToken()
  const balance = useTokenBalance() // Use default 30s fallback polling since Realtime handles updates
  const { referrerAddress, isOnChain, referralStatus, referralLink, copyLinkToClipboard, clearCache } = useReferral()

  const { signedIn, ready: signupReady, signup, loading: signupLoading, logout } = useUserSignup();
  const { needsVault, activateVault, loading: vaultLoading } = useSmartVault();

  const [showBonusHelp, setShowBonusHelp] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [connectModalOpen, setConnectModalOpen] = useState(false)
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [addFundsModalOpen, setAddFundsModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showMobileTooltip, setShowMobileTooltip] = useState(false);

  // Close dropdown and mobile tooltip when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserDropdown) {
        const target = event.target as Element
        if (!target.closest('.user-dropdown-container')) {
          setShowUserDropdown(false)
        }
      }
      if (showMobileTooltip) {
        const target = event.target as Element
        if (!target.closest('.mobile-status-container')) {
          setShowMobileTooltip(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserDropdown, showMobileTooltip])

  const truncateString = (s: string, startLen = 4, endLen = startLen) =>
    s ? `${s.slice(0, startLen)}...${s.slice(-endLen)}` : ""

  const handleConnect = useCallback(() => {
    setConnectModalOpen(true)
  }, [])

  // Mobile Status Indicator Component with touch functionality
  const MobileStatusIndicator = () => (
    <div className="sm:hidden relative mobile-status-container">
      <button
        onClick={() => setShowMobileTooltip(!showMobileTooltip)}
        className="w-2.5 h-2.5 rounded-full bg-richGold animate-pulse"
      />
      
      {/* Mobile Tooltip */}
      {showMobileTooltip && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 z-50">
          {/* Arrow pointer */}
          <div className="w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-gray-800 mx-auto mb-1"></div>
          <div className="bg-gray-800 text-white rounded-lg p-3 min-w-48 text-sm shadow-lg">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Transactions:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-richGold"></div>
                  <span className="text-richGold font-medium">Stable</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Settlements:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-richGold"></div>
                  <span className="text-richGold font-medium">Stable</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-300">Solana RPC:</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-richGold"></div>
                  <span className="text-richGold font-medium">Connected</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // Helper function to determine if route is active
  const isActiveRoute = (path: string) => {
    if (path === '/' && router.pathname === '/') return true;
    if (path !== '/' && router.pathname.startsWith(path)) return true;
    return false;
  }

  // open vault modal when needed
  React.useEffect(() => {
    if (!connectModalOpen && signedIn && needsVault) {
      setVaultModalOpen(true);
    }
  }, [connectModalOpen, signedIn, needsVault]);

  return (
    <>
      {/* Header with same container width as content */}
      <header className="relative z-20">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header wrapper matching Live Wins styling */}
          <div className="bg-cardMedium mt-4 sm:mt-8 border border-cardMedium rounded-lg px-4 py-3 sm:px-6 sm:py-4 mb-6 sm:mb-8 relative z-20">
                      {/* Mobile Layout */}
            <div className="md:hidden flex items-center justify-between">
              {/* Mobile Left: Logo - Compact for small screens */}
              <div className="flex items-center min-w-0 flex-shrink">
                <Link href="/">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    <Image 
                      src="/sols-bet-logo.png" 
                      alt="sols.bet Logo" 
                      width={40}
                      height={40}
                      className="w-6 h-6 object-contain flex-shrink-0"
                      priority
                      loading="eager"
                    />
                    <span className="text-xl font-bold font-heading logo text-white truncate" style={{ lineHeight: '1', display: 'flex', alignItems: 'center', height: '100%' }}>SOLS.BET</span>
                  </div>
                </Link>
              </div>

              {/* Mobile Right: All elements in single horizontal row */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Social Icons - Hidden on very small screens to save space */}
                <div className="hidden min-[430px]:flex items-center gap-1.5">
                  <a 
                    href="https://x.com/solsbet" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-richGold transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                  <a 
                    href="https://discord.gg/solsbet" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-richGold transition-colors"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
                    </svg>
                  </a>
                </div>

              {connected && signedIn && (
                <>
                  <MobileStatusIndicator />
                  {!needsVault && (
                    <Link href="/vault">
                      <div className="bg-darkLuxuryPurple border border-cardMedium rounded-xl px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-darkLuxuryPurple/80 transition-colors duration-200">
                        <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                          <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                        </span>
                        <span className="text-white font-semibold text-sm">
                          {balance.balanceSol.toFixed(4)}
                        </span>
                      </div>
                    </Link>
                  )}
                </>
              )}

              {connected && signedIn ? (
                <div className="relative user-dropdown-container z-50 flex items-center">
                  <button
                    className="flex items-center bg-darkLuxuryPurple hover:bg-darkLuxuryPurple border border-cardMedium text-white px-1.5 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-0 flex-shrink-0 mr-1.5"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                  >
                    <div className="w-5 h-5 rounded-full overflow-hidden">
                      <Image src="/avatar.png" alt="User Avatar" width={20} height={20} className="w-full h-full object-cover" priority loading="eager" />
                    </div>
                  </button>

                  {/* Mobile Dropdown menu */}
                  {showUserDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-cardMedium rounded-xl shadow-dropdown z-50 overflow-hidden">
                      <div className="p-2">
                        <Link
                          href="/vault"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer">
                            <div className="w-5 h-5 flex items-center justify-center">
                              <FontAwesomeIcon icon={faVault} className="text-gray-400" />
                            </div>
                            <span className="font-medium">Smart Vault</span>
                          </div>
                        </Link>
                        
                        <button
                          onClick={() => {
                            setProfileModalOpen(true);
                            setShowUserDropdown(false);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer w-full text-left"
                        >
                          <div className="w-5 h-5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faUser} className="text-gray-400" />
                          </div>
                          <span className="font-medium">Profile</span>
                        </button>

                        <Link
                          href="/slots"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer">
                            <div className="w-5 h-5 flex items-center justify-center">
                              <FontAwesomeIcon icon={faLemon} className="text-gray-400" />
                            </div>
                            <span className="font-medium">Slots</span>
                          </div>
                        </Link>

                        <Link
                          href="/classics"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer">
                            <div className="w-5 h-5 flex items-center justify-center">
                              <FontAwesomeIcon icon={faDiamond} className="text-gray-400" />
                            </div>
                            <span className="font-medium">Classics</span>
                          </div>
                        </Link>

                        <Link
                          href="/token"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer">
                            <div className="w-5 h-5 flex items-center justify-center">
                              <FontAwesomeIcon icon={faCoins} className="text-gray-400" />
                            </div>
                            <span className="font-medium">Token</span>
                          </div>
                        </Link>

                        <button
                          onClick={() => {
                            disconnect();
                            logout();
                            setShowUserDropdown(false)
                          }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-white hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 text-left"
                        >
                          <div className="w-5 h-5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faRightFromBracket} className="text-gray-400" />
                          </div>
                          <span className="font-medium">Logout</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {needsVault && signedIn && (
                    <button
                      onClick={() => setVaultModalOpen(true)}
                      className="bg-richGold hover:brightness-110 text-darkLuxuryPurple px-1.5 py-1.5 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-0.5 flex-shrink-0 min-w-fit"
                    >
                      <FontAwesomeIcon icon={faVault} className="!text-darkLuxuryPurple text-xs" />
                      <span className="text-xs">Activate</span>
                    </button>
                  )}
                </div>
              ) : (
                <button 
                  onClick={handleConnect}
                  className="bg-richGold hover:brightness-110 text-darkLuxuryPurple px-2 py-1.5 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-1 flex-shrink-0"
                >
                  <FontAwesomeIcon icon={faWallet} className="!text-darkLuxuryPurple text-xs" />
                  <span className="text-xs text-darkLuxuryPurple">Connect</span>
                </button>
              )}
            </div>
          </div>

          {/* Desktop Layout */}
          <div className={`hidden md:grid items-center ${connected && signedIn && !needsVault ? 'grid-cols-3' : 'grid-cols-2'}`}>
            
            {/* Left Section: Logo + Menu */}
            <div className="flex items-center gap-4 lg:gap-8 justify-self-start">
              {/* Logo and Brand */}
              <Link href="/">
                <div className="flex items-center gap-2 cursor-pointer">
                  <Image 
                    src="/sols-bet-logo.png" 
                    alt="sols.bet Logo" 
                    width={40}
                    height={40}
                    className="w-6 h-6 sm:w-10 sm:h-10 object-contain"
                    priority
                    loading="eager"
                  />
                  <span className="sm:block text-xl sm:text-4xl font-bold font-heading logo text-white" style={{ lineHeight: '1', display: 'flex', alignItems: 'center', height: '100%' }}>SOLS.BET</span>
                </div>
              </Link>

              {/* Navigation Menu - Desktop */}
              <nav className="hidden lg:flex items-center gap-8">
                <Link 
                  href="/slots" 
                  className="text-base font-bold no-underline transition-colors duration-200 text-white hover:text-richGold"
                >
                  Slots
                </Link>
                <Link 
                  href="/classics" 
                  className="text-base font-bold no-underline transition-colors duration-200 text-white hover:text-richGold"
                >
                  Classics
                </Link>
                <Link 
                  href="/token" 
                  className="text-base font-bold no-underline transition-colors duration-200 text-white hover:text-richGold"
                >
                  Token
                </Link>
              </nav>
            </div>

            {/* Center Section: Balance Display - Desktop Only */}
            {connected && signedIn && !needsVault && (
              <div className="flex items-center justify-center">
                <Link href="/vault">
                  <div className="bg-darkLuxuryPurple border border-cardMedium rounded-lg px-3 py-2 lg:px-4 lg:py-2 flex items-center gap-2 cursor-pointer hover:bg-darkLuxuryPurple/80 transition-colors duration-200">
                    <span className="w-5 h-5 bg-black rounded-full flex items-center justify-center">
                      <img src="/sol-logo.svg" alt="SOL" className="w-3 h-3" />
                    </span>
                    <span className="text-white font-semibold text-sm lg:text-base">
                      {balance.balanceSol.toFixed(4)} SOL
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* Right Section: Desktop Wallet + Status */}
            <div className="flex items-center gap-2 justify-self-end">
              {/* Social Icons - Hidden on screens under 450px */}
              <div className="hidden min-[450px]:flex items-center gap-3 mr-2">
                <a 
                  href="https://x.com/solsbet" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-richGold transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
                <a 
                  href="https://discord.gg/solsbet" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-richGold transition-colors"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
                  </svg>
                </a>
              </div>

              {connected && signedIn ? (
                <div className="relative user-dropdown-container z-50 flex items-center gap-2">
                  {/* User dropdown button */}
                  <button
                    className="flex items-center gap-2 bg-darkLuxuryPurple hover:bg-darkLuxuryPurple border border-cardMedium text-white px-2 py-2 rounded-xl text-sm transition-colors focus:outline-none focus:ring-0"
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                  >
                    <div className="w-5 h-5 sm:w-8 sm:h-8 rounded-full overflow-hidden">
                      <Image src="/avatar.png" alt="User Avatar" width={32} height={32} className="w-full h-full object-cover" priority loading="eager" />
                    </div>
                    <span className="hidden sm:block font-medium text-sm lg:text-base">
                      {truncateString(publicKey?.toString() || "", 4, 4)}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                  </button>

                  {/* Dropdown menu */}
                  {showUserDropdown && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-cardMedium rounded-xl shadow-dropdown z-50 overflow-hidden">
                      <div className="p-2">
                        <Link
                          href="/vault"
                          onClick={() => setShowUserDropdown(false)}
                        >
                          <div className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer">
                            <div className="w-5 h-5 flex items-center justify-center">
                              <FontAwesomeIcon icon={faVault} className="text-gray-400" />
                            </div>
                            <span className="font-medium">Smart Vault</span>
                          </div>
                        </Link>
                        
                        <button
                          onClick={() => {
                            setProfileModalOpen(true);
                            setShowUserDropdown(false);
                          }}
                          className="flex items-center gap-3 px-3 py-2.5 text-gray-300 hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 cursor-pointer w-full text-left"
                        >
                          <div className="w-5 h-5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faUser} className="text-gray-400" />
                          </div>
                          <span className="font-medium">Profile</span>
                        </button>

                        <button
                          onClick={() => {
                            disconnect();
                            logout();
                            setShowUserDropdown(false)
                          }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-white hover:bg-darkLuxuryPurple hover:text-white rounded-lg transition-all duration-200 text-left"
                        >
                          <div className="w-5 h-5 flex items-center justify-center">
                            <FontAwesomeIcon icon={faRightFromBracket} className="text-gray-400" />
                          </div>
                          <span className="font-medium">Logout</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {needsVault && signedIn && (
                    <button
                      onClick={() => setVaultModalOpen(true)}
                      className="bg-richGold hover:brightness-110 text-darkLuxuryPurple px-3 py-3 lg:px-4 lg:py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-2 flex-shrink-0 min-w-fit"
                    >
                      <FontAwesomeIcon icon={faVault} className="!text-darkLuxuryPurple" />
                      <span className="hidden lg:block">Activate Wallet</span>
                      <span className="lg:hidden text-xs">Activate</span>
                    </button>
                  )}
                </div>
              ) : connected && !signedIn ? (
                <button 
                  onClick={handleConnect}
                  className="bg-richGold hover:brightness-110 text-darkLuxuryPurple px-3 py-2 sm:px-4 sm:py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faWallet} className="w-4 h-4 text-darkLuxuryPurple" />
                  <span className="text-xs sm:text-base">Connect</span>
                </button>
              ) : (
                // Connect Button when wallet not connected
                <button 
                  onClick={handleConnect}
                  className="bg-richGold hover:brightness-110 text-darkLuxuryPurple px-3 py-2 sm:px-4 sm:py-2 rounded-lg font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(255,215,0,0.4)] flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faWallet} className="!text-darkLuxuryPurple" />
                  <span className="text-xs sm:text-base text-darkLuxuryPurple">Connect</span>
                </button>
              )}

              {/* Desktop Status Indicator with Tooltip - Right side */}
              <div className="relative group ml-3 hidden sm:block">
                <div className="w-3 h-3 rounded-full bg-richGold animate-pulse"></div>
                
                {/* Tooltip */}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
                  <div className="bg-gray-800 text-white rounded-lg p-3 min-w-48 text-sm shadow-lg">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">Transactions:</span>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-richGold"></div>
                          <span className="text-richGold font-medium">Stable</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">Settlements:</span>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-richGold"></div>
                          <span className="text-richGold font-medium">Stable</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-300">Solana RPC:</span>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 rounded-full bg-richGold"></div>
                          <span className="text-richGold font-medium">Connected</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="fixed right-0 top-0 h-full w-80 bg-secondary border-l border-cardMedium shadow-xl">
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-6 border-b border-cardMedium">
                <h2 className="text-xl font-bold text-white">Menu</h2>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <Icon name="x" size="md" />
                </button>
              </div>
              
              <nav className="flex-1 p-6 space-y-4">
                <Link
                  href="/slots"
                  className={`block py-3 px-4 rounded-lg transition-colors ${
                    isActiveRoute('/slots') 
                      ? 'bg-cyberTeal text-cardDark font-semibold' 
                      : 'text-gray-400 hover:text-white hover:bg-cardMedium'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Slots
                </Link>
                <Link
                  href="/classics"
                  className={`block py-3 px-4 rounded-lg transition-colors ${
                    isActiveRoute('/classics') 
                      ? 'bg-cyberTeal text-cardDark font-semibold' 
                      : 'text-gray-400 hover:text-white hover:bg-cardMedium'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Classics
                </Link>
                <Link
                  href="/token"
                  className={`block py-3 px-4 rounded-lg transition-colors ${
                    isActiveRoute('/token') 
                      ? 'bg-cyberTeal text-cardDark font-semibold' 
                      : 'text-gray-400 hover:text-white hover:bg-cardMedium'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Token
                </Link>
                <Link
                  href="/vault"
                  className={`block py-3 px-4 rounded-lg transition-colors ${
                    isActiveRoute('/vault') 
                      ? 'bg-cyberTeal text-cardDark font-semibold' 
                      : 'text-gray-400 hover:text-white hover:bg-cardMedium'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Smart Vault
                </Link>
              </nav>
              
              {/* Mobile wallet section */}
              <div className="p-6 border-t border-cardMedium">
                {connected ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-secondary rounded-full overflow-hidden">
                        <Image 
                          src="/avatar.png" 
                          alt="User Avatar" 
                          width={24}
                          height={24}
                          className="w-full h-full object-cover"
                          loading="eager"
                        />
                      </div>
                      <div>
                        <p className="text-white font-medium">{truncateString(publicKey?.toString() || "", 4, 4)}</p>
                        {signedIn && !needsVault && (
                          <p className="text-sm text-gray-400">
                            {balance.balanceSol.toFixed(4)} SOL
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => {
                        disconnect();
                        logout();
                        setIsMobileMenuOpen(false)
                      }}
                      variant="destructive"
                      className="w-full"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <Button 
                    onClick={() => {
                      handleConnect()
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full bg-richGold hover:brightness-110 text-black font-semibold shadow-[0_0_20px_rgba(255,215,0,0.4)]"
                  >
                    Connect Wallet
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </header>

      {/* Modals */}
      <Dialog open={showBonusHelp} onOpenChange={setShowBonusHelp}>
        <DialogContent className="modal-content">
          <DialogHeader>
            <DialogTitle className="text-white">You have a bonus!</DialogTitle>
          </DialogHeader>
          <p className="text-gray-300">
            You have{" "}
            <b className="text-cyberTeal">
              <TokenValue amount={balance.bonusBalance} />
            </b>{" "}
            worth of free plays. This bonus will be applied automatically when you play.
          </p>
        </DialogContent>
      </Dialog>

      <ConnectWalletModal open={connectModalOpen} onOpenChange={setConnectModalOpen} />
      <SmartVaultModal
        open={vaultModalOpen}
        onOpenChange={setVaultModalOpen}
        onActivate={async () => {
          const ok = await activateVault();
          if (ok) {
            setVaultModalOpen(false);
            setAddFundsModalOpen(true);
          }
        }}
        loading={vaultLoading}
      />
      <AddFundsModal open={addFundsModalOpen} onOpenChange={setAddFundsModalOpen} />
      <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
    </>
  )
}


