import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';
import { getReferralCodeFromUrl } from '../lib/referralUtils';

export interface SignupState {
  signedIn: boolean;
  loading: boolean;
  ready: boolean;
  signup: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const STORAGE_KEY_PREFIX = 'si_exp_';
const SIGN_MESSAGE = 'Sign this message to login to sols.bet casino (valid for 7 days)';

export function useUserSignup(): SignupState {
  const { publicKey, signMessage } = useWallet();
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // helper to get local exp
  const getExp = useCallback(() => {
    if (!publicKey) return 0;
    const key = STORAGE_KEY_PREFIX + publicKey.toBase58();
    const expStr = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    return expStr ? Number(expStr) : 0;
  }, [publicKey]);

  const setExp = useCallback((exp: number) => {
    if (!publicKey) return;
    const key = STORAGE_KEY_PREFIX + publicKey.toBase58();
    localStorage.setItem(key, exp.toString());
  }, [publicKey]);

  const clearExp = useCallback(() => {
    if (!publicKey) return;
    const key = STORAGE_KEY_PREFIX + publicKey.toBase58();
    localStorage.removeItem(key);
  }, [publicKey]);

  // function to perform signup
  const signup = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) return false;
    setLoading(true);
    try {
      const msgBytes = new TextEncoder().encode(SIGN_MESSAGE);
      const signature = await signMessage(msgBytes);
      const sigBase58 = bs58.encode(signature);
      const walletAddress = publicKey.toBase58();

      // Get referral code from URL if present
      const referralCode = getReferralCodeFromUrl();
      console.log('Referral code from URL:', referralCode);

      const requestBody: any = { 
        walletAddress, 
        signature: sigBase58, 
        message: SIGN_MESSAGE 
      };

      // Add referral code if present
      if (referralCode) {
        requestBody.referralCode = referralCode;
      }

      const res = await fetch('https://casino-worker-v2.fly.dev/user-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (res.ok) {
        const expUnix = data.exp ? new Date(data.exp).getTime() : 0;
        setExp(expUnix);
        setSignedIn(true);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('userSignedIn'));
        }
        
        // Log referral success
        if (data.referral && referralCode) {
          console.log(`✅ User signed up with referral code: ${referralCode}`);
        }
        
        return true;
      } else {
        console.error('signup error', data);
      }
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setLoading(false);
    }
    return false;
  }, [publicKey, signMessage, setExp]);

  const logout = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    try {
      await fetch('https://casino-worker-v2.fly.dev/user-logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() })
      });
      clearExp();
      setSignedIn(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('userSignedOut'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [publicKey, clearExp]);

  // initial check
  useEffect(() => {
    if (!publicKey) {
      setSignedIn(false);
      setReady(true);
      return;
    }

    // reset ready until we validate
    setReady(false);

    const localExp = getExp();
    const now = Date.now();
    if (localExp && localExp > now) {
      setSignedIn(true);
      setReady(true);
    } else {
      // validate with backend (optional)
      fetch(`https://casino-worker-v2.fly.dev/user-login-status?walletAddress=${publicKey.toBase58()}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.signed_in && d.exp) {
            const expUnix = new Date(d.exp).getTime();
            setExp(expUnix);
            setSignedIn(true);
          } else {
            clearExp();
            setSignedIn(false);
          }
        })
        .catch((err) => console.error(err))
        .finally(() => setReady(true));
    }
  }, [publicKey, getExp, setExp, clearExp]);

  // Listen for global sign-in events from other hook instances
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onSignedIn = () => setSignedIn(true);
    const onSignedOut = () => setSignedIn(false);

    window.addEventListener('userSignedIn', onSignedIn);
    window.addEventListener('userSignedOut', onSignedOut);

    return () => {
      window.removeEventListener('userSignedIn', onSignedIn);
      window.removeEventListener('userSignedOut', onSignedOut);
    };
  }, []);

  return { loading, signedIn, ready, signup, logout };
} 