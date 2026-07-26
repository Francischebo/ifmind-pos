-- Create user roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'cashier');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id),
  unit_cost DECIMAL(10,2) NOT NULL,
  retail_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 16.00,
  unit_of_measure TEXT DEFAULT 'piece',
  reorder_level INTEGER DEFAULT 10,
  stock_on_hand INTEGER DEFAULT 0,
  location TEXT DEFAULT 'main',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT positive_prices CHECK (unit_cost >= 0 AND retail_price >= 0),
  CONSTRAINT positive_stock CHECK (stock_on_hand >= 0)
);

-- Create sales table
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id UUID REFERENCES auth.users(id) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa')),
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'pending', 'voided')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create sale_items table
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL,
  tax_rate DECIMAL(5,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for categories
CREATE POLICY "Anyone can view categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for products
CREATE POLICY "Anyone can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for sales
CREATE POLICY "Users can view sales"
  ON public.sales FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    cashier_id = auth.uid()
  );

CREATE POLICY "Cashiers and admins can create sales"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (
    cashier_id = auth.uid() AND
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'cashier'))
  );

-- RLS Policies for sale_items
CREATE POLICY "Users can view sale items"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_items.sale_id
      AND (public.has_role(auth.uid(), 'admin') OR sales.cashier_id = auth.uid())
    )
  );

CREATE POLICY "Cashiers and admins can create sale items"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales
      WHERE sales.id = sale_items.sale_id
      AND sales.cashier_id = auth.uid()
    )
  );

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Insert sample categories
INSERT INTO public.categories (name, description) VALUES
  ('Stationery', 'Office and school supplies'),
  ('Electronics', 'Electronic devices and accessories'),
  ('Food & Drinks', 'Food items and beverages'),
  ('Clothing', 'Apparel and fashion items');

-- Insert sample products
INSERT INTO public.products (sku, barcode, name, category_id, unit_cost, retail_price, stock_on_hand, reorder_level) VALUES
  ('STN001', '1234567890001', 'A4 Paper Ream', (SELECT id FROM categories WHERE name = 'Stationery'), 300.00, 450.00, 50, 10),
  ('STN002', '1234567890002', 'Blue Pen Box (50pcs)', (SELECT id FROM categories WHERE name = 'Stationery'), 250.00, 380.00, 30, 10),
  ('ELC001', '1234567890003', 'USB Flash Drive 32GB', (SELECT id FROM categories WHERE name = 'Electronics'), 800.00, 1200.00, 25, 5),
  ('ELC002', '1234567890004', 'HDMI Cable 2m', (SELECT id FROM categories WHERE name = 'Electronics'), 400.00, 650.00, 15, 5),
  ('FD001', '1234567890005', 'Bottled Water 500ml (24pack)', (SELECT id FROM categories WHERE name = 'Food & Drinks'), 350.00, 550.00, 8, 15),
  ('FD002', '1234567890006', 'Tea Bags (100pcs)', (SELECT id FROM categories WHERE name = 'Food & Drinks'), 180.00, 280.00, 40, 10),
  ('CLT001', '1234567890007', 'Cotton T-Shirt', (SELECT id FROM categories WHERE name = 'Clothing'), 450.00, 750.00, 20, 10),
  ('CLT002', '1234567890008', 'Work Gloves (Pair)', (SELECT id FROM categories WHERE name = 'Clothing'), 120.00, 200.00, 3, 15);