import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useUserSignup } from "@/hooks/useUserSignup";
import type { WalletName } from "@solana/wallet-adapter-base";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function ConnectWalletModal({ open, onOpenChange }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [step, setStep] = useState<'tos' | 'wallet' | 'sign'>('tos');
  const [initiatedSign, setInitiatedSign] = useState(false);

  const { connected, wallets, select, connect, connecting, publicKey } = useWallet();

  const { signup, loading: signing, signedIn } = useUserSignup();

  const handleConnectClick = () => {
    if (!accepted) return;
    setStep('wallet');
  };

  const handleSelectWallet = async (walletName: WalletName) => {
    try {
      setStep('sign');
      select(walletName);
      await connect();
    } catch (err) {
      console.error('wallet connect error', err);
    }
  };

  useEffect(() => {
    if (step === 'wallet' && connected) {
      setStep('sign');
    }
  }, [step, connected]);

  useEffect(() => {
    if (step === 'sign' && connected && !initiatedSign && !signedIn && !signing) {
      setInitiatedSign(true);
      (async () => {
        const ok = await signup();
        setInitiatedSign(false);
        if (ok) {
          onOpenChange(false);
          setTimeout(() => setStep('tos'), 300);
        }
      })();
    }
  }, [step, connected, initiatedSign, signing, signup, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-[#0a0420]/50" />
        <DialogContent className="border-0 w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl bg-[#1a0d3a] text-white flex flex-col sm:flex-row p-0 overflow-hidden rounded-2xl">
          {/* Left illustration */}
          <div className="hidden sm:flex flex-1 bg-[#1a0d3a] p-8 pr-0 flex-col items-center justify-center">
            <Image src="/sols-bet-logo.png" alt="Illustration" width={400} height={400} className="object-contain" priority />
          </div>

          {/* Right content */}
          <div className="flex-[1.2] p-8 flex flex-col justify-center">
            <p className="hidden sm:block text-sm uppercase text-richGold mb-1">Step 1 of 3</p>
            {step === 'tos' && (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">CONNECT WALLET</DialogTitle>
                </DialogHeader>
                <div className="space-y-6 mt-6">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded-sm border border-gray-600 bg-[#1a0d3a] accent-richGold focus:outline-none focus:ring-0"
                      style={{
                        accentColor: '#FFD700'
                      }}
                    />
                    <span>I confirm that I have read, understood, and that I accept the <a className="underline text-richGold" href="/tos" target="_blank">Terms of Service</a></span>
                  </label>
                  <Button
                    disabled={!accepted}
                    onClick={handleConnectClick}
                    className="w-full bg-richGold text-black hover:brightness-110 shadow-[0_0_20px_rgba(255,215,0,0.4)] font-semibold transition-all duration-200"
                  >
                    Connect
                  </Button>
                </div>
              </>
            )}

            {step === 'wallet' && (
              <div className="py-4">
                <p className="text-xl font-semibold font-heading mb-6 text-center">Connect a wallet on Solana</p>
                <div className="space-y-3">
                  {wallets.map((w) => (
                    <button
                      key={w.adapter.name}
                      onClick={() => handleSelectWallet(w.adapter.name)}
                      className="w-full flex items-center justify-between bg-[#1a0d3a] px-4 py-3 rounded-lg hover:bg-[#2a1d4a]"
                    >
                      <div className="flex items-center gap-3">
                        <img src={w.adapter.icon} alt={w.adapter.name} className="w-6 h-6" />
                        <span>{w.adapter.name}</span>
                      </div>
                      {connecting && w.readyState === 'Installed' && (
                        <span className="text-sm text-gray-400">Connecting…</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'sign' && (
              <div className="py-4 flex flex-col items-center justify-center space-y-6">
                <h2 className="text-xl font-semibold font-heading text-center">
                  LOGIN WITH {publicKey?.toBase58().slice(0,4)}...{publicKey?.toBase58().slice(-4)}
                </h2>
                <p className="text-gray-300 text-sm max-w-sm text-center">
                  A <b>Sign Message</b> window has appeared in Phantom. Approve it to prove ownership of your wallet and stay logged-in for the next&nbsp;<b>7&nbsp;days</b> (no gas or transaction cost).
                </p>

                <Button
                  disabled
                  className="w-full bg-richGold/40 text-black px-4 py-2 rounded-lg font-semibold flex items-center justify-center gap-2 cursor-default"
                >
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Logging in…
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
} 