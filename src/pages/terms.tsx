import React from 'react';
import { NextSeo } from 'next-seo';

export default function TermsPage() {
  return (
    <>
      <NextSeo
        title="Terms of Service - SOLS.BET | Legal Terms & Conditions"
        description="Read the complete Terms of Service for SOLS.BET - comprehensive legal terms and conditions for using our decentralized blockchain casino on Solana."
        canonical="https://sols.bet/terms"
        openGraph={{
          title: "Terms of Service - SOLS.BET",
          description: "Complete Terms of Service for SOLS.BET decentralized blockchain casino on Solana.",
          url: "https://sols.bet/terms",
          images: [{
            url: "https://sols.bet/seo-banner.png",
            width: 1200,
            height: 630,
            alt: "SOLS.BET Terms of Service"
          }],
          site_name: "SOLS.BET"
        }}
        twitter={{
          cardType: "summary_large_image",
          handle: "@solsbet",
          site: "@solsbet"
        }}
        additionalMetaTags={[
          {
            name: "keywords",
            content: "terms of service, legal terms, casino terms, blockchain gambling terms, solana casino"
          }
        ]}
      />
      
      <div className="min-h-screen bg-cardMedium py-8 rounded-lg">
        <div className="max-w-4xl mx-auto px-6">
          <div className="prose prose-invert max-w-none">
              <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
              <p className="text-gray-400 mb-8">Last Updated: 06 July, 2025</p>
              
              <div className="text-gray-300 space-y-6 leading-relaxed">
                <p>
                  Welcome to sols.bet, operated by SolsBet Foundation ("we," "us," or the "Service"). These Terms of Service ("Terms") control your access to and usage of the Service, which functions on the Solana blockchain (the "Solana Network"). By utilizing the Service, you confirm that you have reviewed, comprehended, and consent to be legally bound by these Terms. Should you disagree, you must not use or access the Service.
                </p>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">1. Acceptance of Terms</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">1.1 Legal Commitment</h3>
                  <p>
                    When you access or utilize the Service, you consent to these Terms along with any additional operational guidelines, policies, and procedures we may periodically publish on the Service. These Terms are applicable to all visitors, users, and individuals who access or utilize the Service ("Users" or "you").
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">1.2 Terms Modifications</h3>
                  <p>
                    We maintain the authority to revise or amend these Terms whenever necessary. Should we make such changes, we will display the updated Terms on the Service and note the date of the most recent modification. Your ongoing use of the Service following the implementation of any revised Terms signifies your agreement to such modifications. You are responsible for regularly reviewing these Terms to stay informed of any updates.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">2. Eligibility</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">2.1 Minimum Age</h3>
                  <p>
                    You must have reached eighteen (18) years of age (or the legal age of majority in your location, whichever is greater) to access or utilize the Service. Through your access or use of the Service, you affirm and guarantee that you satisfy the eligibility criteria and possess the legal authority to form a binding contract.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">2.2 Restricted Territories</h3>
                  <p>
                    Service access and usage may be limited in specific territories. You bear complete responsibility for understanding and adhering to the laws within your jurisdiction. If you reside in or hold citizenship of any territory where blockchain-based gaming participation is forbidden, or if you are otherwise legally prohibited from using the Service, you are forbidden from accessing or utilizing the Service.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">2.3 Legal Compliance</h3>
                  <p>
                    You commit to following all relevant local, state, federal, and international laws, regulations, and statutes, including any tax responsibilities that may arise from your Service usage.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">3. Service Characteristics</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">3.1 Blockchain-Based Gaming Platform</h3>
                  <p>
                    The Service operates as a decentralized blockchain-based gaming platform built on the Solana Network. The Service is not a trading exchange. It employs non-custodial smart contracts that allow Users to participate in various gaming activities ("Games"). All operations—deposits, gameplay, and withdrawals—are executed through smart contracts controlled by transparent and auditable code on the Solana Network.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">3.2 Non-Custodial Structure</h3>
                  <p>
                    <strong>Self-Custody & Secure Vaults:</strong> The Service never maintains custody of your assets. Using our "secure vault" system, all assets you allocate to gaming are secured within a protected, non-custodial smart contract that automatically returns assets to your wallet address when the gaming session concludes or the contract terminates.
                  </p>
                  <p>
                    <strong>Asset Movement:</strong> Assets may only transfer to and from the identical user wallet address. This design prevents third-party custody and substantially minimizes risks of asset mishandling or illicit financial activities.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">3.3 Verifiable Gaming Integrity</h3>
                  <p>
                    All gaming activities on this Service maintain verifiable fairness, with every transaction and wager documented on the Solana blockchain transparently, allowing any party to confirm the legitimacy of results. We employ cryptographic techniques to guarantee the authenticity of random number generation and wager resolution.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">3.4 Risk Acknowledgment</h3>
                  <p>
                    Through your use of the Service, you recognize the inherent risks connected with cryptocurrency-based software platforms, including but not limited to hardware, software, and internet connection issues, as well as digital currency price fluctuations. You acknowledge that any financial losses sustained while using the Service are entirely your responsibility.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">4. Digital Wallet Connection</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">4.1 Compatible Wallets</h3>
                  <p>
                    To utilize the Service, you must link your compatible digital wallet ("Wallet") to the Service's interface. You bear full responsibility for securing your Wallet and any private keys related to it.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">4.2 Network Costs</h3>
                  <p>
                    You recognize that all transactions on the Solana Network necessitate payment of network costs ("gas" or equivalent). You are exclusively responsible for covering such costs. We do not collect these costs; they are distributed to Solana Network validators.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">4.3 Information Accuracy</h3>
                  <p>
                    You commit to supplying accurate and comprehensive information when connecting to or utilizing the Service and to promptly update such information when changes occur.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">5. Rewards & Demo Gaming</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">5.1 Reward Tokens</h3>
                  <p>
                    <strong>Random Allocation:</strong> We may occasionally offer discretionary in-game rewards called "Reward Tokens." These tokens are randomly allocated to players according to variables including wager size and the particular Game participated in.
                  </p>
                  <p>
                    <strong>Tiers & Exchange:</strong> Reward Tokens exist in different tiers, and accumulating five (5) tokens of a particular tier may qualify you to exchange for a monetary reward ("Token Reward"). Nevertheless, Reward Tokens are not assured to possess any financial worth.
                  </p>
                  <p>
                    <strong>Non-Financial Nature:</strong> Reward Tokens do not represent currency, securities, or any financial instruments. We provide no guarantees or assurances concerning the worth, functionality, or exchangeability of Reward Tokens.
                  </p>
                  <p>
                    <strong>Service Authority:</strong> The Service may alter, pause, or terminate the Reward Token program whenever deemed appropriate, at its complete discretion. We accept no responsibility for maintaining or distributing Reward Tokens.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">6. Responsible Gaming</h2>
                  
                  <h3 className="text-xl font-medium text-white mt-6 mb-3">6.1 Financial Risk Awareness</h3>
                  <p>
                    Blockchain-based gaming carries financial risk. There is no assurance that you will generate profits, and you may experience losses. You should only wager assets you can afford to lose completely.
                  </p>

                  <h3 className="text-xl font-medium text-white mt-6 mb-3">6.2 Personal Responsibility</h3>
                  <p>
                    If you believe you may have a gaming addiction, we urge you to obtain professional assistance. The Service does not monitor or restrict your activities beyond what is required by its smart contracts.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">7. Forbidden Activities</h2>
                  <p>Through your use of the Service, you commit to avoid:</p>
                  <ul className="list-disc list-inside space-y-2 mt-4">
                    <li>Breaking any relevant law or regulation.</li>
                    <li>Bypassing security mechanisms or safeguards on the Service or its underlying smart contracts.</li>
                    <li>Supplying false, incorrect, or deceptive information.</li>
                    <li>Disrupting or interfering with other Users' experience of the Service.</li>
                    <li>Participating in fraudulent, abusive, manipulative, or illegal conduct.</li>
                    <li>Employing any automated systems (bots) without authorization.</li>
                    <li>Reverse engineering, modifying, or undermining the underlying protocol or smart contracts that control the Games. Such violations may invalidate your wagers and result in access termination.</li>
                  </ul>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">8. Intellectual Property Rights</h2>
                  <p>
                    All material, trademarks, logos, and brand elements shown on the Service ("Content") belong to SolsBet Foundation or its licensors. You may not copy, alter, distribute, or utilize the Content without prior written authorization.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">9. Data Privacy</h2>
                  <p>
                    All blockchain transactions are publicly accessible. Your wallet address and transaction information will be openly viewable. We do not retain sensitive personal data. Information you share with us (such as support requests) is managed in accordance with our Privacy Policy.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">10. Warranty Disclaimer</h2>
                  <p>
                    The Service is offered "as is" and "as available" without any warranties. We reject all warranties, whether expressed or implied, including merchantability, suitability for purpose, and non-infringement.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">11. Liability Limitations</h2>
                  <p>
                    We will not be responsible for indirect, incidental, special, consequential, or punitive damages. Our total liability is capped at the higher of USD $100 or the sum directly invested by you on the Service during the previous six months.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">12. User Indemnification</h2>
                  <p>
                    You consent to protect and hold harmless SolsBet Foundation and its affiliates from claims, obligations, costs, and expenses resulting from your improper use of the Service or violation of these Terms.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">13. Legal Jurisdiction and Dispute Resolution</h2>
                  <p>
                    These Terms will be governed by relevant international laws. Disputes will be resolved through binding arbitration conducted by a neutral arbitrator in English, following internationally accepted arbitration procedures.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">14. Access Termination</h2>
                  <p>
                    Either you or we may end your access to the Service at any point.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">15. Miscellaneous Provisions</h2>
                  <p>
                    These Terms represent the complete agreement. Severability, non-waiver, assignment limitations, and force majeure provisions are applicable.
                  </p>
                </section>

                <section>
                  <h2 className="text-2xl font-semibold text-white mt-8 mb-4">16. Contact Us</h2>
                  <p>
                    Email: <a href="mailto:hi@sols.bet" className="text-richGold hover:text-yellow-400 transition-colors">hi@sols.bet</a>
                  </p>
                </section>


              </div>
          </div>
        </div>
      </div>
    </>
  );
} 