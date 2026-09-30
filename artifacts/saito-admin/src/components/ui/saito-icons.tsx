'use client';
import type { ComponentType, CSSProperties, SVGProps } from 'react';
import {
  AlignLeft as _AlignLeft,
  Armchair as _Armchair,
  ArrowLeft as _ArrowLeft,
  ArrowRight as _ArrowRight,
  ArrowUpRight as _ArrowUpRight,
  Handbag as _Handbag,
  BatteryCharging as _BatteryCharging,
  BatteryLow as _BatteryLow,
  Bell as _Bell,
  Bluetooth as _Bluetooth,
  BookOpen as _BookOpen,
  Briefcase as _Briefcase,
  Calculator as _Calculator,
  Calendar as _Calendar,
  Camera as _Camera,
  Car as _Car,
  Check as _Check,
  CheckCircle as _CheckCircle,
  CheckSquare as _CheckSquare,
  ChefHat as _ChefHat,
  Clock as _Clock,
  Cloud as _Cloud,
  CloudRain as _CloudRain,
  Coffee as _Coffee,
  CookingPot as _CookingPot,
  Copy as _Copy,
  CreditCard as _CreditCard,
  Crown as _Crown,
  Database as _Database,
  DoorOpen as _DoorOpen,
  Download as _Download,
  Egg as _Egg,
  Eye as _Eye,
  FileText as _FileText,
  Fish as _Fish,
  Flag as _Flag,
  Flame as _Flame,
  FolderPlus as _FolderPlus,
  Gift as _Gift,
  GitMerge as _GitMerge,
  Globe as _Globe,
  Hash as _Hash,
  Heart as _Heart,
  Hourglass as _Hourglass,
  Image as _Image,
  Info as _Info,
  Key as _Key,
  Keyboard as _Keyboard,
  Laptop as _Laptop,
  Leaf as _Leaf,
  Lock as _Lock,
  MapPin as _MapPin,
  Martini as _Martini,
  Megaphone as _Megaphone,
  Minus as _Minus,
  Monitor as _Monitor,
  Moon as _Moon,
  Nut as _Nut,
  Package as _Package,
  Pause as _Pause,
  PauseCircle as _PauseCircle,
  Pencil as _Pencil,
  Percent as _Percent,
  Phone as _Phone,
  PhoneCall as _PhoneCall,
  Play as _Play,
  Plus as _Plus,
  PlusCircle as _PlusCircle,
  Power as _Power,
  Printer as _Printer,
  QrCode as _QrCode,
  Receipt as _Receipt,
  Ruler as _Ruler,
  Scissors as _Scissors,
  Shield as _Shield,
  ShieldCheck as _ShieldCheck,
  ShoppingBag as _ShoppingBag,
  ShoppingCart as _ShoppingCart,
  Shrimp as _Shrimp,
  Sliders as _Sliders,
  SlidersHorizontal as _SlidersHorizontal,
  Square as _Square,
  Star as _Star,
  Sun as _Sun,
  Table as _Table,
  Tag as _Tag,
  Target as _Target,
  TestTube as _TestTube,
  Thermometer as _Thermometer,
  Timer as _Timer,
  Trash as _Trash,
  Truck as _Truck,
  Upload as _Upload,
  Usb as _Usb,
  User as _User,
  UserCheck as _UserCheck,
  UserPlus as _UserPlus,
  Users as _Users,
  Wallet as _Wallet,
  Warehouse as _Warehouse,
  Wind as _Wind,
  Wine as _Wine,
  Wrench as _Wrench,
  X as _X,
  XCircle as _XCircle,
  Pulse as _Activity,
  WarningCircle as _AlertCircle,
  Warning as _AlertTriangle,
  Archive as _ArchiveRestore,
  ArrowDown as _ArrowDownCircle,
  ArrowsLeftRight as _ArrowLeftRight,
  ArrowUp as _ArrowUpCircle,
  ArrowsDownUp as _ArrowUpDown,
  Medal as _Award,
  Prohibit as _Ban,
  Money as _Banknote,
  ChartBar as _BarChart2,
  ChartBarHorizontal as _BarChart3,
  Coffee as _Bean,
  BellSlash as _BellOff,
  BellRinging as _BellRing,
  Bicycle as _Bike,
  Robot as _Bot,
  Brain as _BrainCircuit,
  PaintBrushHousehold as _BrushCleaning,
  Building as _Building2,
  CalendarDot as _CalendarClock,
  Calendar as _CalendarDays,
  CalendarX as _CalendarOff,
  Checks as _CheckCheck,
  CheckCircle as _CheckCircle2,
  CaretDown as _ChevronDown,
  CaretLeft as _ChevronLeft,
  CaretRight as _ChevronRight,
  CaretUp as _ChevronUp,
  CaretDoubleLeft as _ChevronsLeft,
  CaretDoubleRight as _ChevronsRight,
  Target as _CircleDot,
  Clipboard as _ClipboardCheck,
  Clock as _Clock3,
  Cube as _Component,
  Bell as _ConciergeBell,
  KeyReturn as _CornerDownLeft,
  Trash as _Delete,
  CurrencyDollar as _DollarSign,
  Pencil as _Edit,
  Pencil as _Edit2,
  PencilLine as _Edit3,
  Export as _ExternalLink,
  EyeSlash as _EyeOff,
  Funnel as _Filter,
  Flame as _FlameKindling,
  Flask as _FlaskConical,
  Flower as _Flower2,
  SquaresFour as _Grid2x2,
  DotsSixVertical as _GripVertical,
  Hand as _HandPlatter,
  ClockCounterClockwise as _History,
  House as _Home,
  Image as _ImageOff,
  Key as _KeyRound,
  Bank as _Landmark,
  StackSimple as _Layers,
  Stack as _Layers3,
  SquaresFour as _LayoutDashboard,
  GridFour as _LayoutGrid,
  Books as _Library,
  Lightbulb as _Lightbulb,
  Link as _Link2,
  ListNumbers as _ListOrdered,
  Spinner as _Loader2,
  SignIn as _LogIn,
  SignOut as _LogOut,
  Envelope as _Mail,
  MapTrifold as _Map,
  List as _Menu,
  GitMerge as _Merge,
  ChatCircle as _MessageCircle,
  Chat as _MessageSquare,
  Drop as _Milk,
  Monitor as _MonitorOff,
  DotsThree as _MoreHorizontal,
  DotsThreeVertical as _MoreVertical,
  CornersOut as _Move,
  NavigationArrow as _Navigation,
  Package as _PackageCheck,
  Package as _PackageOpen,
  Package as _PackagePlus,
  SidebarSimple as _PanelLeftClose,
  SidebarSimple as _PanelLeftOpen,
  ChartPieSlice as _PieChart,
  Power as _PowerOff,
  Receipt as _ReceiptText,
  ArrowClockwise as _RefreshCw,
  ArrowCounterClockwise as _RotateCcw,
  ArrowClockwise as _RotateCw,
  Signpost as _Route,
  FloppyDisk as _Save,
  Scales as _Scale,
  FileText as _ScrollText,
  MagnifyingGlass as _Search,
  PaperPlaneRight as _Send,
  PaperPlaneTilt as _SendHorizonal,
  Gear as _Settings,
  SlidersHorizontal as _Settings2,
  ShareNetwork as _Share2,
  Fish as _Shell,
  ShieldWarning as _ShieldAlert,
  DeviceMobile as _Smartphone,
  Sparkle as _Sparkles,
  GitFork as _Split,
  Plant as _Sprout,
  Storefront as _Store,
  SunHorizon as _Sunrise,
  Table as _Table2,
  Trash as _Trash2,
  TrendDown as _TrendingDown,
  TrendUp as _TrendingUp,
  Warning as _TriangleAlert,
  LockOpen as _Unlock,
  Plug as _Unplug,
  UserGear as _UserCog,
  User as _UserRound,
  User as _UserX,
  ForkKnife as _Utensils,
  SpeakerHigh as _Volume2,
  SpeakerSlash as _VolumeX,
  MagicWand as _Wand2,
  Grains as _Wheat,
  WifiHigh as _Wifi,
  WifiSlash as _WifiOff,
  Lightning as _Zap
} from '@phosphor-icons/react';

/**
 * SAITO ICONS - Phosphor (2026-09-27, owner: 'butun sistemdeki ikony
 * tamamilen yenile, vebde arašdir, en estetik premium dest, kodda cirkin
 * logo yaratma, stroke/olcu/rend qoruyub production-ready tetbik et').
 *
 * Why Phosphor: 1500+ curated icons on ONE 256px grid with a consistent
 * weight language (thin/light/regular/bold/fill/duotone). Saito used lucide
 * but 128 of the 232 icons it needed did not exist there - this set covers
 * everything Saito uses, with the same visual density (regular = 2px).
 * MIT licensed, official React package, tree-shakeable.
 *
 * DROP-IN for lucide-react: every previously-imported name is exported here
 * with the same props contract (size, strokeWidth, className, style).
 * strokeWidth -> Phosphor weight: <=1.25 thin, <=1.5 light, <=2.25 regular
 * (default - same density as lucide-2), >2.25 bold.
 */
export interface SaitoIconProps extends Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> {
  size?: number | string;
  strokeWidth?: number;
  style?: CSSProperties;
}

export type LucideIcon = ComponentType<SaitoIconProps>;

function adapt(Icon: ComponentType<any>): LucideIcon {
  return function SaitoIcon({ size = 24, strokeWidth = 2, className, style, ...rest }: SaitoIconProps) {
    const weight = strokeWidth <= 1.25 ? 'thin'
      : strokeWidth <= 1.5 ? 'light'
      : strokeWidth <= 2.25 ? 'regular'
      : 'bold';
    return <Icon size={size as any} weight={weight} className={className} style={style} {...rest} />;
  };
}

export const AlignLeft = adapt(_AlignLeft);
export const Armchair = adapt(_Armchair);
export const ArrowLeft = adapt(_ArrowLeft);
export const ArrowRight = adapt(_ArrowRight);
export const ArrowUpRight = adapt(_ArrowUpRight);
// 2026-09-29 (owner, round 7 #6): the TAKEAWAY icon must read as a BAG the
// pickup person carries — Phosphor's ShoppingBag is a rounded BOX + small
// handle (reads "box" at 15px). Handbag = trapezoid + prominent handle arc:
// clearly a bag at every size.
export const Handbag = adapt(_Handbag);
export const BatteryCharging = adapt(_BatteryCharging);
export const BatteryLow = adapt(_BatteryLow);
export const Bell = adapt(_Bell);
export const Bluetooth = adapt(_Bluetooth);
export const BookOpen = adapt(_BookOpen);
export const Briefcase = adapt(_Briefcase);
export const Calculator = adapt(_Calculator);
export const Calendar = adapt(_Calendar);
export const Camera = adapt(_Camera);
export const Car = adapt(_Car);
export const Check = adapt(_Check);
export const CheckCircle = adapt(_CheckCircle);
export const CheckSquare = adapt(_CheckSquare);
export const ChefHat = adapt(_ChefHat);
export const Clock = adapt(_Clock);
export const Cloud = adapt(_Cloud);
export const CloudRain = adapt(_CloudRain);
export const Coffee = adapt(_Coffee);
export const CookingPot = adapt(_CookingPot);
export const Copy = adapt(_Copy);
export const CreditCard = adapt(_CreditCard);
export const Crown = adapt(_Crown);
export const Database = adapt(_Database);
export const DoorOpen = adapt(_DoorOpen);
export const Download = adapt(_Download);
export const Egg = adapt(_Egg);
export const Eye = adapt(_Eye);
export const FileText = adapt(_FileText);
export const Fish = adapt(_Fish);
export const Flag = adapt(_Flag);
export const Flame = adapt(_Flame);
export const FolderPlus = adapt(_FolderPlus);
export const Gift = adapt(_Gift);
export const GitMerge = adapt(_GitMerge);
export const Globe = adapt(_Globe);
export const Hash = adapt(_Hash);
export const Heart = adapt(_Heart);
export const Hourglass = adapt(_Hourglass);
export const Image = adapt(_Image);
export const Info = adapt(_Info);
export const Key = adapt(_Key);
export const Keyboard = adapt(_Keyboard);
export const Laptop = adapt(_Laptop);
export const Leaf = adapt(_Leaf);
export const Lock = adapt(_Lock);
export const MapPin = adapt(_MapPin);
export const Martini = adapt(_Martini);
export const Megaphone = adapt(_Megaphone);
export const Minus = adapt(_Minus);
export const Monitor = adapt(_Monitor);
export const Moon = adapt(_Moon);
export const Nut = adapt(_Nut);
export const Package = adapt(_Package);
export const Pause = adapt(_Pause);
export const PauseCircle = adapt(_PauseCircle);
export const Pencil = adapt(_Pencil);
export const Percent = adapt(_Percent);
export const Phone = adapt(_Phone);
export const PhoneCall = adapt(_PhoneCall);
export const Play = adapt(_Play);
export const Plus = adapt(_Plus);
export const PlusCircle = adapt(_PlusCircle);
export const Power = adapt(_Power);
export const Printer = adapt(_Printer);
export const QrCode = adapt(_QrCode);
export const Receipt = adapt(_Receipt);
export const Ruler = adapt(_Ruler);
export const Scissors = adapt(_Scissors);
export const Shield = adapt(_Shield);
export const ShieldCheck = adapt(_ShieldCheck);
export const ShoppingBag = adapt(_ShoppingBag);
export const ShoppingCart = adapt(_ShoppingCart);
export const Shrimp = adapt(_Shrimp);
export const Sliders = adapt(_Sliders);
export const SlidersHorizontal = adapt(_SlidersHorizontal);
export const Square = adapt(_Square);
export const Star = adapt(_Star);
export const Sun = adapt(_Sun);
export const Table = adapt(_Table);
export const Tag = adapt(_Tag);
export const Target = adapt(_Target);
export const TestTube = adapt(_TestTube);
export const Thermometer = adapt(_Thermometer);
export const Timer = adapt(_Timer);
export const Trash = adapt(_Trash);
export const Truck = adapt(_Truck);
export const Upload = adapt(_Upload);
export const Usb = adapt(_Usb);
export const User = adapt(_User);
export const UserCheck = adapt(_UserCheck);
export const UserPlus = adapt(_UserPlus);
export const Users = adapt(_Users);
export const Wallet = adapt(_Wallet);
export const Warehouse = adapt(_Warehouse);
export const Wind = adapt(_Wind);
export const Wine = adapt(_Wine);
export const Wrench = adapt(_Wrench);
export const X = adapt(_X);
export const XCircle = adapt(_XCircle);
export const Activity = adapt(_Activity);
export const AlertCircle = adapt(_AlertCircle);
export const AlertTriangle = adapt(_AlertTriangle);
export const ArchiveRestore = adapt(_ArchiveRestore);
export const ArrowDownCircle = adapt(_ArrowDownCircle);
export const ArrowLeftRight = adapt(_ArrowLeftRight);
export const ArrowUpCircle = adapt(_ArrowUpCircle);
export const ArrowUpDown = adapt(_ArrowUpDown);
export const Award = adapt(_Award);
export const Ban = adapt(_Ban);
export const Banknote = adapt(_Banknote);
export const BarChart2 = adapt(_BarChart2);
export const BarChart3 = adapt(_BarChart3);
export const Bean = adapt(_Bean);
export const BellOff = adapt(_BellOff);
export const BellRing = adapt(_BellRing);
export const Bike = adapt(_Bike);
export const Bot = adapt(_Bot);
export const BrainCircuit = adapt(_BrainCircuit);
export const BrushCleaning = adapt(_BrushCleaning);
export const Building2 = adapt(_Building2);
export const CalendarClock = adapt(_CalendarClock);
export const CalendarDays = adapt(_CalendarDays);
export const CalendarOff = adapt(_CalendarOff);
export const CheckCheck = adapt(_CheckCheck);
export const CheckCircle2 = adapt(_CheckCircle2);
export const ChevronDown = adapt(_ChevronDown);
export const ChevronLeft = adapt(_ChevronLeft);
export const ChevronRight = adapt(_ChevronRight);
export const ChevronUp = adapt(_ChevronUp);
export const ChevronsLeft = adapt(_ChevronsLeft);
export const ChevronsRight = adapt(_ChevronsRight);
export const CircleDot = adapt(_CircleDot);
export const ClipboardCheck = adapt(_ClipboardCheck);
export const Clock3 = adapt(_Clock3);
export const Component = adapt(_Component);
export const ConciergeBell = adapt(_ConciergeBell);
export const CornerDownLeft = adapt(_CornerDownLeft);
export const Delete = adapt(_Delete);
export const DollarSign = adapt(_DollarSign);
export const Edit = adapt(_Edit);
export const Edit2 = adapt(_Edit2);
export const Edit3 = adapt(_Edit3);
export const ExternalLink = adapt(_ExternalLink);
export const EyeOff = adapt(_EyeOff);
export const Filter = adapt(_Filter);
export const FlameKindling = adapt(_FlameKindling);
export const FlaskConical = adapt(_FlaskConical);
export const Flower2 = adapt(_Flower2);
export const Grid2x2 = adapt(_Grid2x2);
export const GripVertical = adapt(_GripVertical);
export const HandPlatter = adapt(_HandPlatter);
export const History = adapt(_History);
export const Home = adapt(_Home);
export const ImageOff = adapt(_ImageOff);
export const KeyRound = adapt(_KeyRound);
export const Landmark = adapt(_Landmark);
export const Layers = adapt(_Layers);
export const Layers3 = adapt(_Layers3);
export const LayoutDashboard = adapt(_LayoutDashboard);
export const LayoutGrid = adapt(_LayoutGrid);
export const Library = adapt(_Library);
export const Lightbulb = adapt(_Lightbulb);
export const Link2 = adapt(_Link2);
export const ListOrdered = adapt(_ListOrdered);
export const Loader2 = adapt(_Loader2);
export const LogIn = adapt(_LogIn);
export const LogOut = adapt(_LogOut);
export const Mail = adapt(_Mail);
export const Map = adapt(_Map);
export const Menu = adapt(_Menu);
export const Merge = adapt(_Merge);
export const MessageCircle = adapt(_MessageCircle);
export const MessageSquare = adapt(_MessageSquare);
export const Milk = adapt(_Milk);
export const MonitorOff = adapt(_MonitorOff);
export const MoreHorizontal = adapt(_MoreHorizontal);
export const MoreVertical = adapt(_MoreVertical);
export const Move = adapt(_Move);
export const Navigation = adapt(_Navigation);
export const PackageCheck = adapt(_PackageCheck);
export const PackageOpen = adapt(_PackageOpen);
export const PackagePlus = adapt(_PackagePlus);
export const PanelLeftClose = adapt(_PanelLeftClose);
export const PanelLeftOpen = adapt(_PanelLeftOpen);
export const PieChart = adapt(_PieChart);
export const PowerOff = adapt(_PowerOff);
export const ReceiptText = adapt(_ReceiptText);
export const RefreshCw = adapt(_RefreshCw);
export const RotateCcw = adapt(_RotateCcw);
export const RotateCw = adapt(_RotateCw);
export const Route = adapt(_Route);
export const Save = adapt(_Save);
export const Scale = adapt(_Scale);
export const ScrollText = adapt(_ScrollText);
export const Search = adapt(_Search);
export const Send = adapt(_Send);
export const SendHorizonal = adapt(_SendHorizonal);
export const Settings = adapt(_Settings);
export const Settings2 = adapt(_Settings2);
export const Share2 = adapt(_Share2);
export const Shell = adapt(_Shell);
export const ShieldAlert = adapt(_ShieldAlert);
export const Smartphone = adapt(_Smartphone);
export const Sparkles = adapt(_Sparkles);
export const Split = adapt(_Split);
export const Sprout = adapt(_Sprout);
export const Store = adapt(_Store);
export const Sunrise = adapt(_Sunrise);
export const Table2 = adapt(_Table2);
export const Trash2 = adapt(_Trash2);
export const TrendingDown = adapt(_TrendingDown);
export const TrendingUp = adapt(_TrendingUp);
export const TriangleAlert = adapt(_TriangleAlert);
export const Unlock = adapt(_Unlock);
export const Unplug = adapt(_Unplug);
export const UserCog = adapt(_UserCog);
export const UserRound = adapt(_UserRound);
export const UserX = adapt(_UserX);
export const Utensils = adapt(_Utensils);
export const Volume2 = adapt(_Volume2);
export const VolumeX = adapt(_VolumeX);
export const Wand2 = adapt(_Wand2);
export const Wheat = adapt(_Wheat);
export const Wifi = adapt(_Wifi);
export const WifiOff = adapt(_WifiOff);
export const Zap = adapt(_Zap);

// ── CUSTOM icons (11o — owner: "brauzerdən derin axtarış et, custom ikon
//    download et; takeaway = person sifarişi götürür, Apple felsefəsi") ──────
// Deep browser search across lucide / lucide-lab / tabler / iconoir / phosphor
// / material / hugeicons: NO mainstream set ships a true "person picking up a
// takeout bag" stroke icon. Best stroke candidates downloaded:
//
// TakeawayPickup (11o, v2) — the browser-searched Hugeicons `hand-bag-01`
// rendered as a HANDBAG/PURSE (no hand — verified at 420px, owner-rejected
// class). No mainstream set has a person+pickup stroke icon, so this is a
// HAND-COMPOSED minimal in the exact lucide/SF grid (24, stroke 2, round):
// the universal "local pickup" pictogram — PERSON + TAKEOUT BAG the customer
// collects. Two balanced glyphs, nothing else.
export function TakeawayPickup({ size = 24, strokeWidth = 2, className, color, ...rest }: SaitoIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size as number} height={size as number} viewBox="0 0 24 24"
      fill="none" stroke={color || 'currentColor'} strokeLinecap="round" strokeLinejoin="round"
      strokeWidth={strokeWidth} className={className} aria-hidden {...rest}>
      {/* person — head + shoulders (lucide user-round weight) */}
      <circle cx="7.5" cy="6" r="3" />
      <path d="M2.5 20.5v-2.5a5 5 0 0 1 10 0v2.5" />
      {/* takeout bag — trapezoid body + handle */}
      <path d="M15.5 10h6l-.6 5.6a2 2 0 0 1-2 1.9h-4.8a2 2 0 0 1-2-1.9Z" />
      <path d="M17.5 10V8.8a2 2 0 0 1 4 0V10" />
    </svg>
  );
}

// Moped — Tabler `moped` (MIT): the delivery courier (Baku couriers ride
// scooters, not bicycles — semantic upgrade over the old Bike icon).
export function Moped({ size = 24, strokeWidth = 2, className, color, ...rest }: SaitoIconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size as number} height={size as number} viewBox="0 0 24 24"
      fill="none" stroke={color || 'currentColor'} strokeLinecap="round" strokeLinejoin="round"
      strokeWidth={strokeWidth} className={className} aria-hidden {...rest}>
      <path d="M16 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M5 16v1a2 2 0 0 0 4 0v-5h-3a3 3 0 0 0 -3 3v1h10a6 6 0 0 1 5 -4v-5a2 2 0 0 0 -2 -2h-1" />
      <path d="M6 9l3 0" />
    </svg>
  );
}
