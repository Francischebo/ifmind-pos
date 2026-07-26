export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          business_name: string | null
          created_at: string | null
          credit_balance: number | null
          credit_limit: number | null
          credit_terms: string | null
          email: string | null
          id: string
          is_business: boolean | null
          is_frequent: boolean | null
          name: string
          phone: string
          purchase_count: number | null
          tax_pin: string | null
          total_purchases: number | null
          updated_at: string | null
        }
        Insert: {
          business_name?: string | null
          created_at?: string | null
          credit_balance?: number | null
          credit_limit?: number | null
          credit_terms?: string | null
          email?: string | null
          id?: string
          is_business?: boolean | null
          is_frequent?: boolean | null
          name: string
          phone: string
          purchase_count?: number | null
          tax_pin?: string | null
          total_purchases?: number | null
          updated_at?: string | null
        }
        Update: {
          business_name?: string | null
          created_at?: string | null
          credit_balance?: number | null
          credit_limit?: number | null
          credit_terms?: string | null
          email?: string | null
          id?: string
          is_business?: boolean | null
          is_frequent?: boolean | null
          name?: string
          phone?: string
          purchase_count?: number | null
          tax_pin?: string | null
          total_purchases?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      delivery_note_items: {
        Row: {
          batch_number: string | null
          created_at: string
          delivery_note_id: string
          expiry_date: string | null
          id: string
          line_total: number
          ordered_quantity: number
          po_item_id: string | null
          product_id: string
          received_quantity: number
          rejected_quantity: number
          rejection_reason: string | null
          unit_cost: number
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          delivery_note_id: string
          expiry_date?: string | null
          id?: string
          line_total: number
          ordered_quantity: number
          po_item_id?: string | null
          product_id: string
          received_quantity: number
          rejected_quantity?: number
          rejection_reason?: string | null
          unit_cost: number
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          delivery_note_id?: string
          expiry_date?: string | null
          id?: string
          line_total?: number
          ordered_quantity?: number
          po_item_id?: string | null
          product_id?: string
          received_quantity?: number
          rejected_quantity?: number
          rejection_reason?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_note_items_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_po_item_id_fkey"
            columns: ["po_item_id"]
            isOneToOne: false
            referencedRelation: "po_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_note_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_notes: {
        Row: {
          created_at: string
          delivery_date: string
          grn_number: string
          id: string
          notes: string | null
          po_id: string
          received_by: string
          status: string
          total_items: number
          total_value: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string
          grn_number: string
          id?: string
          notes?: string | null
          po_id: string
          received_by: string
          status?: string
          total_items?: number
          total_value?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          delivery_date?: string
          grn_number?: string
          id?: string
          notes?: string | null
          po_id?: string
          received_by?: string
          status?: string
          total_items?: number
          total_value?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          mpesa_receipt: string | null
          notes: string | null
          payment_method: string
          received_by: string
          reference_number: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          mpesa_receipt?: string | null
          notes?: string | null
          payment_method: string
          received_by: string
          reference_number?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          mpesa_receipt?: string | null
          notes?: string | null
          payment_method?: string
          received_by?: string
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_due: number
          created_at: string
          created_by: string
          customer_id: string | null
          discount_amount: number
          due_date: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          notes: string | null
          paid_amount: number
          paid_at: string | null
          sale_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          balance_due?: number
          created_at?: string
          created_by: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          balance_due?: number
          created_at?: string
          created_by?: string
          customer_id?: string | null
          discount_amount?: number
          due_date?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          notes?: string | null
          paid_amount?: number
          paid_at?: string | null
          sale_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_members: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          points: number
          tier: string
          total_spent: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          points?: number
          tier?: string
          total_spent?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          points?: number
          tier?: string
          total_spent?: number
        }
        Relationships: []
      }
      mpesa_transactions: {
        Row: {
          amount: number
          callback_data: Json | null
          callback_received: boolean | null
          checkout_request_id: string | null
          created_at: string | null
          id: string
          merchant_request_id: string | null
          mpesa_receipt_number: string | null
          phone_number: string
          result_desc: string | null
          sale_id: string | null
          status: string | null
          transaction_code: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          callback_data?: Json | null
          callback_received?: boolean | null
          checkout_request_id?: string | null
          created_at?: string | null
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          phone_number: string
          result_desc?: string | null
          sale_id?: string | null
          status?: string | null
          transaction_code: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          callback_data?: Json | null
          callback_received?: boolean | null
          checkout_request_id?: string | null
          created_at?: string | null
          id?: string
          merchant_request_id?: string | null
          mpesa_receipt_number?: string | null
          phone_number?: string
          result_desc?: string | null
          sale_id?: string | null
          status?: string | null
          transaction_code?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      po_items: {
        Row: {
          created_at: string | null
          id: string
          po_id: string
          product_id: string
          quantity: number
          received_quantity: number | null
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          po_id: string
          product_id: string
          quantity: number
          received_quantity?: number | null
          unit_cost: number
        }
        Update: {
          created_at?: string | null
          id?: string
          po_id?: string
          product_id?: string
          quantity?: number
          received_quantity?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string | null
          id: string
          location: string | null
          name: string
          reorder_level: number | null
          retail_price: number
          sku: string
          stock_on_hand: number | null
          tax_rate: number | null
          unit_cost: number
          unit_of_measure: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          name: string
          reorder_level?: number | null
          retail_price: number
          sku: string
          stock_on_hand?: number | null
          tax_rate?: number | null
          unit_cost: number
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          name?: string
          reorder_level?: number | null
          retail_price?: number
          sku?: string
          stock_on_hand?: number | null
          tax_rate?: number | null
          unit_cost?: number
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          notes: string | null
          po_number: string
          status: string | null
          total_amount: number | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          notes?: string | null
          po_number: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          notes?: string | null
          po_number?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string
          refund_method: string
          return_amount: number
          return_items: Json | null
          sale_id: string
          status: string
          stock_restored: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          refund_method: string
          return_amount: number
          return_items?: Json | null
          sale_id: string
          status?: string
          stock_restored?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          refund_method?: string
          return_amount?: number
          return_items?: Json | null
          sale_id?: string
          status?: string
          stock_restored?: boolean | null
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          created_at: string | null
          id: string
          line_total: number
          product_id: string
          quantity: number
          sale_id: string
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_total: number
          product_id: string
          quantity: number
          sale_id: string
          tax_rate: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          line_total?: number
          product_id?: string
          quantity?: number
          sale_id?: string
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_amount: number | null
          cashier_id: string
          change_amount: number | null
          created_at: string | null
          customer_id: string | null
          id: string
          loyalty_discount: number | null
          loyalty_points_earned: number | null
          loyalty_points_redeemed: number | null
          mpesa_amount: number | null
          mpesa_receipt_number: string | null
          payment_method: string
          payment_status: string
          status: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Insert: {
          cash_amount?: number | null
          cashier_id: string
          change_amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          loyalty_discount?: number | null
          loyalty_points_earned?: number | null
          loyalty_points_redeemed?: number | null
          mpesa_amount?: number | null
          mpesa_receipt_number?: string | null
          payment_method: string
          payment_status?: string
          status?: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
        }
        Update: {
          cash_amount?: number | null
          cashier_id?: string
          change_amount?: number | null
          created_at?: string | null
          customer_id?: string | null
          id?: string
          loyalty_discount?: number | null
          loyalty_points_earned?: number | null
          loyalty_points_redeemed?: number | null
          mpesa_amount?: number | null
          mpesa_receipt_number?: string | null
          payment_method?: string
          payment_status?: string
          status?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          closing_cash: number | null
          created_at: string
          end_time: string | null
          id: string
          opening_cash: number
          start_time: string
          status: string
          total_sales: number
          user_id: string
        }
        Insert: {
          closing_cash?: number | null
          created_at?: string
          end_time?: string | null
          id?: string
          opening_cash: number
          start_time?: string
          status?: string
          total_sales?: number
          user_id: string
        }
        Update: {
          closing_cash?: number | null
          created_at?: string
          end_time?: string | null
          id?: string
          opening_cash?: number
          start_time?: string
          status?: string
          total_sales?: number
          user_id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          location_id: string | null
          movement_type: string
          notes: string | null
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string
          unit_cost: number | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          location_id?: string | null
          movement_type: string
          notes?: string | null
          product_id: string
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id?: string | null
          reference_type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string | null
          movement_type?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          balance_due: number
          created_at: string
          created_by: string
          delivery_note_id: string | null
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid_amount: number
          payment_terms: string | null
          po_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          balance_due?: number
          created_at?: string
          created_by: string
          delivery_note_id?: string | null
          due_date: string
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          paid_amount?: number
          payment_terms?: string | null
          po_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          balance_due?: number
          created_at?: string
          created_by?: string
          delivery_note_id?: string | null
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          paid_amount?: number
          payment_terms?: string | null
          po_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_delivery_note_id_fkey"
            columns: ["delivery_note_id"]
            isOneToOne: false
            referencedRelation: "delivery_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_by: string
          payment_date: string
          payment_method: string
          reference_number: string | null
          supplier_invoice_id: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_by: string
          payment_date?: string
          payment_method: string
          reference_number?: string | null
          supplier_invoice_id: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_by?: string
          payment_date?: string
          payment_method?: string
          reference_number?: string | null
          supplier_invoice_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          outstanding_balance: number | null
          payment_terms: string | null
          phone: string | null
          total_paid: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          outstanding_balance?: number | null
          payment_terms?: string | null
          phone?: string | null
          total_paid?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          outstanding_balance?: number | null
          payment_terms?: string | null
          phone?: string | null
          total_paid?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_stock: {
        Args: { product_id: string; quantity_change: number }
        Returns: undefined
      }
      generate_grn_number: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      get_user_mfa_status: { Args: { user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_stock: {
        Args: { product_id: string; quantity_change: number }
        Returns: undefined
      }
      process_delivery_note: {
        Args: { p_delivery_note_id: string }
        Returns: boolean
      }
      process_return_stock: { Args: { p_return_id: string }; Returns: boolean }
      record_stock_movement: {
        Args: {
          p_created_by?: string
          p_movement_type: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_type: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "cashier"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "cashier"],
    },
  },
} as const
