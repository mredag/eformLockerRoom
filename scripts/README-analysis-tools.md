# Repository Analysis Tools

This directory contains comprehensive tools for analyzing repository files and generating cleanup recommendations.

## 🛠️ Available Tools

### 1. Main Orchestrator
- **`analyze-repository.js`** - Main script that runs all analysis tools and generates comprehensive reports

### 2. Individual Analysis Tools
- **`repository-analyzer.js`** - Complete file inventory with metadata and categorization
- **`file-categorizer.js`** - Specialized file categorization based on patterns and content
- **`dependency-scanner.js`** - Scans for file dependencies and references across the codebase
- **`safety-assessor.js`** - Evaluates files for safe removal based on multiple criteria

## 🚀 Quick Start

### Run Complete Analysis
```bash
# Run comprehensive analysis (recommended)
node scripts/analyze-repository.js

# Run analysis and generate cleanup script
node scripts/analyze-repository.js --generate-script
```

### Run Individual Tools
```bash
# File categorization only
node scripts/file-categorizer.js

# Dependency analysis only
node scripts/dependency-scanner.js

# Safety assessment only
node scripts/safety-assessor.js

# Repository inventory only
node scripts/repository-analyzer.js
```

## 📊 Generated Reports

All reports are saved to `analysis-reports/` directory:

- **`master-analysis-report.json`** - Comprehensive analysis with cleanup recommendations
- **`categorization-report.json`** - File categorization results
- **`dependencies-report.json`** - Dependency mapping and references
- **`safety-report.json`** - Safety assessment with risk scores
- **`repository-report.json`** - Complete file inventory with metadata

## 📋 Report Structure

### Master Analysis Report
```json
{
  "metadata": {
    "generatedAt": "2025-01-28T...",
    "repositoryPath": "/path/to/repo",
    "totalFiles": 1234
  },
  "summary": {
    "totalFiles": 1234,
    "categorization": { "temporary": 45, "active": 890, ... },
    "safety": { "safeToRemove": 67, "criticalFiles": 234, ... }
  },
  "insights": [
    {
      "type": "opportunity",
      "message": "Found 45 temporary files that can be safely removed",
      "impact": "high"
    }
  ],
  "cleanupPlan": {
    "immediate": { "files": [...], "description": "..." },
    "review": { "files": [...], "description": "..." },
    "careful": { "files": [...], "description": "..." },
    "preserve": { "files": [...], "description": "..." }
  },
  "spaceSavings": {
    "totalRepositorySize": 12345678,
    "potentialSavings": 2345678,
    "savingsPercentage": 19,
    "formattedSavings": "2.3 MB"
  }
}
```

## 🏷️ File Categories

### Temporary Files
- Debug scripts with timestamps
- Test files for specific issues
- Temporary HTML/JSON files
- Files with "fix", "debug", "test" in name
- **Action**: Safe to remove immediately

### Redundant Files
- Backup copies (*.bak, *-copy.js)
- Duplicate files
- Multiple versions of same content
- **Action**: Remove after verification

### Legacy Files
- Files from previous iterations
- Deprecated implementations
- Migration artifacts
- **Action**: Review and archive if valuable

### Active Files
- Production source code
- Configuration files
- Essential documentation
- **Action**: Preserve - critical for operation

## 🛡️ Safety Assessment

Each file receives a safety score (0-100):
- **0-20**: Very safe to remove
- **21-50**: Review required
- **51-80**: High risk - careful analysis needed
- **81-100**: Critical - should not be removed

### Safety Factors
1. **Category** (40% weight) - File type and purpose
2. **Dependencies** (30% weight) - How many files reference this
3. **Content** (20% weight) - Code structures and keywords
4. **Metadata** (10% weight) - Size, age, location

## 🔍 Dependency Analysis

Tracks file relationships:
- **Import/require statements** in JS/TS files
- **File references** in strings and comments
- **Link/src attributes** in HTML files
- **Path references** in JSON configuration

### Dependency Types
- **Direct dependencies**: Files this file imports/requires
- **Reverse dependencies**: Files that import/require this file
- **Orphaned files**: No dependencies and not referenced by others

## 💡 Usage Examples

### Find Safe-to-Remove Files
```bash
# Run analysis
node scripts/analyze-repository.js

# Check master-analysis-report.json for:
# - cleanupPlan.immediate.files (safe to remove now)
# - insights with type "opportunity"
```

### Analyze Specific File
```javascript
const SafetyAssessor = require('./scripts/safety-assessor');
const assessor = new SafetyAssessor();

// Get safety score for specific file
const report = await assessor.assess();
const fileScore = report.detailedScores['path/to/file.js'];
console.log(`Safety score: ${fileScore.totalScore}`);
console.log(`Reasons: ${fileScore.reasons.join(', ')}`);
```

### Check Dependencies Before Removal
```javascript
const DependencyScanner = require('./scripts/dependency-scanner');
const scanner = new DependencyScanner();

const result = await scanner.scanAll();
const dependents = result.reverseDependencies['path/to/file.js'] || [];
console.log(`Files that depend on this: ${dependents.length}`);
```

## ⚠️ Important Notes

### Before Running Analysis
1. Ensure you're in the repository root directory
2. Make sure all services are stopped (to avoid file locks)
3. Have sufficient disk space for report files

### Before Removing Files
1. **Always review the generated reports carefully**
2. **Test the system after removing files**
3. **Keep backups of removed files initially**
4. **Remove files in phases, not all at once**

### Limitations
- Binary files are not analyzed for content
- External dependencies (npm packages) are not tracked
- Dynamic imports may not be detected
- Some file references in comments might be missed

## 🔧 Customization

### Adding New File Patterns
Edit the patterns in `file-categorizer.js`:
```javascript
this.patterns = {
  temporary: [
    /^my-custom-temp-.*\.js$/,  // Add custom patterns
    // ... existing patterns
  ]
}
```

### Adjusting Safety Weights
Modify weights in `safety-assessor.js`:
```javascript
this.weights = {
  category: 0.5,      // Increase category importance
  dependencies: 0.3,
  content: 0.15,
  metadata: 0.05
};
```

### Custom Skip Directories
Add directories to skip in any tool:
```javascript
this.skipDirs = new Set([
  'node_modules', '.git', 'dist',
  'my-custom-dir'  // Add custom directories
]);
```

## 🐛 Troubleshooting

### "Permission Denied" Errors
- Ensure you have read access to all files
- Stop any running services that might lock files
- Run from repository root directory

### "Out of Memory" Errors
- Large repositories may need increased Node.js memory:
```bash
node --max-old-space-size=4096 scripts/analyze-repository.js
```

### Missing Dependencies
- Ensure Node.js is installed (version 14+)
- No external dependencies required - uses only Node.js built-ins

### Incomplete Analysis
- Check for files with special characters in names
- Verify all directories are accessible
- Review console warnings for skipped files

## 📚 Integration with Cleanup Workflow

These tools support the repository cleanup workflow:

1. **Analysis Phase** (Task 1) - Use these tools ✅
2. **Documentation Consolidation** (Task 2-4) - Use categorization results
3. **Script Optimization** (Task 5-7) - Use dependency analysis
4. **Test Organization** (Task 8-9) - Use file categorization
5. **Legacy Cleanup** (Task 10-11) - Use safety assessment
6. **Structure Standardization** (Task 12-16) - Use comprehensive analysis

The generated reports provide the foundation for all subsequent cleanup tasks.