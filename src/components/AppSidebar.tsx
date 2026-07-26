import { Home, Package, ShoppingCart, Users, Settings, LogOut, TruckIcon, FileText, BarChart3, MapPin, ArrowRightLeft, Receipt, ClipboardCheck, FileSpreadsheet, History, RotateCcw, Clock, Wallet } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';

export function AppSidebar() {
  const { userRole, signOut } = useAuth();

  const navItems = [
    { title: 'Dashboard', url: '/dashboard', icon: Home, roles: ['admin', 'cashier'] },
    { title: 'New Sale', url: '/sales', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { title: 'Invoices', url: '/invoices', icon: Receipt, roles: ['admin', 'cashier'] },
    { title: 'Returns', url: '/returns', icon: RotateCcw, roles: ['admin', 'cashier'] },
    { title: 'Products', url: '/products', icon: Package, roles: ['admin', 'cashier'] },
    { title: 'Customers', url: '/customers', icon: Users, roles: ['admin', 'cashier'] },
    { title: 'Vendors', url: '/vendors', icon: TruckIcon, roles: ['admin'] },
    { title: 'Purchase Orders', url: '/purchase-orders', icon: FileText, roles: ['admin'] },
    { title: 'Delivery Notes', url: '/delivery-notes', icon: ClipboardCheck, roles: ['admin'] },
    { title: 'Supplier Invoices', url: '/supplier-invoices', icon: FileSpreadsheet, roles: ['admin'] },
    { title: 'Stock Movements', url: '/stock-movements', icon: History, roles: ['admin'] },
    { title: 'Accounts Receivable', url: '/accounts-receivable', icon: Wallet, roles: ['admin'] },
    { title: 'Shifts', url: '/shifts', icon: Clock, roles: ['admin', 'cashier'] },
    { title: 'Locations', url: '/locations', icon: MapPin, roles: ['admin'] },
    { title: 'Transfers', url: '/inventory-transfers', icon: ArrowRightLeft, roles: ['admin'] },
    { title: 'Reports', url: '/reports', icon: BarChart3, roles: ['admin'] },
    { title: 'Settings', url: '/settings', icon: Settings, roles: ['admin'] },
    { title: 'User Management', url: '/users', icon: Users, roles: ['admin'] },
  ];

  const filteredItems = navItems.filter((item) =>
    item.roles.includes(userRole || '')
  );

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Wholesale POS</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : ''
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
