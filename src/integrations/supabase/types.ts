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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          balance: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          doc_number: string
          due_date: string | null
          id: string
          invoice_date: string
          notes: string | null
          paid_amount: number
          receipt_id: string | null
          status: Database["public"]["Enums"]["ap_status"]
          supplier_id: string
          supplier_invoice: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_number: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_amount?: number
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["ap_status"]
          supplier_id: string
          supplier_invoice?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          doc_number?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_amount?: number
          receipt_id?: string | null
          status?: Database["public"]["Enums"]["ap_status"]
          supplier_id?: string
          supplier_invoice?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          balance: number
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          doc_number: string
          due_date: string | null
          id: string
          invoice_date: string
          notes: string | null
          paid_amount: number
          sales_order_id: string | null
          status: Database["public"]["Enums"]["ar_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          balance?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          doc_number: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_amount?: number
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["ar_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          doc_number?: string
          due_date?: string | null
          id?: string
          invoice_date?: string
          notes?: string | null
          paid_amount?: number
          sales_order_id?: string | null
          status?: Database["public"]["Enums"]["ar_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changes: Json | null
          company_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          bank_name: string | null
          company_id: string
          created_at: string
          currency: string
          current_balance: number
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["bank_account_kind"]
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          bank_name?: string | null
          company_id: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["bank_account_kind"]
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          bank_name?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          current_balance?: number
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["bank_account_kind"]
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          code: string | null
          created_at: string
          department_id: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          email: string | null
          id: string
          is_active: boolean
          legal_name: string
          logo_url: string | null
          phone: string | null
          tax_id: string
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name: string
          logo_url?: string | null
          phone?: string | null
          tax_id: string
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string
          logo_url?: string | null
          phone?: string | null
          tax_id?: string
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string | null
          country_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string | null
          country_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string | null
          country_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movement_lines: {
        Row: {
          created_at: string
          id: string
          lot_id: string | null
          movement_id: string
          notes: string | null
          product_id: string
          quantity: number
          serial_number: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          lot_id?: string | null
          movement_id: string
          notes?: string | null
          product_id: string
          quantity: number
          serial_number?: string | null
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          lot_id?: string | null
          movement_id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          serial_number?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_lines_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_lines_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          doc_number: string
          id: string
          movement_date: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          reference: string | null
          status: Database["public"]["Enums"]["movement_status"]
          third_party_id: string | null
          updated_at: string
          warehouse_from_id: string | null
          warehouse_to_id: string | null
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number: string
          id?: string
          movement_date?: string
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          third_party_id?: string | null
          updated_at?: string
          warehouse_from_id?: string | null
          warehouse_to_id?: string | null
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number?: string
          id?: string
          movement_date?: string
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["movement_status"]
          third_party_id?: string | null
          updated_at?: string
          warehouse_from_id?: string | null
          warehouse_to_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_third_party_id_fkey"
            columns: ["third_party_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_from_id_fkey"
            columns: ["warehouse_from_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_warehouse_to_id_fkey"
            columns: ["warehouse_to_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      kardex: {
        Row: {
          balance_avg_cost: number
          balance_qty: number
          balance_value: number
          company_id: string
          created_at: string
          direction: Database["public"]["Enums"]["kardex_direction"]
          id: string
          lot_id: string | null
          movement_date: string
          movement_id: string
          movement_line_id: string | null
          product_id: string
          quantity: number
          total_cost: number
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          balance_avg_cost: number
          balance_qty: number
          balance_value: number
          company_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["kardex_direction"]
          id?: string
          lot_id?: string | null
          movement_date: string
          movement_id: string
          movement_line_id?: string | null
          product_id: string
          quantity: number
          total_cost: number
          unit_cost: number
          warehouse_id: string
        }
        Update: {
          balance_avg_cost?: number
          balance_qty?: number
          balance_value?: number
          company_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["kardex_direction"]
          id?: string
          lot_id?: string | null
          movement_date?: string
          movement_id?: string
          movement_line_id?: string | null
          product_id?: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kardex_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_movement_line_id_fkey"
            columns: ["movement_line_id"]
            isOneToOne: false
            referencedRelation: "inventory_movement_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kardex_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_applications: {
        Row: {
          amount: number
          ap_id: string | null
          ar_id: string | null
          created_at: string
          id: string
          treasury_txn_id: string
        }
        Insert: {
          amount: number
          ap_id?: string | null
          ar_id?: string | null
          created_at?: string
          id?: string
          treasury_txn_id: string
        }
        Update: {
          amount?: number
          ap_id?: string | null
          ar_id?: string | null
          created_at?: string
          id?: string
          treasury_txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_applications_ap_id_fkey"
            columns: ["ap_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_applications_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_applications_treasury_txn_id_fkey"
            columns: ["treasury_txn_id"]
            isOneToOne: false
            referencedRelation: "treasury_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sessions: {
        Row: {
          cashier_id: string
          closed_at: string | null
          company_id: string
          counted_amount: number
          created_at: string
          difference: number
          doc_number: string
          expected_amount: number
          id: string
          notes: string | null
          opened_at: string
          opening_amount: number
          status: Database["public"]["Enums"]["pos_session_status"]
          total_sales: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          cashier_id: string
          closed_at?: string | null
          company_id: string
          counted_amount?: number
          created_at?: string
          difference?: number
          doc_number: string
          expected_amount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          total_sales?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          cashier_id?: string
          closed_at?: string | null
          company_id?: string
          counted_amount?: number
          created_at?: string
          difference?: number
          doc_number?: string
          expected_amount?: number
          id?: string
          notes?: string | null
          opened_at?: string
          opening_amount?: number
          status?: Database["public"]["Enums"]["pos_session_status"]
          total_sales?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sessions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          company_id: string
          created_at: string
          expires_at: string | null
          id: string
          lot_code: string
          notes: string | null
          product_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          lot_code: string
          notes?: string | null
          product_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          lot_code?: string
          notes?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
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
          brand_id: string | null
          category_id: string | null
          company_id: string
          cost_price: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_stock: number | null
          min_stock: number
          name: string
          sale_price: number
          sku: string
          tax_rate: number
          uom_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_stock?: number | null
          min_stock?: number
          name: string
          sale_price?: number
          sku: string
          tax_rate?: number
          uom_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          category_id?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_stock?: number | null
          min_stock?: number
          name?: string
          sale_price?: number
          sku?: string
          tax_rate?: number
          uom_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_uom_id_fkey"
            columns: ["uom_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_quantity: number
          subtotal: number
          tax_percent: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_quantity?: number
          subtotal?: number
          tax_percent?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          received_quantity?: number
          subtotal?: number
          tax_percent?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          doc_number: string
          expected_date: string | null
          id: string
          notes: string | null
          order_date: string
          status: Database["public"]["Enums"]["purchase_order_status"]
          subtotal: number
          supplier_id: string
          tax_amount: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          doc_number: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          doc_number?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_lines: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_line_id: string | null
          quantity: number
          receipt_id: string
          subtotal: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_line_id?: string | null
          quantity: number
          receipt_id: string
          subtotal?: number
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_line_id?: string | null
          quantity?: number
          receipt_id?: string
          subtotal?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_lines_purchase_order_line_id_fkey"
            columns: ["purchase_order_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "purchase_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipts: {
        Row: {
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          doc_number: string
          due_date: string | null
          id: string
          inventory_movement_id: string | null
          invoice_date: string | null
          notes: string | null
          purchase_order_id: string | null
          receipt_date: string
          status: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          supplier_invoice: string | null
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number: string
          due_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          invoice_date?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id: string
          supplier_invoice?: string | null
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number?: string
          due_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          invoice_date?: string | null
          notes?: string | null
          purchase_order_id?: string | null
          receipt_date?: string
          status?: Database["public"]["Enums"]["purchase_receipt_status"]
          supplier_id?: string
          supplier_invoice?: string | null
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_lines: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          product_id: string
          quantity: number
          sales_order_id: string
          subtotal: number
          tax_percent: number
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          product_id: string
          quantity: number
          sales_order_id: string
          subtotal?: number
          tax_percent?: number
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          product_id?: string
          quantity?: number
          sales_order_id?: string
          subtotal?: number
          tax_percent?: number
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_lines_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          balance: number
          channel: Database["public"]["Enums"]["sales_channel"]
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          discount_amount: number
          doc_number: string
          due_date: string | null
          id: string
          inventory_movement_id: string | null
          notes: string | null
          order_date: string
          paid_amount: number
          payment_method: Database["public"]["Enums"]["payment_method"]
          pos_session_id: string | null
          status: Database["public"]["Enums"]["sales_order_status"]
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          balance?: number
          channel?: Database["public"]["Enums"]["sales_channel"]
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          doc_number: string
          due_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          notes?: string | null
          order_date?: string
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          pos_session_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          balance?: number
          channel?: Database["public"]["Enums"]["sales_channel"]
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          discount_amount?: number
          doc_number?: string
          due_date?: string | null
          id?: string
          inventory_movement_id?: string | null
          notes?: string | null
          order_date?: string
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"]
          pos_session_id?: string | null
          status?: Database["public"]["Enums"]["sales_order_status"]
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_pos_session_fk"
            columns: ["pos_session_id"]
            isOneToOne: false
            referencedRelation: "pos_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          avg_cost: number
          company_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          avg_cost?: number
          company_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          avg_cost?: number
          company_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      third_parties: {
        Row: {
          address: string | null
          city_id: string | null
          company_id: string
          created_at: string
          credit_limit: number
          document_number: string
          document_type: Database["public"]["Enums"]["document_type"]
          email: string | null
          id: string
          is_active: boolean
          is_client: boolean
          is_employee: boolean
          is_supplier: boolean
          is_vendor: boolean
          legal_name: string
          payment_terms_days: number
          phone: string | null
          trade_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          company_id: string
          created_at?: string
          credit_limit?: number
          document_number: string
          document_type?: Database["public"]["Enums"]["document_type"]
          email?: string | null
          id?: string
          is_active?: boolean
          is_client?: boolean
          is_employee?: boolean
          is_supplier?: boolean
          is_vendor?: boolean
          legal_name: string
          payment_terms_days?: number
          phone?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city_id?: string | null
          company_id?: string
          created_at?: string
          credit_limit?: number
          document_number?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          email?: string | null
          id?: string
          is_active?: boolean
          is_client?: boolean
          is_employee?: boolean
          is_supplier?: boolean
          is_vendor?: boolean
          legal_name?: string
          payment_terms_days?: number
          phone?: string | null
          trade_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "third_parties_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "third_parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      treasury_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          bank_account_to_id: string | null
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          doc_number: string
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          status: Database["public"]["Enums"]["treasury_txn_status"]
          third_party_id: string | null
          txn_date: string
          txn_type: Database["public"]["Enums"]["treasury_txn_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          bank_account_to_id?: string | null
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          status?: Database["public"]["Enums"]["treasury_txn_status"]
          third_party_id?: string | null
          txn_date?: string
          txn_type: Database["public"]["Enums"]["treasury_txn_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          bank_account_to_id?: string | null
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          doc_number?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          status?: Database["public"]["Enums"]["treasury_txn_status"]
          third_party_id?: string | null
          txn_date?: string
          txn_type?: Database["public"]["Enums"]["treasury_txn_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treasury_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_transactions_bank_account_to_id_fkey"
            columns: ["bank_account_to_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_transactions_third_party_id_fkey"
            columns: ["third_party_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          symbol: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          symbol?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      user_companies: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          address: string | null
          city_id: string | null
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          warehouse_type: Database["public"]["Enums"]["warehouse_type"]
        }
        Insert: {
          address?: string | null
          city_id?: string | null
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          warehouse_type?: Database["public"]["Enums"]["warehouse_type"]
        }
        Update: {
          address?: string | null
          city_id?: string | null
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          warehouse_type?: Database["public"]["Enums"]["warehouse_type"]
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      close_pos_session: {
        Args: { _counted: number; _session_id: string }
        Returns: undefined
      }
      confirm_inventory_movement: {
        Args: { _movement_id: string }
        Returns: undefined
      }
      confirm_purchase_receipt: {
        Args: { _receipt_id: string }
        Returns: string
      }
      confirm_sales_order: {
        Args: { _sales_order_id: string }
        Returns: string
      }
      confirm_treasury_transaction: {
        Args: { _txn_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      next_movement_number: {
        Args: {
          _company_id: string
          _type: Database["public"]["Enums"]["movement_type"]
        }
        Returns: string
      }
      next_purchase_number: {
        Args: { _company_id: string; _kind: string }
        Returns: string
      }
      next_sales_number: {
        Args: { _company_id: string; _kind: string }
        Returns: string
      }
      next_treasury_number: {
        Args: {
          _company_id: string
          _type: Database["public"]["Enums"]["treasury_txn_type"]
        }
        Returns: string
      }
      recalc_ap_status: { Args: { _ap_id: string }; Returns: undefined }
      recalc_ar_status: { Args: { _ar_id: string }; Returns: undefined }
      recalc_purchase_order_totals: {
        Args: { _po_id: string }
        Returns: undefined
      }
      void_treasury_transaction: {
        Args: { _txn_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ap_status: "pendiente" | "parcial" | "pagada" | "anulada"
      app_role:
        | "super_admin"
        | "admin"
        | "gerente"
        | "contador"
        | "vendedor"
        | "comprador"
        | "bodeguero"
        | "usuario"
      ar_status: "pendiente" | "parcial" | "cobrada" | "anulada"
      bank_account_kind: "caja" | "banco" | "tarjeta" | "otro"
      document_type: "NIT" | "CC" | "CE" | "PP" | "TI" | "RUT" | "OTRO"
      kardex_direction: "in" | "out"
      movement_status: "borrador" | "confirmado" | "anulado"
      movement_type:
        | "entrada"
        | "salida"
        | "traslado"
        | "ajuste_positivo"
        | "ajuste_negativo"
      payment_method:
        | "efectivo"
        | "tarjeta"
        | "transferencia"
        | "credito"
        | "mixto"
        | "otro"
      pos_session_status: "abierta" | "cerrada"
      purchase_order_status:
        | "borrador"
        | "aprobada"
        | "parcial"
        | "recibida"
        | "cancelada"
      purchase_receipt_status: "borrador" | "confirmada" | "cancelada"
      sales_channel: "pos" | "venta"
      sales_order_status: "borrador" | "confirmada" | "anulada"
      third_party_kind:
        | "cliente"
        | "proveedor"
        | "vendedor"
        | "empleado"
        | "otro"
      treasury_txn_status: "borrador" | "confirmado" | "anulado"
      treasury_txn_type:
        | "cobro"
        | "pago"
        | "transferencia"
        | "ajuste_positivo"
        | "ajuste_negativo"
      warehouse_type: "bodega" | "centro_distribucion" | "punto_venta"
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
      ap_status: ["pendiente", "parcial", "pagada", "anulada"],
      app_role: [
        "super_admin",
        "admin",
        "gerente",
        "contador",
        "vendedor",
        "comprador",
        "bodeguero",
        "usuario",
      ],
      ar_status: ["pendiente", "parcial", "cobrada", "anulada"],
      bank_account_kind: ["caja", "banco", "tarjeta", "otro"],
      document_type: ["NIT", "CC", "CE", "PP", "TI", "RUT", "OTRO"],
      kardex_direction: ["in", "out"],
      movement_status: ["borrador", "confirmado", "anulado"],
      movement_type: [
        "entrada",
        "salida",
        "traslado",
        "ajuste_positivo",
        "ajuste_negativo",
      ],
      payment_method: [
        "efectivo",
        "tarjeta",
        "transferencia",
        "credito",
        "mixto",
        "otro",
      ],
      pos_session_status: ["abierta", "cerrada"],
      purchase_order_status: [
        "borrador",
        "aprobada",
        "parcial",
        "recibida",
        "cancelada",
      ],
      purchase_receipt_status: ["borrador", "confirmada", "cancelada"],
      sales_channel: ["pos", "venta"],
      sales_order_status: ["borrador", "confirmada", "anulada"],
      third_party_kind: [
        "cliente",
        "proveedor",
        "vendedor",
        "empleado",
        "otro",
      ],
      treasury_txn_status: ["borrador", "confirmado", "anulado"],
      treasury_txn_type: [
        "cobro",
        "pago",
        "transferencia",
        "ajuste_positivo",
        "ajuste_negativo",
      ],
      warehouse_type: ["bodega", "centro_distribucion", "punto_venta"],
    },
  },
} as const
