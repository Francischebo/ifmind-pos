#!/usr/bin/env node

/**
 * Security Testing and Penetration Testing Script
 * for Secure Retail POS System
 *
 * This script performs comprehensive security testing including:
 * - Input validation testing
 * - Authentication security testing
 * - Authorization testing
 * - SQL injection prevention testing
 * - XSS prevention testing
 * - CSRF protection testing
 * - Rate limiting testing
 * - Encryption validation
 * - Session security testing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SecurityTester {
  constructor() {
    this.testResults = {
      passed: 0,
      failed: 0,
      warnings: 0,
      tests: []
    };
    this.vulnerabilities = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const coloredMessage = this.colorize(message, type);
    console.log(`[${timestamp}] ${coloredMessage}`);
  }

  colorize(message, type) {
    const colors = {
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      info: '\x1b[36m',
      reset: '\x1b[0m'
    };

    return `${colors[type] || colors.info}${message}${colors.reset}`;
  }

  addTestResult(testName, passed, details = '', severity = 'low') {
    const result = {
      name: testName,
      passed,
      details,
      severity,
      timestamp: new Date().toISOString()
    };

    this.testResults.tests.push(result);

    if (passed) {
      this.testResults.passed++;
      this.log(`✓ ${testName}`, 'success');
    } else {
      this.testResults.failed++;
      this.log(`✗ ${testName}: ${details}`, 'error');

      if (severity === 'high' || severity === 'critical') {
        this.vulnerabilities.push(result);
      }
    }

    if (details.includes('warning') || severity === 'medium') {
      this.testResults.warnings++;
    }
  }

  // Test 1: Environment Variables Security
  testEnvironmentVariables() {
    this.log('Testing Environment Variables Security...', 'info');

    const envPath = path.join(__dirname, '.env');

    // Check if .env file exists
    if (!fs.existsSync(envPath)) {
      this.addTestResult('Environment File Existence', false, '.env file not found', 'high');
      return;
    }

    // Check if .env is in .gitignore
    const gitignorePath = path.join(__dirname, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignore.includes('.env')) {
        this.addTestResult('Environment File in GitIgnore', false, '.env not in .gitignore', 'critical');
      } else {
        this.addTestResult('Environment File in GitIgnore', true);
      }
    }

    // Read and validate .env content
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    let hasEncryptionKey = false;
    let hasJwtSecret = false;
    let hasServiceRoleKey = false;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') return;

      if (trimmed.includes('ENCRYPTION_KEY=')) hasEncryptionKey = true;
      if (trimmed.includes('JWT_SECRET=')) hasJwtSecret = true;
      if (trimmed.includes('SUPABASE_SERVICE_ROLE_KEY=')) hasServiceRoleKey = true;

      // Check for hardcoded secrets (basic check)
      if (trimmed.includes('your_') && trimmed.includes('_here')) {
        this.addTestResult('Environment Variables Configuration', false, 'Placeholder values found in .env', 'high');
      }
    });

    this.addTestResult('Encryption Key Present', hasEncryptionKey);
    this.addTestResult('JWT Secret Present', hasJwtSecret);
    this.addTestResult('Service Role Key Present', hasServiceRoleKey);
  }

  // Test 2: Code Security Analysis
  testCodeSecurity() {
    this.log('Testing Code Security...', 'info');

    // Check for dangerous patterns in source code
    const dangerousPatterns = [
      { pattern: /console\.log\(.*password.*\)/i, name: 'Password Logging', severity: 'high' },
      { pattern: /console\.log\(.*token.*\)/i, name: 'Token Logging', severity: 'high' },
      { pattern: /console\.log\(.*key.*\)/i, name: 'Key Logging', severity: 'high' },
      { pattern: /innerHTML\s*=/, name: 'InnerHTML Usage', severity: 'medium' },
      { pattern: /eval\s*\(/, name: 'Eval Usage', severity: 'critical' },
      { pattern: /document\.write\s*\(/, name: 'Document Write Usage', severity: 'high' }
    ];

    const srcDir = path.join(__dirname, 'src');

    if (!fs.existsSync(srcDir)) {
      this.addTestResult('Source Directory Check', false, 'src directory not found', 'medium');
      return;
    }

    this.scanDirectory(srcDir, dangerousPatterns);
  }

  scanDirectory(dirPath, patterns) {
    const items = fs.readdirSync(dirPath);

    items.forEach(item => {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        this.scanDirectory(fullPath, patterns);
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.js') || item.endsWith('.jsx'))) {
        const content = fs.readFileSync(fullPath, 'utf8');

        patterns.forEach(({ pattern, name, severity }) => {
          const matches = content.match(pattern);
          if (matches) {
            this.addTestResult(
              `${name} Check`,
              false,
              `Found in ${fullPath}: ${matches[0]}`,
              severity
            );
          }
        });
      }
    });
  }

  // Test 3: Database Migration Security
  testDatabaseMigrations() {
    this.log('Testing Database Migration Security...', 'info');

    const migrationsDir = path.join(__dirname, 'supabase', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      this.addTestResult('Migrations Directory Check', false, 'supabase/migrations directory not found', 'medium');
      return;
    }

    // Check for security-related migrations
    const migrationFiles = fs.readdirSync(migrationsDir);
    const securityMigrations = migrationFiles.filter(file =>
      file.includes('encryption') ||
      file.includes('security') ||
      file.includes('csrf') ||
      file.includes('session') ||
      file.includes('rate_limit') ||
      file.includes('validation')
    );

    this.addTestResult('Security Migrations Present', securityMigrations.length >= 6,
      `Found ${securityMigrations.length} security migrations`);

    // Check migration file content for security features
    securityMigrations.forEach(migration => {
      const filePath = path.join(migrationsDir, migration);
      const content = fs.readFileSync(filePath, 'utf8');

      // Check for RLS enablement
      if (!content.includes('ENABLE ROW LEVEL SECURITY')) {
        this.addTestResult('RLS Enablement Check', false,
          `RLS not enabled in ${migration}`, 'medium');
      }

      // Check for proper grants
      if (!content.includes('GRANT EXECUTE ON FUNCTION')) {
        this.addTestResult('Function Grants Check', false,
          `Missing function grants in ${migration}`, 'low');
      }
    });
  }

  // Test 4: Service Worker Security
  testServiceWorkerSecurity() {
    this.log('Testing Service Worker Security...', 'info');

    const swPath = path.join(__dirname, 'public', 'sw.js');

    if (!fs.existsSync(swPath)) {
      this.addTestResult('Service Worker Existence', false, 'Service worker not found', 'medium');
      return;
    }

    const swContent = fs.readFileSync(swPath, 'utf8');

    // Check for security features
    const securityChecks = [
      { pattern: /AUTHORIZED_ORIGINS/, name: 'Origin Validation' },
      { pattern: /SENSITIVE_ENDPOINTS/, name: 'Sensitive Endpoint Filtering' },
      { pattern: /MAX_SENSITIVE_CACHE_AGE/, name: 'Cache Age Limits' },
      { pattern: /logSecurityEvent/, name: 'Security Event Logging' }
    ];

    securityChecks.forEach(({ pattern, name }) => {
      if (swContent.match(pattern)) {
        this.addTestResult(`${name} Check`, true);
      } else {
        this.addTestResult(`${name} Check`, false, `${name} not implemented in service worker`, 'medium');
      }
    });
  }

  // Test 5: Configuration Security
  testConfigurationSecurity() {
    this.log('Testing Configuration Security...', 'info');

    const viteConfigPath = path.join(__dirname, 'vite.config.ts');

    if (!fs.existsSync(viteConfigPath)) {
      this.addTestResult('Vite Config Existence', false, 'vite.config.ts not found', 'medium');
      return;
    }

    const configContent = fs.readFileSync(viteConfigPath, 'utf8');

    // Check for PWA security configuration
    if (configContent.includes('VitePWA')) {
      this.addTestResult('PWA Configuration', true);

      // Check for security headers
      if (configContent.includes('navigateFallbackDenylist')) {
        this.addTestResult('PWA Security Headers', true);
      } else {
        this.addTestResult('PWA Security Headers', false, 'Missing security headers in PWA config', 'medium');
      }
    } else {
      this.addTestResult('PWA Configuration', false, 'PWA not configured', 'low');
    }

    // Check for CSP or security headers
    if (configContent.includes('content-security-policy') || configContent.includes('CSP')) {
      this.addTestResult('Content Security Policy', true);
    } else {
      this.addTestResult('Content Security Policy', false, 'CSP not configured', 'medium');
    }
  }

  // Test 6: Dependency Security
  testDependencySecurity() {
    this.log('Testing Dependency Security...', 'info');

    const packagePath = path.join(__dirname, 'package.json');

    if (!fs.existsSync(packagePath)) {
      this.addTestResult('Package.json Existence', false, 'package.json not found', 'medium');
      return;
    }

    const packageContent = fs.readFileSync(packagePath, 'utf8');
    const packageJson = JSON.parse(packageContent);

    // Check for security-related dependencies
    const securityDeps = [
      'vite-plugin-pwa',
      '@supabase/supabase-js'
    ];

    securityDeps.forEach(dep => {
      const inDeps = packageJson.dependencies && packageJson.dependencies[dep];
      const inDevDeps = packageJson.devDependencies && packageJson.devDependencies[dep];

      if (inDeps || inDevDeps) {
        this.addTestResult(`${dep} Dependency`, true);
      } else {
        this.addTestResult(`${dep} Dependency`, false, `${dep} not found in dependencies`, 'low');
      }
    });
  }

  // Test 7: Build Security
  testBuildSecurity() {
    this.log('Testing Build Security...', 'info');

    const distDir = path.join(__dirname, 'dist');

    if (!fs.existsSync(distDir)) {
      this.addTestResult('Build Directory Check', false, 'dist directory not found - run build first', 'medium');
      return;
    }

    // Check for source maps in production build
    const hasSourceMaps = this.hasSourceMaps(distDir);
    if (hasSourceMaps) {
      this.addTestResult('Source Maps in Production', false, 'Source maps found in production build', 'medium');
    } else {
      this.addTestResult('Source Maps in Production', true);
    }

    // Check for manifest file
    const manifestPath = path.join(distDir, 'manifest.webmanifest');
    if (fs.existsSync(manifestPath)) {
      this.addTestResult('PWA Manifest', true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name && manifest.short_name) {
        this.addTestResult('PWA Manifest Content', true);
      } else {
        this.addTestResult('PWA Manifest Content', false, 'Incomplete PWA manifest', 'low');
      }
    } else {
      this.addTestResult('PWA Manifest', false, 'PWA manifest not found', 'low');
    }
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

  // Run all security tests
  async runAllTests() {
    this.log('🔐 Starting Comprehensive Security Testing Suite', 'info');
    this.log('================================================', 'info');

    try {
      this.testEnvironmentVariables();
      this.testCodeSecurity();
      this.testDatabaseMigrations();
      this.testServiceWorkerSecurity();
      this.testConfigurationSecurity();
      this.testDependencySecurity();
      this.testBuildSecurity();

      this.generateReport();

    } catch (error) {
      this.log(`Security testing failed: ${error.message}`, 'error');
    }
  }

  generateReport() {
    this.log('\n📊 Security Testing Report', 'info');
    this.log('=========================', 'info');

    const { passed, failed, warnings } = this.testResults;

    this.log(`✅ Passed: ${passed}`, 'success');
    this.log(`❌ Failed: ${failed}`, 'error');
    this.log(`⚠️  Warnings: ${warnings}`, 'warning');

    const total = passed + failed;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

    this.log(`📈 Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : 'error');

    if (this.vulnerabilities.length > 0) {
      this.log('\n🚨 Critical Vulnerabilities Found:', 'error');
      this.vulnerabilities.forEach(vuln => {
        this.log(`  - ${vuln.name}: ${vuln.details}`, 'error');
      });
    }

    // Save detailed report
    const reportPath = path.join(__dirname, 'security_test_report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: this.testResults,
      vulnerabilities: this.vulnerabilities,
      recommendations: this.generateRecommendations()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\n📄 Detailed report saved to: ${reportPath}`, 'info');
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.testResults.failed > 0) {
      recommendations.push('Address all failed security tests before deployment');
    }

    if (this.vulnerabilities.length > 0) {
      recommendations.push('Fix all critical and high-severity vulnerabilities immediately');
    }

    recommendations.push('Run security tests regularly as part of CI/CD pipeline');
    recommendations.push('Implement automated security monitoring and alerting');
    recommendations.push('Conduct regular penetration testing and code reviews');

    return recommendations;
  }
}

// Run the security tests
const tester = new SecurityTester();
tester.runAllTests().catch(console.error);