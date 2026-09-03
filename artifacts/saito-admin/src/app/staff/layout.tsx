import type { Metadata, Viewport } from 'next';
import { StaffAppProvider } from './hooks/useStaffApp';
import StaffLayoutInner from './StaffLayoutInner';

export const metadata: Metadata = {
  title: 'SAITO Staff',
  description: 'İşçi portalı — növbə, clock-in/out, maaş və bəxşiş',
  manifest: '/manifest-staff.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SAITO Staff',
  },
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/icon-512x512.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffAppProvider>
      <StaffLayoutInner>{children}</StaffLayoutInner>
    </StaffAppProvider>
  );
}
