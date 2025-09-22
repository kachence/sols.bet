// src/pages/_app.tsx
import "@/styles/globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import "nprogress/nprogress.css";
import '@fortawesome/fontawesome-svg-core/styles.css';
import { config as faConfig } from '@fortawesome/fontawesome-svg-core';
faConfig.autoAddCss = false;

import {
  BASE_SEO_CONFIG,
} from "../constants";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo, useEffect } from "react";
import { useRouter } from "next/router";
import NProgress from "nprogress";
import dynamic from "next/dynamic";
import Layout from "@/components/layout/Layout";
import { ThemeProvider } from "@/components/ui";
import { Toaster } from "@/components/ui/sonner";
import { DefaultSeo } from "next-seo";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { DevnetBanner } from "@/components/common";
import type { AppProps } from "next/app";

// Configure NProgress
NProgress.configure({ 
  showSpinner: false,
  minimum: 0.3,
  easing: 'ease',
  speed: 800,
});

// Dynamically load the animated background only on the client to avoid
// generating random values during server-side rendering which leads to
// React hydration mismatches.
const ParticlesBackground = dynamic(
  () => import("@/components/common").then((mod) => mod.ParticlesBackground),
  { ssr: false },
);

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Setup NProgress for route changes
  useEffect(() => {
    const handleStart = () => NProgress.start();
    const handleStop = () => NProgress.done();

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeComplete', handleStop);
    router.events.on('routeChangeError', handleStop);

    return () => {
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleStop);
      router.events.off('routeChangeError', handleStop);
    };
  }, [router]);

  const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 'https://api.devnet.solana.com';

  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider
      endpoint={RPC_ENDPOINT}
      config={{ commitment: "processed" }}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <WalletProvider autoConnect wallets={wallets}>
          <WalletModalProvider>
                    <DefaultSeo {...BASE_SEO_CONFIG} />
                    <ParticlesBackground />
                    <DevnetBanner />
                    <Layout>
                      <Component {...pageProps} />
                    </Layout>
                    <Toaster position="top-center" />
                    <Analytics />
                    <SpeedInsights />
          </WalletModalProvider>
        </WalletProvider>
      </ThemeProvider>
    </ConnectionProvider>
  );
}

export default MyApp;
