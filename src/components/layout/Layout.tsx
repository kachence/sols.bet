import React from 'react';
import dynamic from 'next/dynamic';
import Footer from './Footer';

interface LayoutProps {
  children: React.ReactNode;
}

const Header = dynamic(() => import('./Header'), { ssr: false });

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-cardDark flex flex-col relative">
      {/* Header */}
      <Header />
      
      {/* Main Content */}
      <main className="flex-1 pb-8 overflow-visible relative z-10">
        <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 overflow-visible">
          {children}
        </div>
      </main>
      
      {/* Footer */}
      <Footer />
    </div>
  );
} 