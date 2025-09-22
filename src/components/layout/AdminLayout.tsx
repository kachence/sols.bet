// src/components/layout/AdminLayout.tsx
import { useState, useEffect, ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Admin password - in production, this should be an environment variable
  const ADMIN_PASSWORD = 'admin100x2024!';

  const navigationLinks = [
    { href: '/admin/dashboard', label: 'Dashboard', active: router.pathname === '/admin/dashboard' },
    { href: '/admin/transactions-recon', label: 'Transactions Reconciliation', active: router.pathname === '/admin/transactions-recon' },
    { href: '/admin/unit-tests', label: 'RGS Unit Tests', active: router.pathname === '/admin/unit-tests' }
  ];

  useEffect(() => {
    // Check if already authenticated in this session
    const authenticated = sessionStorage.getItem('adminAuthenticated');
    if (authenticated === 'true') {
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('adminAuthenticated', 'true');
      setError('');
    } else {
      setError('Invalid password');
      setPassword('');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('adminAuthenticated');
    setPassword('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-darkLuxuryPurple flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-darkLuxuryPurple flex items-center justify-center p-4">
        <div className="bg-cardMedium border border-cardMedium rounded-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <FontAwesomeIcon 
              icon={faLock} 
              className="text-richGold w-12 h-12 mb-4" 
              style={{ fontSize: '48px' }}
            />
            <h1 className="text-2xl font-bold text-white mb-2">Admin Access Required</h1>
            <p className="text-gray-400">Enter the admin password to access {title}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-4 py-3 bg-darkLuxuryPurple border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-richGold transition-colors pr-12"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                <FontAwesomeIcon 
                  icon={showPassword ? faEyeSlash : faEye} 
                  className="w-5 h-5" 
                />
              </button>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center">{error}</div>
            )}

            <button
              type="submit"
              className="w-full bg-richGold hover:bg-richGold/90 text-black font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Access Admin Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Admin Header */}
      <div className="bg-cardMedium rounded-lg px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Logout
          </button>
        </div>
        
        {/* Navigation Links */}
        <nav className="flex items-center space-x-3">
          {navigationLinks.map((link, index) => (
            <div key={link.href} className="flex items-center">
              <Link
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  link.active
                    ? 'bg-richGold text-black'
                    : 'text-gray-300 hover:text-white hover:bg-darkLuxuryPurple'
                }`}
              >
                {link.label}
              </Link>
              {index < navigationLinks.length - 1 && (
                <div className="ml-3 w-px h-4 bg-gray-600"></div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Admin Content */}
      <div className="pt-6">
        {children}
      </div>
    </div>
  );
}