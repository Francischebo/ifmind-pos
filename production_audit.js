#!/usr/bin/env node

/**
 * Production Security Audit Script
 * Comprehensive security validation for deployed POS system
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProductionSecurityAuditor {
  constructor() {
    this.auditResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      critical: 0,
      tests: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      info: '\x1b[36m',
      critical: '\x1b[35m',
      reset: '\x1b[0m'
    };

    const coloredMessage = `${colors[type] || colors.info}${message}${colors.reset}`;
    console.log(`[${timestamp}] ${coloredMessage}`);
  }

  addAuditResult(testName, passed, details = '', severity = 'low') {
    const result = {
      name: testName,
      passed,
      details,
      severity,
      timestamp: new Date().toISOString()
    };

    this.auditResults.tests.push(result);

    if (passed) {
      this.auditResults.passed++;
      this.log(`✅ ${testName}`, 'success');
    } else {
      if (severity === 'critical') {
        this.auditResults.critical++;
        this.log(`🚨 ${testName}: ${details}`, 'critical');
      } else if (severity === 'high') {
        this.auditResults.failed++;
        this.log(`❌ ${testName}: ${details}`, 'error');
      } else {
        this.auditResults.warnings++;
        this.log(`⚠️  ${testName}: ${details}`, 'warning');
      }
    }
  }

  // Test 1: Environment Security
  auditEnvironmentSecurity() {
    this.log('🔐 Auditing Environment Security...', 'info');

    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
      this.addAuditResult('Environment File', false, 'Production .env file missing', 'critical');
      return;
    }

    const envContent = fs.readFileSync(envPath, 'utf8');

    // Check for production values (not placeholders)
    const requiredProdVars = [
      'SUPABASE_SERVICE_ROLE_KEY',
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'RESEND_API_KEY'
    ];

    requiredProdVars.forEach(varName => {
      const regex = new RegExp(`${varName}="([^"]*)"`, 'g');
      const match = regex.exec(envContent);

      if (!match) {
        this.addAuditResult(`${varName} Config`, false, `${varName} not found`, 'critical');
      } else if (match[1].includes('your_') || match[1].includes('example')) {
        this.addAuditResult(`${varName} Config`, false, `${varName} contains placeholder value`, 'critical');
      } else {
        this.addAuditResult(`${varName} Config`, true);
      }
    });

    // Check encryption key strength
    const encKeyMatch = envContent.match(/ENCRYPTION_KEY="([^"]*)"/);
    if (encKeyMatch) {
      const key = encKeyMatch[1];
      if (key.length < 32) {
        this.addAuditResult('Encryption Key Strength', false, 'Encryption key too short (must be 32+ chars)', 'high');
      } else {
        this.addAuditResult('Encryption Key Strength', true);
      }
    }
  }

  // Test 2: Build Security
  auditBuildSecurity() {
    this.log('🏗️  Auditing Build Security...', 'info');

    const distDir = path.join(__dirname, 'dist');
    if (!fs.existsSync(distDir)) {
      this.addAuditResult('Production Build', false, 'dist directory not found - run build first', 'critical');
      return;
    }

    // Check for source maps in production
    const hasSourceMaps = this.hasSourceMaps(distDir);
    if (hasSourceMaps) {
      this.addAuditResult('Source Maps in Production', false, 'Source maps found in production build', 'high');
    } else {
      this.addAuditResult('Source Maps in Production', true);
    }

    // Check for sensitive data in build files
    const hasSensitiveData = this.checkForSensitiveData(distDir);
    if (hasSensitiveData) {
      this.addAuditResult('Sensitive Data in Build', false, 'Sensitive data found in production build', 'critical');
    } else {
      this.addAuditResult('Sensitive Data in Build', true);
    }
  }

  // Test 3: PWA Security
  auditPWASecurity() {
    this.log('📱 Auditing PWA Security...', 'info');

    const manifestPath = path.join(__dirname, 'dist', 'manifest.webmanifest');
    if (!fs.existsSync(manifestPath)) {
      this.addAuditResult('PWA Manifest', false, 'PWA manifest not found in production build', 'high');
      return;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Check manifest security
    if (!manifest.name || !manifest.short_name) {
      this.addAuditResult('PWA Manifest Content', false, 'Incomplete PWA manifest', 'medium');
    } else {
      this.addAuditResult('PWA Manifest Content', true);
    }

    // Check for HTTPS requirement
    if (manifest.start_url && !manifest.start_url.startsWith('https://')) {
      this.addAuditResult('PWA HTTPS Requirement', false, 'PWA start_url should use HTTPS', 'high');
    } else {
      this.addAuditResult('PWA HTTPS Requirement', true);
    }
  }

  // Test 4: Dependency Security
  auditDependencySecurity() {
    this.log('📦 Auditing Dependency Security...', 'info');

    const packagePath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(packagePath)) {
      this.addAuditResult('Package.json', false, 'package.json not found', 'high');
      return;
    }

    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

    // Check for security-critical dependencies
    const criticalDeps = [
      '@supabase/supabase-js',
      'vite-plugin-pwa'
    ];

    criticalDeps.forEach(dep => {
      const inDeps = packageJson.dependencies && packageJson.dependencies[dep];
      const inDevDeps = packageJson.devDependencies && packageJson.devDependencies[dep];

      if (inDeps || inDevDeps) {
        this.addAuditResult(`${dep} Dependency`, true);
      } else {
        this.addAuditResult(`${dep} Dependency`, false, `${dep} not found in dependencies`, 'high');
      }
    });
  }

  hasSourceMaps(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (this.hasSourceMaps(fullPath)) return true;
        } else if (item.endsWith('.map')) {
          return true;
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  checkForSensitiveData(dirPath) {
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (this.checkForSensitiveData(fullPath)) return true;
        } else if (item.endsWith('.js') || item.endsWith('.html')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Check for common sensitive patterns
          const sensitivePatterns = [
            /SUPABASE_SERVICE_ROLE_KEY/i,
            /MPESA_CONSUMER_SECRET/i,
            /private.*key/i,
            /password.*=/i
          ];

          if (sensitivePatterns.some(pattern => pattern.test(content))) {
            return true;
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
    return false;
  }

  generateReport() {
    console.log('\n📊 Production Security Audit Report');
    console.log('=====================================');
    console.log(`✅ Passed: ${this.auditResults.passed}`);
    console.log(`❌ Failed: ${this.auditResults.failed}`);
    console.log(`⚠️  Warnings: ${this.auditResults.warnings}`);
    console.log(`🚨 Critical: ${this.auditResults.critical}`);

    const total = this.auditResults.passed + this.auditResults.failed + this.auditResults.warnings + this.auditResults.critical;
    const successRate = total > 0 ? ((this.auditResults.passed / total) * 100).toFixed(1) : 0;
    console.log(`📈 Success Rate: ${successRate}%`);

    if (this.auditResults.critical > 0) {
      console.log('\n🚨 CRITICAL ISSUES FOUND - DO NOT DEPLOY!');
      console.log('Fix all critical issues before production deployment.');
    } else if (this.auditResults.failed > 0) {
      console.log('\n⚠️  SECURITY ISSUES FOUND');
      console.log('Address failed tests before production deployment.');
    } else {
      console.log('\n🎉 SECURITY AUDIT PASSED!');
      console.log('Your application is ready for production deployment.');
    }

    // Save detailed report
    const reportPath = path.join(__dirname, 'production_security_audit.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.auditResults, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  run() {
    console.log('🔒 Production Security Audit');
    console.log('============================\n');

    this.auditEnvironmentSecurity();
    this.auditBuildSecurity();
    this.auditPWASecurity();
    this.auditDependencySecurity();

    this.generateReport();

    // Exit with error code if critical issues found
    if (this.auditResults.critical > 0) {
      process.exit(1);
    }
  }
}

// Run the audit
const auditor = new ProductionSecurityAuditor();
auditor.run();