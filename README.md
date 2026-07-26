# IFMind-POS - Professional Wholesale Point of Sale System

## Project Overview

**IFMind-POS** is a modern, professional wholesale point-of-sale system built by **IFMind Technologies Ltd**. This application provides comprehensive inventory management, sales tracking, customer management, and real-time reporting capabilities with full offline functionality.

## Key Features

- 📱 **Progressive Web App (PWA)** - Install on any device, works offline
- 🔐 **Role-Based Access Control** - Admin and Cashier roles with specific permissions
- 📊 **Real-Time Dashboard** - Track sales, inventory, and low stock alerts
- 🛒 **Point of Sale** - Fast checkout with barcode scanning support
- 💰 **Multiple Payment Methods** - Cash and M-Pesa integration
- 📦 **Inventory Management** - Track stock levels, costs, and pricing
- 👥 **Customer Management** - Maintain customer records and transaction history
- 🏢 **Vendor Management** - Track suppliers and purchase orders
- 📈 **Reports & Analytics** - Sales reports, inventory reports, and more
- 🔄 **Offline Sync** - Queue transactions offline, auto-sync when connected
- 🎨 **Responsive Design** - Works on all devices from mobile to desktop

## Technologies Used

This project is built with modern web technologies:

- **React** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and development server
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **Supabase** - Backend database and authentication
- **PWA** - Progressive Web App capabilities

## Getting Started

### Prerequisites

- Node.js & npm installed ([install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- Git for version control

### Installation

```sh
# Step 1: Clone the repository
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory
cd 

# Step 3: Install dependencies
npm install

# Step 4: Start the development server
npm run dev
```

The application will be available at `http://localhost:8080`

## Deployment

To deploy your application:

1. Run `npm run build` to create a production build
2. Deploy the `dist` folder to your hosting provider
3. Configure environment variables for production

## User Roles

### Admin
- Full access to all features
- Product management (add, edit, delete)
- User management
- Vendor management
- Access to all reports and analytics
- Purchase order management

### Cashier
- Point of sale operations
- View products and inventory
- Customer management
- View own sales history
- Process payments (cash/M-Pesa)

## Offline Functionality

Molabs-POS is designed to work seamlessly offline:

- All critical features available without internet
- Transactions queued automatically when offline
- Auto-sync when connection is restored
- Visual indicator shows online/offline status
- PWA installation for native-like experience

## Security Features

- Role-based access control (RBAC)
- Row Level Security (RLS) policies
- Secure authentication with Supabase
- Input validation on all forms
- Protected API endpoints

## Support & Documentation

For support or questions about Molabs-POS:
- Contact: **Molabs Tech Solutions**
- Email: support@molabstech.com

## License

© 2024 Molabs Tech Solutions. All rights reserved.

---

**Built with ❤️ by Molabs Tech Solutions**
