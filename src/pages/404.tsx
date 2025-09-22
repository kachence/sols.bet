// src/pages/404.tsx

import { BASE_SEO_CONFIG } from "../constants";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { NextSeo } from "next-seo";

export default function Custom404() {
  return (
    <>
      <NextSeo title={`${BASE_SEO_CONFIG.defaultTitle} | 404`} />
      <div className="bg-gradient-to-br from-darkLuxuryPurple via-black to-darkLuxuryPurple min-h-[80vh] relative mx-auto flex flex-col justify-center items-center text-center">
        <div className="flex flex-col justify-center items-center mx-auto px-10 py-20 rounded-xl bg-black/50 backdrop-blur-sm border border-richGold/20 shadow-2xl max-w-md">
          {/* 404 Number */}
          <div className="text-8xl md:text-9xl font-bold text-richGold mb-4 opacity-80">
            404
          </div>
          
          {/* Error Message */}
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Page Not Found
          </h1>
          <p className="text-gray-300 mb-8 text-lg">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          {/* Action Button */}
            <Link href="/" passHref>
            <Button className="bg-richGold hover:bg-richGold/90 text-black font-bold px-8 py-3 text-lg shadow-[0_0_20px_rgba(255,199,0,0.3)] hover:shadow-[0_0_30px_rgba(255,199,0,0.5)] transition-all duration-300">
              Return Home
              </Button>
            </Link>
        </div>
      </div>
    </>
  );
}
