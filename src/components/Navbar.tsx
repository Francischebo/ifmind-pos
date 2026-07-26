import { useState } from 'react';
import { Home, Package, ShoppingCart, Users, Settings, LogOut, TruckIcon, FileText, BarChart3, Menu, X, RotateCw, Clock, Award, ArrowRightLeft, ClipboardList, PenTool, MapPin } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';
import { StockAlertBadge } from './StockAlertBadge';
import ifmindLogo from '@/assets/ifmind-logo.png';

export function Navbar() {
  const { userRole, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { title: 'Dashboard', url: '/dashboard', icon: Home, roles: ['admin', 'cashier'] },
    { title: 'New Sale', url: '/sales', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { title: 'Products', url: '/products', icon: Package, roles: ['admin', 'cashier'] },
    { title: 'Customers', url: '/customers', icon: Users, roles: ['admin', 'cashier'] },
    { title: 'Vendors', url: '/vendors', icon: TruckIcon, roles: ['admin'] },
    { title: 'Purchase Orders', url: '/purchase-orders', icon: FileText, roles: ['admin'] },
    { title: 'Locations', url: '/locations', icon: MapPin, roles: ['admin'] },
    { title: 'Transfers', url: '/inventory-transfers', icon: ArrowRightLeft, roles: ['admin'] },
    { title: 'Stock Takes', url: '/stock-takes', icon: ClipboardList, roles: ['admin'] },
    { title: 'Adjustments', url: '/inventory-adjustments', icon: PenTool, roles: ['admin'] },
    { title: 'Reports', url: '/reports', icon: BarChart3, roles: ['admin'] },
    { title: 'Returns', url: '/returns', icon: RotateCw, roles: ['admin', 'cashier'] },
    { title: 'Shifts', url: '/shifts', icon: Clock, roles: ['admin', 'cashier'] },
    { title: 'Loyalty', url: '/loyalty', icon: Award, roles: ['admin', 'cashier'] },
    { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin'] },
    { title: 'User Management', url: '/users', icon: Users, roles: ['admin'] },
  ];

  const filteredItems = navItems.filter((item) =>
    item.roles.includes(userRole || '')
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <NavLink to="/dashboard" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <img src={ifmindLogo} alt="IFMind POS" className="h-10 w-auto" />
          <span className="font-bold text-lg hidden sm:inline-block tracking-tight">IFMind-POS</span>
        </NavLink>

        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:gap-1">
          {filteredItems.map((item) => (
            <NavLink
              key={item.title}
              to={item.url}
              end
              className={({ isActive }) =>
                `inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
                  isActive
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span className="hidden lg:inline">{item.title}</span>
            </NavLink>
          ))}
        </div>

        {/* Stock Alerts & Desktop Logout */}
        <div className="hidden md:flex items-center gap-3">
          <StockAlertBadge />
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden lg:inline">Logout</span>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-64">
            <div className="flex flex-col gap-4 mt-8">
              <div className="flex items-center gap-2 mb-4">
                <img src={ifmindLogo} alt="IFMind POS" className="h-10 w-auto" />
                <span className="font-bold text-lg">IFMind-POS</span>
              </div>
              <div className="flex flex-col gap-1">
                {filteredItems.map((item) => (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    end
                    onClick={() => setIsOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
                  </NavLink>
                ))}
              </div>
              <div className="mt-auto pt-4 border-t">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={() => {
                    signOut();
                    setIsOpen(false);
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
