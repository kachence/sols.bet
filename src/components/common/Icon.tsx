// src/components/Icon.tsx
import React from 'react';
import { 
  // Heroicons outline
  HomeIcon,
  CubeIcon,
  WalletIcon,
  GiftIcon,
  UserIcon,
  QuestionMarkCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PlusIcon,
  MinusIcon,
  XMarkIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ClipboardDocumentIcon,
  ShareIcon,
  StarIcon,
  TrophyIcon,
  SparklesIcon,
  BoltIcon,
  FireIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowUpRightIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CurrencyDollarIcon,
  ClockIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  UsersIcon,
  LinkIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';

import {
  HomeIcon as HomeFilled,
  CubeIcon as GameFilled,
  WalletIcon as WalletFilled,
  GiftIcon as GiftFilled,
  UserIcon as UserFilled,
  StarIcon as StarFilled,
  TrophyIcon as TrophyFilled,
  SparklesIcon as SparklesFilled,
  BoltIcon as BoltFilled,
  FireIcon as FireFilled,
} from '@heroicons/react/24/solid';

// Icon mapping object for easy access
export const iconMap = {
  // Navigation icons
  home: HomeIcon,
  'home-filled': HomeFilled,
  games: CubeIcon,
  'games-filled': GameFilled,
  wallet: WalletIcon,
  'wallet-filled': WalletFilled,
  rewards: GiftIcon,
  'rewards-filled': GiftFilled,
  profile: UserIcon,
  'profile-filled': UserFilled,
  help: QuestionMarkCircleIcon,
  settings: Cog6ToothIcon,
  logout: ArrowRightOnRectangleIcon,

  // Directional icons
  'chevron-down': ChevronDownIcon,
  'chevron-up': ChevronUpIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-left': ChevronLeftIcon,
  'arrow-up-right': ArrowUpRightIcon,
  'arrow-down': ArrowDownIcon,
  'arrow-up': ArrowUpIcon,
  plus: PlusIcon,
  minus: MinusIcon,
  close: XMarkIcon,
  x: XMarkIcon,

  // Status icons
  check: CheckIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
  error: ExclamationTriangleIcon,

  // Action icons
  copy: ClipboardDocumentIcon,
  share: ShareIcon,
  link: LinkIcon,
  eye: EyeIcon,
  'eye-slash': EyeSlashIcon,
  play: PlayIcon,
  pause: PauseIcon,
  refresh: ArrowPathIcon,

  // Gambling & Gaming icons (using available Heroicons)
  dice: CubeIcon, // Using cube as dice placeholder
  cards: CubeIcon, // Using cube as cards placeholder
  coins: CurrencyDollarIcon,
  money: CurrencyDollarIcon,
  'currency-dollar': CurrencyDollarIcon,
  vault: WalletIcon, // Using wallet as vault placeholder
  gem: SparklesIcon, // Using sparkles as gem placeholder
  diamond: SparklesIcon,
  clover: SparklesIcon, // Using sparkles as clover placeholder
  target: CubeIcon,
  rocket: ArrowUpIcon, // Using arrow as rocket placeholder

  // Achievement & Status icons
  star: StarIcon,
  'star-filled': StarFilled,
  trophy: TrophyIcon,
  'trophy-filled': TrophyFilled,
  medal: TrophyIcon,
  crown: TrophyIcon,
  sparkles: SparklesIcon,
  'sparkles-filled': SparklesFilled,
  bolt: BoltIcon,
  'bolt-filled': BoltFilled,
  lightning: BoltIcon,
  fire: FireIcon,
  'fire-filled': FireFilled,
  flame: FireIcon,

  // Charts & Analytics
  chart: ChartBarIcon,
  'trend-up': ArrowUpIcon,
  'trend-down': ArrowDownIcon,

  // Time & Calendar
  clock: ClockIcon,
  calendar: CalendarDaysIcon,

  // Social
  users: UsersIcon,

  // Technology
  qr: QrCodeIcon,
} as const;

export type IconName = keyof typeof iconMap;

interface IconProps {
  name: IconName;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  color?: 'default' | 'primary' | 'secondary' | 'muted' | 'success' | 'warning' | 'danger';
}

const sizeClasses = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-10 h-10',
};

const colorClasses = {
  default: 'text-white',
  primary: 'text-luck-primary',
  secondary: 'text-gray-400',
  muted: 'text-luck-muted',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  danger: 'text-red-500',
};

export const Icon: React.FC<IconProps> = ({ 
  name, 
  size = 'md', 
  className = '', 
  color = 'default',
  ...props 
}) => {
  const IconComponent = iconMap[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  const classes = `
    ${sizeClasses[size]}
    ${colorClasses[color]}
    ${className}
  `.trim();

  return (
    <IconComponent 
      className={classes}
      {...props}
    />
  );
};

export default Icon;
