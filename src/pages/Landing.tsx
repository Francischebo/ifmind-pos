import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ShoppingCart, 
  BarChart3, 
  Users, 
  Package, 
  TrendingUp, 
  Shield, 
  Zap, 
  Cloud,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuthContext';
import { useEffect } from 'react';
import cfiLogo from '@/assets/cfi-pos-techiez-logo.png';

export default function Landing() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const features = [
    {
      icon: ShoppingCart,
      title: 'Modern Point of Sale',
      description: 'Fast, intuitive checkout with barcode scanning and multiple payment methods including M-Pesa integration.'
    },
    {
      icon: Package,
      title: 'Inventory Management',
      description: 'Real-time stock tracking, automated reorder alerts, and comprehensive product catalog management.'
    },
    {
      icon: BarChart3,
      title: 'Advanced Analytics',
      description: 'Make data-driven decisions with detailed sales reports, performance metrics, and business insights.'
    },
    {
      icon: Users,
      title: 'Customer Management',
      description: 'Build lasting relationships with customer profiles, purchase history, and loyalty program integration.'
    },
    {
      icon: Cloud,
      title: 'Cloud-Based & Offline',
      description: 'Access from anywhere with automatic sync. Works seamlessly offline with queue-based transaction sync.'
    },
    {
      icon: Shield,
      title: 'Secure & Compliant',
      description: 'Role-based access control, audit trails, and enterprise-grade security for your business data.'
    }
  ];

  const benefits = [
    'Reduce checkout time by 60% with intuitive POS interface',
    'Eliminate stockouts with automated inventory alerts',
    'Increase sales by 30% with customer insights',
    'Save 10+ hours weekly on manual reporting',
    'Scale effortlessly from single to multiple locations',
    'Access real-time data from any device, anywhere'
  ];

  const problems = [
    { problem: 'Manual inventory tracking', solution: 'Automated stock management with real-time updates' },
    { problem: 'Lost sales opportunities', solution: 'Customer loyalty program and purchase history tracking' },
    { problem: 'Time-consuming reporting', solution: 'One-click reports with actionable insights' },
    { problem: 'Disconnected operations', solution: 'Centralized cloud platform with offline capabilities' }
  ];

  return (
    <div className="min-h-screen w-full">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-primary/10 via-background to-accent/5 py-12 sm:py-20 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center text-center space-y-6 sm:space-y-8 animate-fade-in">
            <div className="flex justify-center mb-8">
              <img
                src={cfiLogo}
                alt="CFI-POS Techiez Limited Company — Smart Point of Sale for Smart Businesses"
                className="h-auto w-full max-w-3xl object-contain"
              />
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-4xl">
              Run your business smarter with
              <span className="text-primary block mt-2">CFI-POS Techiez</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl">
              The all-in-one point of sale system designed specifically for wholesale businesses.
              Streamline operations, boost efficiency, and grow your revenue.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button size="lg" onClick={() => navigate('/auth')} className="text-lg px-8">
                Get Started <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Problems & Solutions */}
      <section className="py-12 sm:py-16 bg-muted/30 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 animate-slide-in-left">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Challenges We Solve</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Running a business is complex. CFI-POS Techiez simplifies your daily operations.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {problems.map((item, idx) => (
              <Card key={idx} className="border-2 hover:border-primary transition-all duration-300 hover:scale-105" style={{ animationDelay: `${idx * 100}ms` }}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-destructive/10 rounded-lg shrink-0">
                      <div className="h-2 w-2 bg-destructive rounded-full" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2 line-through text-muted-foreground">
                        {item.problem}
                      </h3>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                        <p className="text-foreground font-medium">{item.solution}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-16 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 animate-slide-in-left">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Everything You Need to Succeed</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Powerful features designed to streamline your wholesale operations from end to end.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="hover:shadow-lg transition-all duration-300 hover:scale-105" style={{ animationDelay: `${idx * 100}ms` }}>
                  <CardContent className="p-6">
                    <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-xl mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-primary/5 to-accent/5 overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 animate-slide-in-left">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">The CFI-POS Techiez Advantage</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Measurable results that impact your bottom line from day one.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-card p-4 rounded-lg shadow-sm transition-all duration-300 hover:scale-105" style={{ animationDelay: `${idx * 100}ms` }}>
                <CheckCircle2 className="h-6 w-6 text-accent shrink-0 mt-0.5" />
                <p className="font-medium">{benefit}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose CFI-POS Techiez */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">Why Choose CFI-POS Techiez?</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-8 text-center">
              <div>
                <div className="p-4 bg-primary/10 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <Zap className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-semibold text-xl mb-2">Fast Implementation</h3>
                <p className="text-muted-foreground">Get up and running in hours, not weeks. No complex setup required.</p>
              </div>
              <div>
                <div className="p-4 bg-accent/10 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <TrendingUp className="h-10 w-10 text-accent" />
                </div>
                <h3 className="font-semibold text-xl mb-2">Proven Results</h3>
                <p className="text-muted-foreground">Join successful businesses that have transformed their operations.</p>
              </div>
              <div>
                <div className="p-4 bg-primary/10 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <Shield className="h-10 w-10 text-primary" />
                </div>
                <h3 className="font-semibold text-xl mb-2">Enterprise Security</h3>
                <p className="text-muted-foreground">Bank-level encryption and security for complete peace of mind.</p>
              </div>
            </div>
          </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-20 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto px-4 sm:px-6 text-center animate-fade-in">
          <h2 className="text-2xl sm:text-4xl font-bold text-primary-foreground mb-6">
            Ready to Transform Your Business?
          </h2>
          <p className="text-lg sm:text-xl text-primary-foreground/90 mb-8 max-w-2xl mx-auto">
            Join businesses that trust CFI-POS Techiez for their daily operations.
            Start your journey to streamlined success today.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 bg-muted/30 border-t">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <img
            src={cfiLogo}
            alt="CFI-POS Techiez Limited Company"
            className="mx-auto mb-4 h-auto w-full max-w-xs object-contain"
          />
          <p className="text-sm">
            © {new Date().getFullYear()} CFI-POS Techiez Limited Company. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Professional Point of Sale Solutions for Modern Businesses
          </p>
        </div>
      </footer>
    </div>
  );
}
