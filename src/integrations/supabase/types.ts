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
      ai_conversations: {
        Row: {
          agent: string
          company_id: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent?: string
          company_id: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent?: string
          company_id?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          parts: Json
          role: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          parts?: Json
          role: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          parts?: Json
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
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
      chart_of_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          company_id: string
          created_at: string
          id: string
          is_active: boolean
          is_postable: boolean
          name: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: Database["public"]["Enums"]["account_type"]
          code: string
          company_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_postable?: boolean
          name: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_postable?: boolean
          name?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
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
      employees: {
        Row: {
          bank_account: string | null
          base_salary: number
          code: string
          company_id: string
          created_at: string
          department: string | null
          document_number: string | null
          email: string | null
          full_name: string
          hire_date: string | null
          id: string
          notes: string | null
          payment_method: string | null
          phone: string | null
          position: string | null
          status: Database["public"]["Enums"]["employee_status"]
          termination_date: string | null
          updated_at: string
        }
        Insert: {
          bank_account?: string | null
          base_salary?: number
          code: string
          company_id: string
          created_at?: string
          department?: string | null
          document_number?: string | null
          email?: string | null
          full_name: string
          hire_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          position?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Update: {
          bank_account?: string | null
          base_salary?: number
          code?: string
          company_id?: string
          created_at?: string
          department?: string | null
          document_number?: string | null
          email?: string | null
          full_name?: string
          hire_date?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          position?: string | null
          status?: Database["public"]["Enums"]["employee_status"]
          termination_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          ap_id: string | null
          bank_account_id: string | null
          category: string | null
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          doc_number: string
          due_date: string | null
          expense_account_id: string | null
          expense_date: string
          id: string
          journal_entry_id: string | null
          payment_method: string
          status: Database["public"]["Enums"]["expense_status"]
          subtotal: number
          supplier_id: string | null
          supplier_invoice: string | null
          tax_amount: number
          total: number
          treasury_txn_id: string | null
          updated_at: string
        }
        Insert: {
          ap_id?: string | null
          bank_account_id?: string | null
          category?: string | null
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          doc_number: string
          due_date?: string | null
          expense_account_id?: string | null
          expense_date?: string
          id?: string
          journal_entry_id?: string | null
          payment_method?: string
          status?: Database["public"]["Enums"]["expense_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice?: string | null
          tax_amount?: number
          total?: number
          treasury_txn_id?: string | null
          updated_at?: string
        }
        Update: {
          ap_id?: string | null
          bank_account_id?: string | null
          category?: string | null
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          doc_number?: string
          due_date?: string | null
          expense_account_id?: string | null
          expense_date?: string
          id?: string
          journal_entry_id?: string | null
          payment_method?: string
          status?: Database["public"]["Enums"]["expense_status"]
          subtotal?: number
          supplier_id?: string | null
          supplier_invoice?: string | null
          tax_amount?: number
          total?: number
          treasury_txn_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_ap_id_fkey"
            columns: ["ap_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_expense_account_id_fkey"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_treasury_txn_id_fkey"
            columns: ["treasury_txn_id"]
            isOneToOne: false
            referencedRelation: "treasury_transactions"
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
      journal_entries: {
        Row: {
          company_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          description: string | null
          doc_number: string
          entry_date: string
          id: string
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["journal_status"]
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          company_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_number: string
          entry_date?: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doc_number?: string
          entry_date?: string
          id?: string
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["journal_status"]
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
          third_party_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
          third_party_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
          third_party_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_third_party_id_fkey"
            columns: ["third_party_id"]
            isOneToOne: false
            referencedRelation: "third_parties"
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
      payroll_items: {
        Row: {
          base_salary: number
          bonuses: number
          created_at: string
          employee_id: string
          gross_amount: number
          health_deduction: number
          id: string
          net_amount: number
          notes: string | null
          other_deductions: number
          overtime: number
          payroll_period_id: string
          pension_deduction: number
          worked_days: number
        }
        Insert: {
          base_salary?: number
          bonuses?: number
          created_at?: string
          employee_id: string
          gross_amount?: number
          health_deduction?: number
          id?: string
          net_amount?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_period_id: string
          pension_deduction?: number
          worked_days?: number
        }
        Update: {
          base_salary?: number
          bonuses?: number
          created_at?: string
          employee_id?: string
          gross_amount?: number
          health_deduction?: number
          id?: string
          net_amount?: number
          notes?: string | null
          other_deductions?: number
          overtime?: number
          payroll_period_id?: string
          pension_deduction?: number
          worked_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          doc_number: string
          frequency: string
          id: string
          journal_entry_id: string | null
          liquidated_at: string | null
          liquidated_by: string | null
          name: string
          notes: string | null
          pay_date: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["payroll_status"]
          total_deductions: number
          total_gross: number
          total_net: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          doc_number: string
          frequency?: string
          id?: string
          journal_entry_id?: string | null
          liquidated_at?: string | null
          liquidated_by?: string | null
          name: string
          notes?: string | null
          pay_date?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          doc_number?: string
          frequency?: string
          id?: string
          journal_entry_id?: string | null
          liquidated_at?: string | null
          liquidated_by?: string | null
          name?: string
          notes?: string | null
          pay_date?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["payroll_status"]
          total_deductions?: number
          total_gross?: number
          total_net?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
      admin_create_demo_company_for_user: {
        Args: { _legal_name: string; _tax_id: string; _user_id: string }
        Returns: string
      }
      close_pos_session: {
        Args: { _counted: number; _session_id: string }
        Returns: undefined
      }
      confirm_expense: { Args: { _expense_id: string }; Returns: string }
      confirm_inventory_movement: {
        Args: { _movement_id: string }
        Returns: undefined
      }
      confirm_journal_entry: { Args: { _je_id: string }; Returns: undefined }
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
      liquidate_payroll_period: {
        Args: { _period_id: string }
        Returns: undefined
      }
      next_accounting_number: {
        Args: { _company_id: string; _kind: string }
        Returns: string
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
      report_ap_aging: {
        Args: { _company_id: string }
        Returns: {
          bucket: string
          doc_count: number
          total: number
        }[]
      }
      report_ar_aging: {
        Args: { _company_id: string }
        Returns: {
          bucket: string
          doc_count: number
          total: number
        }[]
      }
      report_cashflow_by_day: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          day: string
          inflow: number
          net: number
          outflow: number
        }[]
      }
      report_expenses_by_category: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          category: string
          doc_count: number
          total: number
        }[]
      }
      report_inventory_value: {
        Args: { _company_id: string }
        Returns: {
          sku_count: number
          total_qty: number
          total_value: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      report_low_stock: {
        Args: { _company_id: string; _limit?: number }
        Returns: {
          current_qty: number
          min_stock: number
          name: string
          product_id: string
          sku: string
        }[]
      }
      report_pnl: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          cogs: number
          expenses: number
          gross_profit: number
          net_profit: number
          revenue: number
        }[]
      }
      report_purchases_summary: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          avg_order: number
          total_orders: number
          total_purchases: number
        }[]
      }
      report_reorder_suggestions: {
        Args: { p_company_id: string; p_days?: number }
        Returns: {
          avg_daily_sales: number
          days_of_stock: number
          min_stock: number
          name: string
          product_id: string
          reason: string
          sku: string
          suggested_qty: number
          total_stock: number
        }[]
      }
      report_sales_by_day: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          day: string
          orders: number
          total: number
        }[]
      }
      report_sales_summary: {
        Args: { _company_id: string; _from: string; _to: string }
        Returns: {
          avg_ticket: number
          cash_sales: number
          credit_sales: number
          gross_margin: number
          total_cost: number
          total_orders: number
          total_sales: number
        }[]
      }
      report_smart_alerts: {
        Args: { p_company_id: string }
        Returns: {
          amount: number
          category: string
          detail: string
          reference_id: string
          severity: string
          title: string
        }[]
      }
      report_top_customers: {
        Args: {
          _company_id: string
          _from: string
          _limit?: number
          _to: string
        }
        Returns: {
          customer_id: string
          name: string
          orders: number
          revenue: number
        }[]
      }
      report_top_products: {
        Args: {
          _company_id: string
          _from: string
          _limit?: number
          _to: string
        }
        Returns: {
          cost: number
          margin: number
          name: string
          product_id: string
          qty: number
          revenue: number
          sku: string
        }[]
      }
      seed_chart_of_accounts: {
        Args: { _company_id: string }
        Returns: undefined
      }
      seed_demo_data: { Args: { _company_id: string }; Returns: Json }
      void_treasury_transaction: {
        Args: { _txn_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type:
        | "activo"
        | "pasivo"
        | "patrimonio"
        | "ingreso"
        | "gasto"
        | "costo"
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
      employee_status: "activo" | "inactivo" | "retirado"
      expense_status: "borrador" | "confirmado" | "pagado" | "anulado"
      journal_status: "borrador" | "confirmado" | "anulado"
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
      payroll_status: "borrador" | "liquidada" | "pagada" | "anulada"
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
      account_type: [
        "activo",
        "pasivo",
        "patrimonio",
        "ingreso",
        "gasto",
        "costo",
      ],
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
      employee_status: ["activo", "inactivo", "retirado"],
      expense_status: ["borrador", "confirmado", "pagado", "anulado"],
      journal_status: ["borrador", "confirmado", "anulado"],
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
      payroll_status: ["borrador", "liquidada", "pagada", "anulada"],
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
