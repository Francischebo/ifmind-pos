#!/usr/bin/env node

/**
 * Database Migration Helper Script
 * Helps apply migrations to Supabase instance
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationHelper {
  constructor() {
    this.migrationFile = path.join(__dirname, 'database_migrations.sql');
  }

  validateMigrationFile() {
    console.log('🔍 Validating migration file...');

    if (!fs.existsSync(this.migrationFile)) {
      console.error('❌ Migration file not found:', this.migrationFile);
      return false;
    }

    const content = fs.readFileSync(this.migrationFile, 'utf8');

    // Check for required components
    const checks = [
      { pattern: /CREATE TYPE public\.app_role/, name: 'User roles enum' },
      { pattern: /CREATE TABLE.*user_roles/, name: 'User roles table' },
      { pattern: /CREATE TABLE.*error_logs/, name: 'Error logging table' },
      { pattern: /CREATE TABLE.*rate_limits/, name: 'Rate limiting table' },
      { pattern: /CREATE TABLE.*csrf_tokens/, name: 'CSRF protection table' },
      { pattern: /CREATE TABLE.*user_sessions/, name: 'Session management table' },
      { pattern: /encrypt_sensitive_data/, name: 'Encryption functions' },
      { pattern: /ENABLE ROW LEVEL SECURITY/, name: 'RLS policies' }
    ];

    let allValid = true;
    checks.forEach(({ pattern, name }) => {
      if (!pattern.test(content)) {
        console.error(`❌ Missing: ${name}`);
        allValid = false;
      } else {
        console.log(`✅ Found: ${name}`);
      }
    });

    return allValid;
  }

  generateMigrationSummary() {
    console.log('\n📋 Migration Summary:');
    console.log('========================');

    const content = fs.readFileSync(this.migrationFile, 'utf8');
    const migrations = content.split('-- Migration').filter(m => m.trim());

    migrations.forEach((migration, index) => {
      const lines = migration.split('\n');
      const title = lines[0].replace('--', '').trim();
      console.log(`${index}: ${title}`);
    });

    console.log(`\nTotal migrations: ${migrations.length}`);
  }

  showApplicationInstructions() {
    console.log('\n🚀 How to Apply Migrations:');
    console.log('===========================');
    console.log('1. Open your Supabase Dashboard');
    console.log('2. Go to SQL Editor');
    console.log('3. Copy the entire content of database_migrations.sql');
    console.log('4. Paste into SQL Editor');
    console.log('5. Click "Run" to execute all migrations');
    console.log('6. Verify no errors occurred');
    console.log('7. Check that all tables and functions were created');

    console.log('\n🔍 Verification Queries:');
    console.log('========================');
    console.log('-- Check if tables exist:');
    console.log("SELECT tablename FROM pg_tables WHERE schemaname = 'public';");

    console.log('\n-- Check if functions exist:');
    console.log("SELECT proname FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');");

    console.log('\n-- Check RLS status:');
    console.log("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';");
  }

  run() {
    console.log('🗄️  Database Migration Helper');
    console.log('============================\n');

    if (!this.validateMigrationFile()) {
      console.error('\n❌ Migration file validation failed!');
      process.exit(1);
    }

    this.generateMigrationSummary();
    this.showApplicationInstructions();

    console.log('\n✅ Migration file is ready for deployment!');
    console.log('📁 File location:', this.migrationFile);
  }
}

// Run the helper
const helper = new MigrationHelper();
helper.run();