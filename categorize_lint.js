const fs = require('fs');

try {
  const data = fs.readFileSync('lint.json', 'utf8');
  const results = JSON.parse(data);

  const categories = {
    "API request/response typing issues": { count: 0, files: {} },
    "React component props/state issues": { count: 0, files: {} },
    "Supabase/edge function typing issues": { count: 0, files: {} },
    "Utility/helper function issues": { count: 0, files: {} },
    "Uncategorized": { count: 0, files: {} }
  };

  for (const result of results) {
    if (result.errorCount === 0 && result.warningCount === 0) continue;
    
    let category = "Uncategorized";
    const fp = result.filePath.replace(/\\/g, '/');

    if (fp.includes('/supabase/')) {
      category = "Supabase/edge function typing issues";
    } else if (fp.includes('/server/') || fp.includes('/api/')) {
      category = "API request/response typing issues";
    } else if (fp.includes('/src/components/') || fp.includes('/src/pages/') || fp.includes('App.tsx') || fp.includes('main.tsx')) {
      category = "React component props/state issues";
    } else if (fp.includes('/src/lib/') || fp.includes('/src/utils/') || fp.includes('/src/hooks/')) {
      category = "Utility/helper function issues";
    } else {
      category = "Uncategorized";
    }

    const totalIssues = result.errorCount + result.warningCount;
    categories[category].count += totalIssues;
    
    // Group by file path relative to root
    const relPath = fp.split('Retail-store-pos-system-main/')[1] || fp;
    categories[category].files[relPath] = totalIssues;
  }

  console.log(JSON.stringify(categories, null, 2));

} catch (err) {
  console.error(err);
}
