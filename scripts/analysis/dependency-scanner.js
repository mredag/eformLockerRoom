#!/usr/bin/env node

/**
 * Dependency Scanner
 * 
 * Specialized tool for finding file references and dependencies in codebase
 * Supports multiple programming languages and file types
 */

const fs = require('fs');
const path = require('path');

class DependencyScanner {
  constructor(rootPath = '.') {
    this.rootPath = path.resolve(rootPath);
    this.dependencyMap = new Map();
    this.reverseMap = new Map();
    
    // File extensions to scan
    this.scanExtensions = new Set([
      '.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.html', '.css', '.sql'
    ]);
    
    // Directories to skip
    this.skipDirs = new Set([
      'node_modules', '.git', 'dist', 'build', 'coverage'
    ]);
  }

  /**
   * Scan all dependencies in the repository
   */
  async scanAll() {
    console.log('🔍 Scanning dependencies...');
    
    const files = this.getAllFiles();
    
    for (const filePath of files) {
      const dependencies = await this.scanFile(filePath);
      this.dependencyMap.set(filePath, dependencies);
      
      // Build reverse dependency map
      for (const dep of dependencies) {
        if (!this.reverseMap.has(dep)) {
          this.reverseMap.set(dep, []);
        }
        this.reverseMap.get(dep).push(filePath);
      }
    }
    
    return {
      dependencies: Object.fromEntries(this.dependencyMap),
      reverseDependencies: Object.fromEntries(this.reverseMap)
    };
  }

  /**
   * Get all scannable files in repository
   */
  getAllFiles(dir = this.rootPath) {
    const files = [];
    
    const scan = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(this.rootPath, fullPath);
        
        if (entry.isDirectory()) {
          if (!this.skipDirs.has(entry.name)) {
            scan(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (this.scanExtensions.has(ext)) {
            files.push(relativePath);
          }
        }
      }
    };
    
    scan(dir);
    return files;
  }

  /**
   * Scan a single file for dependencies
   */
  async scanFile(filePath) {
    const fullPath = path.join(this.rootPath, filePath);
    
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const ext = path.extname(filePath);
      
      switch (ext) {
        case '.js':
        case '.ts':
        case '.jsx':
        case '.tsx':
          return this.scanJavaScript(content, filePath);
        case '.json':
          return this.scanJSON(content, filePath);
        case '.md':
          return this.scanMarkdown(content, filePath);
        case '.html':
          return this.scanHTML(content, filePath);
        case '.css':
          return this.scanCSS(content, filePath);
        case '.sql':
          return this.scanSQL(content, filePath);
        default:
          return [];
      }
    } catch (error) {
      console.warn(`⚠️ Could not scan ${filePath}: ${error.message}`);
      return [];
    }
  }

  /**
   * Scan JavaScript/TypeScript files
   */
  scanJavaScript(content, currentPath) {
    const dependencies = new Set();
    
    // ES6 imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // CommonJS requires
    const requireRegex = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // Dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // File path references in strings
    const fileRefRegex = /['"`]([^'"`]*\.(js|ts|jsx|tsx|json|md|html|css|sql))['"`]/g;
    while ((match = fileRefRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    return Array.from(dependencies);
  }

  /**
   * Scan JSON files
   */
  scanJSON(content, currentPath) {
    const dependencies = new Set();
    
    try {
      const json = JSON.parse(content);
      this.scanObjectForPaths(json, dependencies, currentPath);
    } catch (error) {
      // Invalid JSON, skip
    }
    
    return Array.from(dependencies);
  }

  /**
   * Recursively scan object for file paths
   */
  scanObjectForPaths(obj, dependencies, currentPath) {
    if (typeof obj === 'string') {
      // Check if string looks like a file path
      if (obj.match(/\.(js|ts|jsx|tsx|json|md|html|css|sql)$/)) {
        const dep = this.resolvePath(obj, currentPath);
        if (dep) dependencies.add(dep);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => this.scanObjectForPaths(item, dependencies, currentPath));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => this.scanObjectForPaths(value, dependencies, currentPath));
    }
  }

  /**
   * Scan Markdown files
   */
  scanMarkdown(content, currentPath) {
    const dependencies = new Set();
    
    // Markdown links
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[2], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // File references in code blocks
    const codeRefRegex = /`([^`]*\.(js|ts|jsx|tsx|json|md|html|css|sql))`/g;
    while ((match = codeRefRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    return Array.from(dependencies);
  }

  /**
   * Scan HTML files
   */
  scanHTML(content, currentPath) {
    const dependencies = new Set();
    
    // Script src
    const scriptRegex = /<script[^>]+src\s*=\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // Link href
    const linkRegex = /<link[^>]+href\s*=\s*['"`]([^'"`]+)['"`]/g;
    while ((match = linkRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // Image src
    const imgRegex = /<img[^>]+src\s*=\s*['"`]([^'"`]+)['"`]/g;
    while ((match = imgRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    return Array.from(dependencies);
  }

  /**
   * Scan CSS files
   */
  scanCSS(content, currentPath) {
    const dependencies = new Set();
    
    // @import statements
    const importRegex = /@import\s+['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    // url() references
    const urlRegex = /url\s*\(\s*['"`]?([^'"`\)]+)['"`]?\s*\)/g;
    while ((match = urlRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    return Array.from(dependencies);
  }

  /**
   * Scan SQL files
   */
  scanSQL(content, currentPath) {
    const dependencies = new Set();
    
    // Look for file references in comments or strings
    const fileRefRegex = /['"`]([^'"`]*\.(js|ts|jsx|tsx|json|md|html|css|sql))['"`]/g;
    let match;
    while ((match = fileRefRegex.exec(content)) !== null) {
      const dep = this.resolvePath(match[1], currentPath);
      if (dep) dependencies.add(dep);
    }
    
    return Array.from(dependencies);
  }

  /**
   * Resolve relative path to absolute path within repository
   */
  resolvePath(refPath, currentPath) {
    // Skip external URLs and absolute paths
    if (refPath.startsWith('http') || refPath.startsWith('//') || path.isAbsolute(refPath)) {
      return null;
    }
    
    let resolvedPath;
    
    if (refPath.startsWith('./') || refPath.startsWith('../')) {
      // Relative path
      resolvedPath = path.normalize(path.join(path.dirname(currentPath), refPath));
    } else {
      // Could be relative to root or node_modules
      resolvedPath = refPath;
    }
    
    // Check if file exists in repository
    const fullPath = path.join(this.rootPath, resolvedPath);
    
    // Try with and without extensions
    const possiblePaths = [
      resolvedPath,
      resolvedPath + '.js',
      resolvedPath + '.ts',
      resolvedPath + '.json',
      path.join(resolvedPath, 'index.js'),
      path.join(resolvedPath, 'index.ts')
    ];
    
    for (const possiblePath of possiblePaths) {
      const fullPossiblePath = path.join(this.rootPath, possiblePath);
      if (fs.existsSync(fullPossiblePath) && fs.statSync(fullPossiblePath).isFile()) {
        return possiblePath;
      }
    }
    
    return null;
  }

  /**
   * Check if a file can be safely removed
   */
  canRemoveSafely(filePath) {
    const dependents = this.reverseMap.get(filePath) || [];
    return {
      safe: dependents.length === 0,
      dependentCount: dependents.length,
      dependents: dependents
    };
  }

  /**
   * Get all files that would be affected by removing a file
   */
  getImpactAnalysis(filePath) {
    const directDependents = this.reverseMap.get(filePath) || [];
    const allAffected = new Set(directDependents);
    
    // Recursively find all affected files
    const findAffected = (file) => {
      const deps = this.reverseMap.get(file) || [];
      for (const dep of deps) {
        if (!allAffected.has(dep)) {
          allAffected.add(dep);
          findAffected(dep);
        }
      }
    };
    
    for (const dep of directDependents) {
      findAffected(dep);
    }
    
    return {
      directDependents,
      allAffected: Array.from(allAffected),
      impactLevel: allAffected.size === 0 ? 'none' : 
                   allAffected.size <= 3 ? 'low' : 
                   allAffected.size <= 10 ? 'medium' : 'high'
    };
  }
}

// CLI interface
if (require.main === module) {
  const scanner = new DependencyScanner();
  
  scanner.scanAll()
    .then(result => {
      const outputPath = 'dependency-analysis.json';
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      
      console.log(`📊 Dependency analysis saved to: ${outputPath}`);
      console.log(`Total files scanned: ${Object.keys(result.dependencies).length}`);
      console.log(`Files with dependencies: ${Object.keys(result.dependencies).filter(f => result.dependencies[f].length > 0).length}`);
      console.log(`Files being referenced: ${Object.keys(result.reverseDependencies).length}`);
    })
    .catch(error => {
      console.error('❌ Dependency scan failed:', error);
      process.exit(1);
    });
}

module.exports = DependencyScanner;